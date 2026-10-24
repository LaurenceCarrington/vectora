import {nonemptyRecovery} from './recoveryValidation';
import {DocumentRecovery,type RecoverySelection} from '../documentRecovery';
import {getRecoveryScope,sessionMetaKey,sessionLockName,validSessionId} from './recoverySession';
/** Low-level storage can be valid but contain no work to restore. */
function restorableSelection(result:RecoverySelection):RecoverySelection {
 if(result.status!=='valid')return result;
 const prepared=nonemptyRecovery(result.prepared);
 return prepared?{...result,prepared}:{status:'empty',issues:result.issues};
}
export interface RecoveryWorkspace {id:string;label:string;status:string;active:boolean|null;count:number;time:number;issues:string[]}
function openDatabase():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 let finished=false;
 const fail=(error:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);reject(error);};
 const timer=setTimeout(()=>fail(new Error('Recovery storage did not respond.')),4000),q=indexedDB.open('vectora-recovery',1);
 q.onupgradeneeded=()=>q.result.createObjectStore('documents');
 q.onsuccess=()=>{if(finished){q.result.close();return;}finished=true;clearTimeout(timer);resolve(q.result);};
 q.onerror=q.onblocked=()=>fail(q.error??new Error('Recovery storage unavailable.'));
});}
async function metadata():Promise<{ids:string[];adoption:any}>{const db=await openDatabase();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('documents'),store=tx.objectStore('documents'),keys=store.getAllKeys(),claim=store.get(['legacy','adoption']);tx.oncomplete=()=>resolve({ids:[...new Set(keys.result.flatMap(k=>Array.isArray(k)&&['workspace','recovery'].includes(String(k[0]))&&validSessionId(k[1])?[k[1]]:[]))],adoption:claim.result});tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function listRecoveryWorkspaces():Promise<RecoveryWorkspace[]>{
 const ids=new Set<string>();let adoption:any;
 try{const data=await metadata();data.ids.forEach(id=>ids.add(id));adoption=data.adoption;}catch{/* Journal-only recovery remains discoverable. */}
 try{for(let i=0;i<localStorage.length;i++){const match=localStorage.key(i)?.match(/^vectora\.recovery\.session\.([\w-]+)\./);if(match)ids.add(match[1]);}}catch{/* Database may still work. */}
 let held:Set<string>|null=null;try{if(navigator.locks)held=new Set((await navigator.locks.query()).held?.map(l=>l.name!));}catch{/* Unknown never means inactive. */}
 const scope=await getRecoveryScope(),entries:RecoveryWorkspace[]=[];
 for(const id of [...ids,'legacy']){
  if(id===scope.id)continue;
  const reader=new DocumentRecovery(()=>{},id==='legacy'?{legacy:true,readOnly:true}:{id,readOnly:true});
  const result=await reader.readValidated();reader.close();
  if(id==='legacy'&&(result.status==='missing'||result.status==='unavailable'))continue;
  const restorable=restorableSelection(result),data=restorable.status==='valid'?restorable.prepared.data:result.status==='valid'?result.prepared.data:null;
  entries.push({id,label:data?.tabs?.map(t=>t.filename).join(', ')||data?.filename||(id==='legacy'?'Legacy browser recovery':'Retained workspace'),status:restorable.status,active:id==='legacy'?(adoption?.id&&held?held.has(sessionLockName(adoption.id)):null):held?held.has(sessionLockName(id)):null,count:restorable.status==='valid'?restorable.prepared.tabs.length:0,time:0,issues:result.issues});
 }
 return entries;
}
/** No automatic age eviction. Only an explicit confirmed discard may remove an
 * inactive namespace, and its browser lock must be acquired for the whole delete. */
export async function discardRecoveryWorkspace(id:string):Promise<void>{
 const scope=await getRecoveryScope();if(!validSessionId(id)||id==='legacy'||id===scope.id||!navigator.locks)throw new Error('This workspace cannot safely be discarded.');
 await navigator.locks.request(sessionLockName(id),{ifAvailable:true},async lock=>{
  if(!lock)throw new Error('That workspace is open in another window. It has been kept.');
  const db=await openDatabase();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents'),keys=store.getAllKeys();keys.onsuccess=()=>{for(const key of keys.result)if(Array.isArray(key)&&((key[0]==='recovery'&&key[1]===id)||(key[0]==='workspace'&&key[1]===id)))store.delete(key);};tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  const prefix=`vectora.recovery.session.${id}.`,keys:string[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;if(key.startsWith(prefix))keys.push(key);}keys.forEach(key=>localStorage.removeItem(key));
 });
}
export class WorkspaceRecovery extends DocumentRecovery {
 private chooser=new RecoveryChooser();
 constructor(private report:(message:string)=>void){super(report);}
 override async readValidated(ready?:Parameters<DocumentRecovery['readValidated']>[0]):Promise<RecoverySelection>{
  const prepareReady:typeof ready=ready?async prepared=>{const filtered=nonemptyRecovery(prepared);if(filtered)await ready(filtered);}:undefined;
  const own=restorableSelection(await super.readValidated(prepareReady)),scope=await getRecoveryScope();
  let requested=new URL(location.href).searchParams.get('recover');if(requested&&!validSessionId(requested))requested=null;if(requested){const url=new URL(location.href);url.searchParams.delete('recover');history.replaceState(history.state,'',url);}
  if(!requested&&(own.status==='valid'||own.status==='empty'))return own;
  if(!requested&&scope.source&&scope.source!==scope.id)requested=scope.source;
  let legacyStatus:RecoverySelection['status']='missing';
  if(!requested&&own.status==='missing'){const legacy=new DocumentRecovery(()=>{},{legacy:true,readOnly:true});legacyStatus=restorableSelection(await legacy.readValidated()).status;legacy.close();}
  if(!requested&&own.status==='missing'&&!['missing','empty','unavailable'].includes(legacyStatus)){
   try{const db=await openDatabase();try{requested=await new Promise<string|null>((resolve,reject)=>{const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents'),q=store.get(['legacy','adoption']);let selected:string|null=null;q.onsuccess=()=>{if(!q.result){store.put({id:scope.id,complete:false},['legacy','adoption']);selected='legacy';}};tx.oncomplete=()=>resolve(selected);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}}catch{/* Do not claim an unchecked legacy source. */}
  }
  if(requested){
   const reader=new DocumentRecovery(()=>{},requested==='legacy'?{legacy:true,readOnly:true}:{id:requested,readOnly:true});
   const result=restorableSelection(await reader.readValidated(prepareReady));
   if(result.status!=='missing'){this.retainRejected(reader);reader.close();this.adoptingLegacy=requested==='legacy';return result;}reader.close();
  }
  const available=(await listRecoveryWorkspaces()).filter(w=>w.status!=='empty'&&w.active!==true&&(w.id!=='legacy'||requested!=='legacy'));
  if(available.length){const id=await this.chooser.choose(available,false);if(id){const reader=new DocumentRecovery(()=>{},id==='legacy'?{legacy:true,readOnly:true}:{id,readOnly:true}),result=restorableSelection(await reader.readValidated(prepareReady));this.retainRejected(reader);reader.close();this.adoptingLegacy=id==='legacy';return result;}}
  return own;
 }
 async browse():Promise<void>{try{await this.chooser.choose(await listRecoveryWorkspaces(),true);}catch(error){this.report((error as Error).message);}}
}
export class RecoveryChooser {
 private dialog=document.createElement('dialog');
 constructor(){this.dialog.id='recovery-workspaces-dialog';this.dialog.className='delete-dialog menu-surface';this.dialog.setAttribute('aria-labelledby','recovery-workspaces-title');document.body.append(this.dialog);this.dialog.addEventListener('keydown',e=>e.stopPropagation());}
 choose(entries:RecoveryWorkspace[],newWindow:boolean):Promise<string|null>{
  if(this.dialog.open)return Promise.resolve(null);
  const d=this.dialog;d.replaceChildren();const title=document.createElement('h2');title.id='recovery-workspaces-title';title.textContent='Browser recovery';d.append(title);
  const intro=document.createElement('p');intro.textContent=newWindow?'Open a retained workspace in a separate window. Your current drawing stays here.':'Choose a retained workspace, or start without restoring. Other copies are kept.';d.append(intro);
  const list=document.createElement('div');list.className='recovery-workspace-list';d.append(list);
  return new Promise(resolve=>{
   const finish=(id:string|null)=>{d.close();resolve(id);};
   for(const entry of entries){
    const row=document.createElement('section'),label=document.createElement('h3'),status=document.createElement('p'),open=document.createElement('button'),remove=document.createElement('button');row.dataset.recoverySession=entry.id;
    label.textContent=entry.label;status.textContent=`${entry.active===true?'Open in another window':entry.active===null?'Activity unknown':'Closed or interrupted'} · ${entry.status==='valid'?`${entry.count} document${entry.count===1?'':'s'} recoverable`:entry.status==='empty'?'No objects to recover':entry.status==='missing'?'No saved drawing':entry.status==='invalid'?'Damaged copies retained':'Storage unavailable'} · ${entry.id==='legacy'?'Legacy':entry.id.slice(0,8)}`;
    open.type=remove.type='button';open.className=remove.className='button';open.textContent=newWindow?'Open a copy':'Restore workspace';open.disabled=entry.status!=='valid'||entry.count===0;open.onclick=()=>{if(newWindow){const url=new URL(location.href);url.searchParams.set('recover',entry.id);window.open(url.href,'_blank','noopener');}else finish(entry.id);};
    remove.textContent='Discard';remove.disabled=entry.id==='legacy'||entry.active!==false;
    remove.onclick=async()=>{if(!window.confirm(`Discard the retained recovery for “${entry.label}”? This cannot be undone.`))return;try{await discardRecoveryWorkspace(entry.id);row.remove();}catch(error){status.textContent=(error as Error).message;}};
    row.append(label,status,open,remove);list.append(row);
   }
   if(!entries.length){const p=document.createElement('p');p.textContent='No other retained workspaces.';list.append(p);}
   const close=document.createElement('button');close.type='button';close.className='button';close.textContent=newWindow?'Close':'Start without restoring';close.onclick=()=>finish(null);d.append(close);d.oncancel=e=>{e.preventDefault();finish(null);};d.showModal();close.focus();
  });
 }
}
