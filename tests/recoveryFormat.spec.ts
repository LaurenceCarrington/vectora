import {test,expect} from './fixtures';

test('A recovery record with a malformed tab still exposes the valid working document',async({page})=>{
 await page.goto('http://127.0.0.1:5174');
 const contents=await page.evaluate(async()=>{const {encodeDocument}=await import('/src/documentFormat.ts');return encodeDocument((window as any).__vectora,false);});
 const recovered=await page.evaluate(async contents=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
  const {DocumentRecovery}=await import('/src/documentRecovery.ts');
  localStorage.setItem(__recoveryLoc.journal,JSON.stringify({version:1,time:Date.now()+10000,id:'malformed-tab',data:{contents,filename:'Recovered.vectora',dirty:false,activeTabId:'valid',tabs:[null,{id:'valid',contents,filename:'Recovered.vectora',dirty:false}]}}));
  return (await new DocumentRecovery(()=>{}).read())?.contents;
 },contents);
 expect(recovered).toBe(contents);
});

test('Font cleanup during navigation cannot overwrite the captured text draft',async({page})=>{
 let rejectFont:()=>Promise<void>=async()=>{throw new Error('Font was not requested');};
 await page.route('**/fonts/Lato-Regular.ttf',route=>{rejectFont=()=>route.abort();});
 // Wait for the usable DOM, not the deliberately blocked artwork font.
 await page.goto('http://127.0.0.1:5174',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Text',exact:true}).click();await page.mouse.click(500,400);await page.locator('#inline-text').fill('Keep this draft');
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload')));await rejectFont();await expect(page.locator('#inline-text')).toBeHidden();
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 const draft=await page.evaluate(async()=>{const {DocumentRecovery}=await import('/src/documentRecovery.ts');return(await new DocumentRecovery(()=>{}).read())?.draft?.content;});
 expect(draft).toBe('Keep this draft');
 // If navigation is cancelled, a real subsequent edit resumes normal caching.
 await page.locator('#cad-canvas').focus();await page.keyboard.press('v');
 await page.evaluate(()=>{const e=(window as any).__vectora,p=(window as any).__paper;e.addShape(new p.Path.Rectangle({insert:false,rectangle:[30,30,20,20]}),'After cancellation');});
 await expect.poll(()=>page.evaluate(async()=>{const {DocumentRecovery}=await import('/src/documentRecovery.ts');const data=await new DocumentRecovery(()=>{}).read();return {draft:data?.draft,objects:JSON.parse(data!.contents).layers.flatMap((l:any)=>l.objects).length};})).toEqual({draft:undefined,objects:1});
});

const RECOVERY_URL='http://127.0.0.1:5174';
async function seedRecovery(page:import('@playwright/test').Page,journal:'good'|'bad'|'missing',database:'good'|'bad'|'missing',newer:'journal'|'database'='journal',empty=false){
 await page.goto(RECOVERY_URL);
 await expect.poll(()=>page.evaluate(async ()=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];return new Promise<boolean>((resolve,reject)=>{const r=indexedDB.open('vectora-recovery',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents'),q=tx.objectStore('documents').get(__recoveryKey('current'));q.onsuccess=()=>{resolve(!!q.result);db.close();};q.onerror=()=>reject(q.error);};});})).toBe(true);
 return page.evaluate(async({journal,database,newer,empty})=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
  const {DocumentRecovery}=await import('/src/documentRecovery.ts'),{encodeDocument}=await import('/src/documentFormat.ts');
  // Only this old page's writer is disabled while the synthetic records are
  // seeded. Reload runs the real unmodified startup and automatic persistence.
  (DocumentRecovery.prototype as any).write=()=>{};
  const e=(window as any).__vectora,p=(window as any).__paper;if(!empty)e.addShape(new p.Path.Rectangle({insert:false,rectangle:[20,30,40,50]}),'Keep this drawing');
  const contents=encodeDocument(e,false),time=Date.now()+10000;
  const make=(source:string,kind:string)=>({version:1,time:time+(source===newer?1:0),id:`synthetic-${source}`,data:{contents:kind==='good'?contents:'not-json',filename:'Recovered.vectora',dirty:true}});
  const j=journal==='missing'?null:JSON.stringify(make('journal',journal)),d=database==='missing'?undefined:make('database',database);
  await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('vectora-recovery',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents');store.clear();if(d)store.put(d,__recoveryKey('current'));tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>reject(tx.error);};});
  localStorage.removeItem(__recoveryLoc.previous);localStorage.removeItem(__recoveryLoc.invalid);
  if(j)localStorage.setItem(__recoveryLoc.journal,j);else localStorage.removeItem(__recoveryLoc.journal);
  return {contents,journal:j,database:d};
 },{journal,database,newer,empty});
}
async function reloadRecovery(page:import('@playwright/test').Page){page.once('dialog',d=>d.accept());await page.reload();await expect(page.locator('#workspace')).not.toHaveAttribute('inert','');}
async function rawRecovery(page:import('@playwright/test').Page){return page.evaluate(async()=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
 const database=await new Promise<any>((resolve,reject)=>{const r=indexedDB.open('vectora-recovery',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents'),q=tx.objectStore('documents').get(__recoveryKey('current'));q.onsuccess=()=>{resolve(q.result??null);db.close();};q.onerror=()=>reject(q.error);};});
 return {journal:await (await import('/tests/recoveryHelpers.ts')).retainedJournal(),database};
});}
for(const newer of ['journal','database'] as const)test(`VEC-001 restores older valid drawing when the newer ${newer} is corrupt`,async({page})=>{
 await seedRecovery(page,newer==='journal'?'bad':'good',newer==='database'?'bad':'good',newer);
 await reloadRecovery(page);
 const live=await page.evaluate(()=>(window as any).__vectora.objects.length);
 // Wait beyond the normal backup interval: the old failure also overwrites DB.
 await page.waitForTimeout(600);const raw=await rawRecovery(page);
 const saved=raw.database?.data.contents||raw.database?.data.tabs?.find((t:any)=>t.id===raw.database.data.activeTabId)?.contents;
 console.log('VEC-001 original reproduction',JSON.stringify({newer,live,databaseObjects:saved&&saved!=='not-json'?JSON.parse(saved).layers.flatMap((l:any)=>l.objects).length:'corrupt'}));
 expect(live).toBe(1);await expect(page.locator('[data-document-name]')).toHaveText('Recovered.vectora');
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Keep this drawing']);
});

async function recoveryStore(page:import('@playwright/test').Page,key:string){return page.evaluate(async key=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];return new Promise<any>((resolve,reject)=>{const r=indexedDB.open('vectora-recovery',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents'),q=tx.objectStore('documents').get(__recoveryKey(key));q.onsuccess=()=>{resolve(q.result??null);db.close();};q.onerror=()=>reject(q.error);};});},key);}
async function recoveryStatus(page:import('@playwright/test').Page){return page.evaluate(async()=>{const {DocumentRecovery}=await import('/src/documentRecovery.ts');return(await new DocumentRecovery(()=>{}).readValidated()).status;});}

test('VEC-001 two corrupt copies survive failed startup, backup timers and subsequent reloads',async({page})=>{
 const before=await seedRecovery(page,'bad','bad');await reloadRecovery(page);
 expect(await recoveryStatus(page)).toBe('invalid');expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(0);
 await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));document.dispatchEvent(new Event('click'));});await page.waitForTimeout(750);
 expect(await rawRecovery(page)).toEqual({journal:before.journal,database:before.database});
 await reloadRecovery(page);await page.waitForTimeout(400);expect(await rawRecovery(page)).toEqual({journal:before.journal,database:before.database});
 // Editing alone cannot authorize replacing failed recovery records.
 await page.evaluate(()=>{const e=(window as any).__vectora,p=(window as any).__paper;e.addShape(new p.Path.Rectangle({insert:false,rectangle:[70,80,10,10]}),'New intentional work');});
 await page.waitForTimeout(600);expect(await rawRecovery(page)).toEqual({journal:before.journal,database:before.database});
 await page.getByRole('button',{name:'New document tab',exact:true}).click();
 await page.evaluate(()=>{const e=(window as any).__vectora,p=(window as any).__paper;e.addShape(new p.Path.Rectangle({insert:false,rectangle:[90,80,10,10]}),'Explicit new document');});
 await expect.poll(()=>recoveryStore(page,'quarantine')).not.toBeNull();
 const archive=await recoveryStore(page,'quarantine');expect(archive.some((c:any)=>c.source==='journal'&&c.raw===before.journal)).toBe(true);expect(archive.some((c:any)=>c.source==='database'&&JSON.stringify(c.raw)===JSON.stringify(before.database))).toBe(true);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Explicit new document']);await expect(page.locator('.document-tab')).toHaveCount(2);
});

test('VEC-001 missing data and a valid empty document remain distinct and usable',async({page})=>{
 await seedRecovery(page,'missing','missing');expect(await recoveryStatus(page)).toBe('missing');await reloadRecovery(page);
 expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(0);await expect.poll(()=>recoveryStatus(page)).toBe('valid');
 await seedRecovery(page,'missing','good','database',true);expect(await recoveryStatus(page)).toBe('valid');await reloadRecovery(page);
 expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(0);await expect(page.locator('[data-document-name]')).toHaveText('Recovered.vectora');
 await expect(page.locator('#new-document-dialog')).not.toBeVisible();
});

for(const malformed of ['truncated JSON','unsupported envelope','unsupported native document'] as const)test(`VEC-001 ignores and retains a ${malformed} journal`,async({page})=>{
 const seeded=await seedRecovery(page,'bad','good'),future=JSON.parse(seeded.contents);future.version=99;
 const raw=malformed==='truncated JSON'?'{"version":1,"data":':JSON.stringify({version:malformed==='unsupported envelope'?99:1,time:Date.now()+20000,id:'future-envelope',data:{contents:JSON.stringify(future),filename:'Future.vectora',dirty:true}});
 await page.evaluate(async raw=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];return localStorage.setItem(__recoveryLoc.journal,raw);},raw);await reloadRecovery(page);
 expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(1);
 await expect.poll(async()=>{const q=await recoveryStore(page,'quarantine');return q?.some((c:any)=>c.source==='journal'&&c.raw===raw)??false;}).toBe(true);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(1);
});

test('VEC-001 salvages valid sibling tabs and retains rejected tab and draft bytes',async({page})=>{
 const before=await seedRecovery(page,'good','good');const raw=await page.evaluate(async contents=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
  const record={version:1,time:Date.now()+20000,id:'partial',data:{contents,filename:'Sibling.vectora',dirty:true,activeTabId:'valid',tabs:[null,{id:'valid',contents,filename:'Sibling.vectora',dirty:true},{id:'broken',contents:'not-json',filename:'Broken.vectora',dirty:true}],draft:{content:'Keep rejected draft',sourceId:'missing-text',point:null}}};
  const raw=JSON.stringify(record);localStorage.setItem(__recoveryLoc.journal,raw);return raw;
 },before.contents);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(1);await expect(page.locator('[data-document-name]')).toHaveText('Sibling.vectora');
 await expect.poll(async()=>{const q=await recoveryStore(page,'quarantine');return q?.some((c:any)=>c.raw===raw)??false;}).toBe(true);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(1);
});

async function isolatedWriter(page:import('@playwright/test').Page){await page.evaluate(async()=>{
 const {DocumentRecovery}=await import('/src/documentRecovery.ts');const r=new DocumentRecovery(message=>{(window as any).__recoveryWarnings.push(message);});(window as any).__recoveryWarnings=[];
 await r.read();const write=DocumentRecovery.prototype.write;
 DocumentRecovery.prototype.write=function(data){if(this===r)write.call(this,data);};(window as any).__recoveryWriter=r;
});}

test('VEC-001 rejects invalid incoming recovery without replacing the previous good drawing',async({page})=>{
 await seedRecovery(page,'missing','good');await reloadRecovery(page);await isolatedWriter(page);const before=await rawRecovery(page);
 await page.evaluate(()=>(window as any).__recoveryWriter.write({contents:'not-json',filename:'Rejected.vectora',dirty:true}));
 expect(await rawRecovery(page)).toEqual(before);expect(await page.evaluate(()=>(window as any).__recoveryWriter.needsRetry)).toBe(true);expect(await page.evaluate(()=>(window as any).__recoveryWarnings)).toHaveLength(1);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(1);
});

for(const journalFails of [true,false])test(`VEC-001 aborted transaction preserves good DB with journal ${journalFails?'rejected':'available'}`,async({page})=>{
 const seeded=await seedRecovery(page,'missing','good');await reloadRecovery(page);await isolatedWriter(page);const before=await recoveryStore(page,'current');
 await page.evaluate(async ({contents,journalFails})=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
  const r=(window as any).__recoveryWriter,native=JSON.parse(contents);native.layers.flatMap((l:any)=>l.objects)[0].data.name='Pending valid change';
  const put=IDBObjectStore.prototype.put,set=Storage.prototype.setItem;(window as any).__restoreRecoveryIO=()=>{IDBObjectStore.prototype.put=put;Storage.prototype.setItem=set;};
  if(journalFails)Storage.prototype.setItem=function(key,value){if(key===__recoveryLoc.journal)throw new DOMException('Quota exceeded','QuotaExceededError');return set.call(this,key,value);};
  IDBObjectStore.prototype.put=function(value,key){const q=put.call(this,value,key!);if(this.name==='documents'&&JSON.stringify(key)===JSON.stringify(__recoveryKey('current'))&&value.data.filename==='Pending.vectora')q.addEventListener('success',()=>this.transaction.abort());return q;};
  r.write({contents:JSON.stringify(native),filename:'Pending.vectora',dirty:true});
 },{contents:seeded.contents,journalFails});
 await page.waitForTimeout(200);expect(await recoveryStore(page,'current')).toEqual(before);
 if(journalFails){expect(await page.evaluate(()=>(window as any).__recoveryWriter.needsRetry)).toBe(true);expect((await rawRecovery(page)).journal).toBeNull();}
 else {const raw=await rawRecovery(page);expect(JSON.parse(raw.journal!).data.filename).toBe('Pending.vectora');}
 await page.evaluate(()=>(window as any).__restoreRecoveryIO());await reloadRecovery(page);
 expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual([journalFails?'Keep this drawing':'Pending valid change']);
 await expect.poll(async()=>(await recoveryStore(page,'current')).data.filename).toBe(journalFails?'Recovered.vectora':'Pending.vectora');
});

for(const outcome of ['resolve','reject'] as const)test(`VEC-001 delayed old write ${outcome} cannot replace or invalidate a newer committed recovery`,async({page})=>{
 const seeded=await seedRecovery(page,'missing','good');await reloadRecovery(page);await isolatedWriter(page);
 await page.evaluate(contents=>{
  const r=(window as any).__recoveryWriter,db=r.connection;let resolve!:(db:IDBDatabase)=>void,reject!:(error:Error)=>void;
  r.database=new Promise<IDBDatabase>((yes,no)=>{resolve=yes;reject=no;});r.connection=null;
  (window as any).__finishOldRecovery=(outcome:string)=>outcome==='resolve'?resolve(db):reject(new Error('Old open failed'));
  const data=JSON.parse(contents),object=data.layers.flatMap((l:any)=>l.objects)[0];object.data.name='Old queued';r.write({contents:JSON.stringify(data),filename:'Old.vectora',dirty:true});
  r.connection=db;object.data.name='Latest committed';r.write({contents:JSON.stringify(data),filename:'Latest.vectora',dirty:true});
 },seeded.contents);
 await expect.poll(async()=>(await recoveryStore(page,'current')).data.filename).toBe('Latest.vectora');
 await page.evaluate(outcome=>(window as any).__finishOldRecovery(outcome),outcome);await page.waitForTimeout(100);
 expect((await recoveryStore(page,'current')).data.filename).toBe('Latest.vectora');expect(await page.evaluate(()=>(window as any).__recoveryWriter.needsRetry)).toBe(false);expect(await page.evaluate(()=>(window as any).__recoveryWarnings)).toEqual([]);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Latest committed']);
});

test('VEC-001 previous validated generation survives corruption of both current copies',async({page})=>{
 const seeded=await seedRecovery(page,'missing','good');await reloadRecovery(page);await isolatedWriter(page);
 await page.evaluate(contents=>{const d=JSON.parse(contents);d.layers.flatMap((l:any)=>l.objects)[0].data.name='Second generation';(window as any).__recoveryWriter.write({contents:JSON.stringify(d),filename:'Second.vectora',dirty:true});},seeded.contents);
 await expect.poll(async()=>(await recoveryStore(page,'current')).data.filename).toBe('Second.vectora');expect((await recoveryStore(page,'previous')).data.filename).toBe('Recovered.vectora');
 await page.evaluate(async()=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
  const corrupt={version:1,time:Date.now()+30000,id:'both-now-corrupt',data:{contents:'not-json',filename:'Corrupt.vectora',dirty:true}};localStorage.setItem(__recoveryLoc.journal,JSON.stringify(corrupt));
  await new Promise<void>((resolve,reject)=>{const q=indexedDB.open('vectora-recovery',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put(corrupt,__recoveryKey('current'));tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
 });
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Keep this drawing']);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Keep this drawing']);
});

test('VEC-001 archive failure keeps original failed copies and does not retry in a timer loop',async({page})=>{
 const seeded=await seedRecovery(page,'bad','bad');await reloadRecovery(page);
 await page.evaluate(async ()=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
  const set=Storage.prototype.setItem,put=IDBObjectStore.prototype.put;(window as any).__archiveAttempts=0;
  Storage.prototype.setItem=function(key,value){if(key===__recoveryLoc.invalid)throw new DOMException('Quota exceeded','QuotaExceededError');return set.call(this,key,value);};
  IDBObjectStore.prototype.put=function(value,key){if(this.name==='documents'&&JSON.stringify(key)===JSON.stringify(__recoveryKey('quarantine'))){(window as any).__archiveAttempts++;throw new DOMException('Quota exceeded','QuotaExceededError');}return put.call(this,value,key!);};
  Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true});
 });
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Open file…',exact:true}).click();
 await(await chooser).setFiles({name:'Explicitly opened.vectora',mimeType:'application/json',buffer:Buffer.from(seeded.contents)});
 await expect.poll(()=>page.evaluate(()=>(window as any).__archiveAttempts)).toBe(1);await page.waitForTimeout(700);
 expect(await page.evaluate(()=>(window as any).__archiveAttempts)).toBe(1);expect(await rawRecovery(page)).toEqual({journal:seeded.journal,database:seeded.database});expect(await page.evaluate(()=>(window as any).__vectora.objects.length)).toBe(1);
});

