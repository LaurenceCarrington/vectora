import {getRecoveryScope,rememberRecovery,MAX_RECOVERY_SESSIONS,sessionMetaKey,recoveryDbKey,recoveryJournalKey,type RecoveryScope} from './storage/recoverySession';
import {prepareRecovery,type PreparedRecovery} from './storage/recoveryValidation';

/** Local working copies; no native-file or IndexedDB schema migration. */
export interface RecoveryTab {id:string;contents:string;filename:string;dirty:boolean}
export interface RecoveryData {contents:string;filename:string;dirty:boolean;draft?:{content:string;sourceId:string|null;point:[number,number]|null};tabs?:RecoveryTab[];activeTabId?:string}
interface RecoveryRecord {version:1;time:number;id:string;data:RecoveryData;session?:string;writer?:string;sequence?:number}
interface RejectedCandidate {source:string;raw:unknown;reason:string}
export type RecoverySelection=
 | {status:'valid';prepared:PreparedRecovery;issues:string[];fallback:boolean}
 | {status:'missing'|'empty'|'invalid'|'unavailable';issues:string[]};

const MAX_QUARANTINE=8,MAX_RECOVERY_TIME=8640000000000000;
const sourceOrder=['journal','database','previous journal','previous database','superseded database'];
function storageData(data:RecoveryData):RecoveryData {
 return Array.isArray(data.tabs)&&data.tabs.some(tab=>tab?.id===data.activeTabId&&tab?.contents===data.contents)?{...data,contents:''}:data;
}
/** A public read result must not alias the retained rollback generation. */
function retainedData(data:RecoveryData):RecoveryData {
 return storageData({...data,tabs:data.tabs?.map(tab=>({...tab})),draft:data.draft?{...data.draft,point:data.draft.point?[...data.draft.point] as [number,number]:null}:undefined});
}
function record(value:unknown):RecoveryRecord|null {
 if(!value||typeof value!=='object')return null;
 const r=value as RecoveryRecord,d=r.data;
 if(r.version!==1||!Number.isSafeInteger(r.time)||r.time<0||r.time>MAX_RECOVERY_TIME||typeof r.id!=='string'||r.id.length>1000||!d||typeof d.contents!=='string'||typeof d.filename!=='string'||d.filename.length>1000||typeof d.dirty!=='boolean'||r.sequence!==undefined&&(!Number.isSafeInteger(r.sequence)||r.sequence<1)||r.session!==undefined&&typeof r.session!=='string'||r.writer!==undefined&&typeof r.writer!=='string')return null;
 const active=d.contents===''&&Array.isArray(d.tabs)?d.tabs.find(tab=>tab?.id===d.activeTabId):undefined;
 return {...r,data:active&&typeof active.contents==='string'?{...d,contents:active.contents}:{...d}};
}
function parse(raw:unknown,source:string):RecoveryRecord|null {
 try{return record(source.includes('journal')?JSON.parse(raw as string):raw);}catch{return null;}
}
function valid(raw:unknown,source:string):RecoveryRecord|null {
 const r=parse(raw,source);if(!r)return null;
 try{const p=prepareRecovery(r.data);return p.issues.length?null:{...r,data:storageData(p.data)};}catch{return null;}
}
function archive(existing:unknown,add:RejectedCandidate[]):RejectedCandidate[] {
 if(existing!==undefined&&existing!==null&&!Array.isArray(existing))throw new Error('The recovery quarantine is invalid.');
 const entries:RejectedCandidate[]=Array.isArray(existing)?[...existing]:[];
 for(const item of add){const key=JSON.stringify(item);if(!entries.some(old=>JSON.stringify(old)===key))entries.push(item);}
 // Never evict a retained failed copy just to claim that the next backup worked.
 if(entries.length>MAX_QUARANTINE)throw new Error('Recovery quarantine is full.');
 return entries;
}
export class DocumentRecovery {
 private database:Promise<IDBDatabase>;
 private initialized:Promise<void>;
 private scope:RecoveryScope|null=null;
 private allowed=false;
 private queued=0;
 protected adoptingLegacy=false;
 private journalKeys=new Map<string,string>();
 private dbKey(key:string):IDBValidKey{return recoveryDbKey(this.scope?.id??null,key);}
 private journalKey(key:'pending'|'previous'|'invalid'):string{return recoveryJournalKey(this.scope?.id??null,this.scope?.writer??'',key);}
 close():void {void this.database.then(db=>db.close()).catch(()=>{});this.connection=null;}
 get sessionId():string|null{return this.scope?.id??null;}
 /** Retry a failed reservation only after an explicit New/Open, never startup. */
 resume():void {
  if(this.allowed||this.options.readOnly||this.options.legacy||!this.scope)return;
  this.initialized=this.initialized.catch(()=>{}).then(async()=>{await this.claim(await this.database);});
  void this.initialized.catch(()=>this.warning());
 }
 /** Adopt rejected source bytes into this namespace without deleting originals. */
 retainRejected(source:DocumentRecovery):void {this.rejected=[...this.rejected,...source.rejected.map(r=>({...r,source:`retained ${r.source}`}))];}
 private async claim(db:IDBDatabase):Promise<void>{
  if(this.options.readOnly||this.options.legacy)return;if(!this.scope){this.allowed=true;return;}
  const scope=this.scope;
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents'),q=store.get(sessionMetaKey(scope.id));
   q.onsuccess=()=>{
    const old=q.result;if(Number.isSafeInteger(old?.sequence)&&old.sequence>=0)scope.sequence=Math.max(scope.sequence,old.sequence);
    if(old&&old.writer!==scope.writer&&!(scope.fenced&&scope.source===scope.id)){tx.abort();return;}
    const put=()=>store.put({...old,id:scope.id,writer:scope.writer,created:old?.created??Date.now(),updated:old?.updated??Date.now()},sessionMetaKey(scope.id));
    if(old)put();else{const keys=store.getAllKeys();keys.onsuccess=()=>{if(keys.result.filter(k=>Array.isArray(k)&&k[0]==='workspace').length>=MAX_RECOVERY_SESSIONS){tx.abort();return;}put();};}
   };
   tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error('Browser recovery is unavailable or its 32-workspace limit was reached. Retained workspaces have been kept; use Save or explicitly discard an inactive workspace.'));
  });this.allowed=true;
 }
 private connection:IDBDatabase|null=null;
 private last='';
 private inputLast='';
 private bytes=0;
 private time=0;
 private generation=0;
 private warned=false;
 private knownGood:RecoveryRecord|null=null;
 private rejected:RejectedCandidate[]=[];
 private pending=0;
 private promotion=false;
 get usageBytes():number{return this.bytes;}
 get needsRetry():boolean{return this.last==='';}
 private usage(bytes:number):void {this.bytes=bytes;window.dispatchEvent(new Event('vectora-recovery-change'));}
 private warning():void {if(!this.warned){this.warned=true;this.warn('Browser recovery could not be saved. Existing copies have been kept. Use Save to keep a copy of your drawing.');}}
 constructor(private warn:(message:string)=>void,private options:{legacy?:boolean;id?:string;readOnly?:boolean}={}){
  this.database=new Promise((resolve,reject)=>{
   const request=indexedDB.open('vectora-recovery',1),timer=setTimeout(()=>reject(new Error('Browser storage did not respond.')),4000);
   request.onupgradeneeded=()=>request.result.createObjectStore('documents');
   request.onsuccess=()=>{clearTimeout(timer);this.connection=request.result;request.result.onversionchange=()=>{request.result.close();this.connection=null;};resolve(request.result);};
   request.onerror=request.onblocked=()=>{clearTimeout(timer);reject(request.error??new Error('Browser storage is unavailable.'));};
  });
  void this.database.catch(()=>{});
  const database=this.database;
  this.initialized=(async()=>{this.scope=this.options.legacy?null:this.options.id?{id:this.options.id,writer:'reader',source:null,active:false,fenced:false,sequence:0}:await getRecoveryScope();await this.claim(await database);})();
  void this.initialized.catch(()=>{});
 }
 /** Read-only collection, then native validation before selecting a candidate.
  * Failed bytes stay in their original location until an archive can commit. */
 async readValidated(ready?:(prepared:PreparedRecovery)=>Promise<void>):Promise<RecoverySelection>{
  const generation=this.generation,raws:{source:string;raw:unknown}[]=[],issues:string[]=[];
  let unavailable=false;
  try{await this.initialized;}catch{unavailable=true;issues.push('Recovery ownership/storage could not be established.');}
  if(!this.scope&&!this.options.legacy)return {status:'unavailable',issues};
  const journalEntries:[string,string][]=[];
  if(this.scope){
   const prefix=`vectora.recovery.session.${this.scope.id}.`;
   try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;if(key.startsWith(prefix)&&(/\.(pending|previous)$/.test(key)))journalEntries.push([key,key.endsWith('.pending')?'journal':'previous journal']);}}catch{unavailable=true;}
  }else journalEntries.push([this.journalKey('pending'),'journal'],[this.journalKey('previous'),'previous journal']);
  this.journalKeys.clear();
  for(const [key,label] of journalEntries){const source=this.journalKeys.has(label)?`${label}:${key}`:label;this.journalKeys.set(source,key);
   try{const raw=localStorage.getItem(key);if(raw!==null)raws.push({source,raw});}catch{unavailable=true;issues.push(`Could not read ${source}.`);}
  }
  try{
   const db=await this.database,values=await new Promise<unknown[]>((resolve,reject)=>{
    const tx=db.transaction('documents'),values:unknown[]=[];
    for(const [i,key] of ['current','previous','superseded'].entries()){const q=tx.objectStore('documents').get(this.dbKey(key));q.onsuccess=()=>{values[i]=q.result;};}
    tx.oncomplete=()=>resolve(values);tx.onerror=tx.onabort=()=>reject(tx.error);
   });
   values.forEach((raw,i)=>{if(raw!==undefined)raws.push({source:['database','previous database','superseded database'][i],raw});});
  }catch{unavailable=true;issues.push('Could not read the recovery database.');}
  // At the timestamp boundary, current copies outrank retained predecessors.
  const candidates=raws.map(item=>({...item,record:parse(item.raw,item.source)})).sort((a,b)=>(a.record?.sequence!==undefined&&b.record?.sequence!==undefined?(b.record.sequence-a.record.sequence):((b.record?.time??-1)-(a.record?.time??-1)))||sourceOrder.indexOf(a.source.split(':')[0])-sourceOrder.indexOf(b.source.split(':')[0]));
  const rejected:RejectedCandidate[]=[];let chosen:{record:RecoveryRecord;prepared:PreparedRecovery;index:number;source:string}|undefined;
  for(const [index,candidate] of candidates.entries()){
   try{
    if(!candidate.record||this.scope&&candidate.record.session!==undefined&&candidate.record.session!==this.scope.id)throw new Error('Invalid recovery envelope or session.');
    if(candidate.record.sequence!==undefined&&(!Number.isSafeInteger(candidate.record.sequence)||candidate.record.sequence<1))throw new Error('Invalid recovery sequence.');
    const prepared=prepareRecovery(candidate.record.data);
    if(!chosen){await ready?.(prepared);chosen={record:candidate.record,prepared,index,source:candidate.source};}
    else if(chosen.prepared.invalidTabIds.length){
     // Recover only explicitly damaged IDs. Older tabs absent from the newer
     // manifest may have been intentionally closed and must not reappear.
     const fallback=prepared.tabs.filter(t=>chosen!.prepared.invalidTabIds.includes(t.tab.id));
     if(fallback.length){
      await ready?.({...prepared,tabs:fallback});
      const merged=chosen.prepared;merged.tabs.push(...fallback);
      merged.invalidTabIds=merged.invalidTabIds.filter(id=>!fallback.some(t=>t.tab.id===id));
      const active=merged.tabs.find(t=>t.tab.id===chosen!.record.data.activeTabId)??merged.tabs[0],before=merged.data;
      merged.data={...before,contents:active.tab.contents,filename:active.tab.filename,dirty:active.tab.dirty,tabs:merged.tabs.map(t=>t.tab),activeTabId:active.tab.id,draft:before.activeTabId===active.tab.id?before.draft:undefined};
     }
    }
    if(prepared.issues.length)throw new Error(prepared.issues.join(' '));
   }catch(error){const reason=error instanceof Error?error.message:String(error);issues.push(`${candidate.source}: ${reason}`);rejected.push({source:candidate.source,raw:candidate.raw,reason});}
  }
  if(generation===this.generation&&this.pending===0){
   this.rejected=rejected;
   this.time=Math.max(this.time,...candidates.map(c=>c.record?.time??0));
   if(this.scope)this.scope.sequence=Math.max(this.scope.sequence,...candidates.map(c=>Number.isSafeInteger(c.record?.sequence)?c.record!.sequence!:0));
   if(chosen){this.promotion=chosen.source!=='database';this.knownGood={...chosen.record,data:retainedData(chosen.prepared.data)};this.last=JSON.stringify(this.knownGood.data);this.usage(new Blob([JSON.stringify(this.knownGood)]).size);}
  }
  return chosen?{status:'valid',prepared:chosen.prepared,issues,fallback:chosen.index>0||rejected.length>0}:{status:raws.length?'invalid':unavailable?'unavailable':'missing',issues};
 }
 /** Compatibility API used by existing callers; selection is semantically validated. */
 async read():Promise<RecoveryData|null>{const result=await this.readValidated();return result.status==='valid'?result.prepared.data:null;}
 write(data:RecoveryData):void {
  if(this.options.readOnly||this.options.legacy)return;
  if(!this.allowed){const queued=++this.queued;let copy:RecoveryData;try{copy=structuredClone(data);}catch{this.warning();return;}void this.initialized.then(()=>{if(queued===this.queued)this.write(copy);}).catch(()=>{this.last='';this.warning();});return;}
  if(this.scope&&this.scope.sequence>=Number.MAX_SAFE_INTEGER){this.last='';this.warning();return;}
  if(this.scope&&!this.scope.active){this.warning();return;}
  const JOURNAL=this.journalKey('pending'),PREVIOUS=this.journalKey('previous'),INVALID=this.journalKey('invalid');
  let input:string;
  try{input=JSON.stringify(storageData(data));}catch{this.last='';this.warning();return;}
  if(this.last!==''&&input===this.inputLast&&(this.pending>0||(!this.rejected.length&&!this.promotion)))return;
  let compact:RecoveryData;
  try{const prepared=prepareRecovery(data);if(prepared.issues.length)throw new Error(prepared.issues.join(' '));compact=storageData(prepared.data);}
  catch{this.last='';this.warning();return;}
  const content=JSON.stringify(compact);if(content===this.last&&(this.pending>0||(!this.rejected.length&&!this.promotion)))return;
  const generation=++this.generation,previous=this.knownGood,rejected=[...this.rejected];
  // Saturate instead of producing an envelope that our own reader rejects.
  this.inputLast=input;this.last=content;this.pending++;this.time=Math.min(MAX_RECOVERY_TIME,Math.max(Date.now(),this.time+1));
  const current:RecoveryRecord={version:1,time:this.time,id:crypto.randomUUID(),data:compact,...(this.scope?{session:this.scope.id,writer:this.scope.writer,sequence:++this.scope.sequence}:{})},serialized=JSON.stringify(current),bytes=new Blob([serialized]).size;
  let journal=false;
  try{
   const old=localStorage.getItem(JOURNAL),prior=localStorage.getItem(PREVIOUS),bad:RejectedCandidate[]=rejected.filter(r=>r.source.includes('journal'));
   if(old!==null){
    if(valid(old,'journal')){
     if(prior!==null&&!valid(prior,'previous journal'))bad.push({source:'previous journal',raw:prior,reason:'Invalid superseded journal.'});
    }else bad.push({source:'journal',raw:old,reason:'Invalid superseded journal.'});
   }
   if(bad.length){const existing=localStorage.getItem(INVALID);localStorage.setItem(INVALID,JSON.stringify(archive(existing?JSON.parse(existing):undefined,bad)));}
   if(old!==null&&valid(old,'journal'))localStorage.setItem(PREVIOUS,old);
   localStorage.setItem(JOURNAL,serialized);journal=true;this.knownGood=current;if(this.scope)rememberRecovery(this.scope);this.usage(bytes);
  }catch{/* A failed archive/journal never removes the original copy. */}
  const store=(db:IDBDatabase)=>new Promise<boolean>((resolve,reject)=>{
   // A delayed database-open callback must not enqueue an old state after a
   // newer ready-connection transaction. Started transactions keep IDB order.
   if(generation!==this.generation){resolve(false);return;}
   let tx:IDBTransaction;
   try{
    tx=db.transaction('documents','readwrite');const objects=tx.objectStore('documents');
    const enqueue=()=>{
    const fail=()=>{try{tx.abort();}catch{/* Already aborted. */}};
    const q=objects.get(this.dbKey('quarantine'));q.onsuccess=()=>{try{if(rejected.length)objects.put(archive(q.result,rejected),this.dbKey('quarantine'));}catch{fail();}};
    const old=objects.get(this.dbKey('current'));old.onsuccess=()=>{try{
     // Preserve even an unexamined predecessor (e.g. a direct writer without
     // read). This is not promoted as valid until the next read validates it.
     if(old.result&&old.result.id!==previous?.id&&old.result.id!==current.id&&!rejected.some(r=>r.source==='database'&&JSON.stringify(r.raw)===JSON.stringify(old.result)))objects.put(old.result,this.dbKey('superseded'));
    }catch{fail();}};
    if(rejected.some(r=>r.source==='superseded database'))objects.delete(this.dbKey('superseded'));
    if(previous)objects.put(previous,this.dbKey('previous'));else if(rejected.some(r=>r.source==='previous database'))objects.delete(this.dbKey('previous'));
    objects.put(current,this.dbKey('current'));
    if(this.adoptingLegacy&&this.scope)objects.put({id:this.scope.id,complete:true},['legacy','adoption']);
    };
    if(this.scope){const scope=this.scope,q=objects.get(sessionMetaKey(scope.id));q.onsuccess=()=>{if(!scope.active||q.result?.writer!==scope.writer||(q.result?.sequence??0)>=(current.sequence??0)){failTransaction();return;}enqueue();objects.put({...q.result,sequence:current.sequence,updated:current.time,labels:compact.tabs?.map(t=>t.filename)??[compact.filename],closed:false},sessionMetaKey(scope.id));};}else enqueue();
    function failTransaction(){try{tx.abort();}catch{/* Already stopped. */}}
    tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>reject(tx.error??new Error('Recovery transaction aborted.'));
   }catch(error){try{tx!.abort();}catch{/* Transaction may not exist. */}reject(error);}
  });
  // Keep the synchronous journal and immediate ready-DB transaction available
  // for navigation; validation above never awaits font/network resources.
  void (this.connection?store(this.connection):this.database.then(store)).then(stored=>{
   if(!stored)return;
   if(this.scope)rememberRecovery(this.scope);
   if(generation===this.generation){this.knownGood=current;this.rejected=[];this.promotion=false;this.usage(bytes);}
   try{
    const raw=localStorage.getItem(JOURNAL);
    if(parse(raw,'journal')?.id===current.id||rejected.some(r=>r.source==='journal'&&r.raw===raw))localStorage.removeItem(JOURNAL);
    const prior=localStorage.getItem(PREVIOUS);if(rejected.some(r=>r.source==='previous journal'&&r.raw===prior))localStorage.removeItem(PREVIOUS);
    if(this.scope)for(const [source,key] of this.journalKeys){const value=localStorage.getItem(key),old=parse(value,source);if(rejected.some(r=>r.source===source&&r.raw===value)||old&&valid(value,source)&&(old.sequence===undefined||old.sequence<=(current.sequence??0)))localStorage.removeItem(key);}
   }catch{/* Committed DB data is safe even if journal cleanup is unavailable. */}
  }).catch(()=>{if(generation===this.generation){if(!journal||rejected.length||this.promotion){this.last='';this.warning();}}}).finally(()=>{this.pending--;});
 }
}