test('VEC-001 recovers damaged tab IDs from an older copy without resurrecting closed tabs',async({page})=>{
 const seeded=await seedRecovery(page,'good','good');await page.evaluate(async contents=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
  const named=(name:string)=>{const native=JSON.parse(contents);native.layers.flatMap((l:any)=>l.objects)[0].data.name=name;return JSON.stringify(native);};
  const tab=(id:string,name:string,contents:string)=>({id,filename:name+'.vectora',contents,dirty:true}),time=Date.now()+40000;
  const valid=tab('valid','Current',named('Latest valid sibling')),old=tab('damaged','Recovered old tab',named('Older damaged-tab drawing'));
  const stored={version:1,time,id:'old-tabs',data:{contents:old.contents,filename:old.filename,dirty:true,activeTabId:old.id,tabs:[tab('valid','Old sibling',named('Old sibling')),old,tab('closed','Intentionally closed',named('Closed drawing'))]}};
  await new Promise<void>((resolve,reject)=>{const q=indexedDB.open('vectora-recovery',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put(stored,__recoveryKey('current'));tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
  localStorage.setItem(__recoveryLoc.journal,JSON.stringify({version:1,time:time+1,id:'new-partial-tabs',data:{contents:'not-json',filename:old.filename,dirty:true,activeTabId:'damaged',tabs:[valid,tab('damaged','Damaged','not-json')]}}));
 },seeded.contents);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Older damaged-tab drawing']);
 await expect(page.getByRole('tab',{name:/Intentionally closed/})).toHaveCount(0);await expect(page.getByRole('tab',{name:/Current.vectora/})).toHaveCount(1);
 await page.getByRole('tab',{name:/Current.vectora/}).click();expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Latest valid sibling']);
 await reloadRecovery(page);expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Latest valid sibling']);
});

test('VEC-001 mutable read results cannot corrupt the retained previous generation',async({page})=>{
 const seeded=await seedRecovery(page,'missing','good');await reloadRecovery(page);await isolatedWriter(page);
 await page.evaluate(async contents=>{
  const r=(window as any).__recoveryWriter,read=await r.read();read.tabs[0].contents='not-json';read.filename='Mutated alias.vectora';
  const native=JSON.parse(contents);native.layers.flatMap((l:any)=>l.objects)[0].data.name='New valid state';r.write({contents:JSON.stringify(native),filename:'New valid.vectora',dirty:true});
 },seeded.contents);
 await expect.poll(async()=>(await recoveryStore(page,'current')).data.filename).toBe('New valid.vectora');
 const previous=await recoveryStore(page,'previous'),d=previous.data,contents=d.contents||d.tabs.find((t:any)=>t.id===d.activeTabId).contents;
 expect(d.filename).toBe('Recovered.vectora');expect(JSON.parse(contents).layers.flatMap((l:any)=>l.objects).map((o:any)=>o.data.name)).toEqual(['Keep this drawing']);
});


test('VEC-001 an extreme valid clock cannot produce unreadable writes or prefer a retained predecessor',async({page})=>{
 const seeded=await seedRecovery(page,'missing','good');await reloadRecovery(page);await isolatedWriter(page);
 await page.evaluate(async contents=>{const __recoveryLoc=await (await import('/src/storage/recoverySession.ts')).recoveryLocation();const __recoveryKey=(slot:string)=>['recovery',__recoveryLoc.id,slot];
  const r=(window as any).__recoveryWriter;
  localStorage.setItem(__recoveryLoc.journal,JSON.stringify({version:1,time:8640000000000000,id:'maximum-clock',data:{contents,filename:'Clock baseline.vectora',dirty:true}}));
  await r.read();r.write({contents,filename:'Clock first.vectora',dirty:true});
 },seeded.contents);
 await expect.poll(async()=>(await recoveryStore(page,'current')).data.filename).toBe('Clock first.vectora');
 expect((await recoveryStore(page,'current')).time).toBe(8640000000000000);
 await page.evaluate(contents=>{const native=JSON.parse(contents);native.layers.flatMap((l:any)=>l.objects)[0].data.name='Latest clock drawing';(window as any).__recoveryWriter.write({contents:JSON.stringify(native),filename:'Clock latest.vectora',dirty:true});},seeded.contents);
 await expect.poll(async()=>(await recoveryStore(page,'current')).data.filename).toBe('Clock latest.vectora');
 // Current DB and retained journal/DB now tie at the timestamp boundary.
 await reloadRecovery(page);await expect(page.locator('[data-document-name]')).toHaveText('Clock latest.vectora');expect(await page.evaluate(()=>(window as any).__vectora.objects.map((s:any)=>s.data.name))).toEqual(['Latest clock drawing']);
});
