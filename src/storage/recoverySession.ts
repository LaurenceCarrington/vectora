/** A page gets a fresh writer nonce. Reloads may reuse a workspace only while
 * holding its browser-owned lock; cloned sessionStorage never grants ownership. */
export const SESSION_POINTER='vectora.recovery.workspace';
export const MAX_RECOVERY_SESSIONS=32;
export interface RecoveryScope {id:string;writer:string;source:string|null;active:boolean;fenced:boolean;sequence:number}
let pageScope:Promise<RecoveryScope>|undefined;
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
export const validSessionId=(id:unknown):id is string=>typeof id==='string'&&ID.test(id);
export const sessionMetaKey=(id:string)=>['workspace',id];
export const recoveryDbKey=(id:string|null,key:string):IDBValidKey=>id?['recovery',id,key]:key;
export const recoveryJournalKey=(id:string|null,writer:string,key:'pending'|'previous'|'invalid')=>id?`vectora.recovery.session.${id}.${writer}.${key}`:`vectora.recovery.${key}`;
export const sessionLockName=(id:string)=>`vectora-recovery:${id}`;
async function hold(id:string,scope:RecoveryScope):Promise<boolean>{
 if(!navigator.locks)return false;
 return new Promise((resolve,reject)=>{void navigator.locks.request(sessionLockName(id),{ifAvailable:true},async lock=>{
  if(!lock){resolve(false);return;}
  await new Promise<void>(release=>{
   window.addEventListener('pagehide',event=>{if(event.isTrusted&&!event.persisted){scope.active=false;release();}});
   resolve(true);
  });
 }).catch(reject);});
}
export function getRecoveryScope():Promise<RecoveryScope>{return pageScope??=(async()=>{
 let source:string|null=null;try{const id=sessionStorage.getItem(SESSION_POINTER);if(validSessionId(id))source=id;}catch{/* Reload can use the explicit retained-workspace chooser. */}
 const scope:RecoveryScope={id:source??crypto.randomUUID(),writer:crypto.randomUUID(),source,active:true,fenced:false,sequence:0};
 if(source&&!new URL(location.href).searchParams.has('recover')){try{scope.fenced=await hold(source,scope);}catch{/* Fork; never infer ownership from elapsed time. */}}
 if(!scope.fenced){
  for(let attempt=0;attempt<5;attempt++){
   scope.id=crypto.randomUUID();
   if(!navigator.locks)break;
   try{if(await hold(scope.id,scope)){scope.fenced=true;break;}}catch{break;}
  }
  if(navigator.locks&&!scope.fenced)throw new Error('Cannot establish exclusive browser recovery ownership. Use Save.');
 }
 return scope;
})();}
export function rememberRecovery(scope:RecoveryScope):void {try{sessionStorage.setItem(SESSION_POINTER,scope.id);}catch{/* Data remains discoverable in the recovery chooser. */}}
export async function recoveryLocation(){const scope=await getRecoveryScope();return {id:scope.id,writer:scope.writer,current:recoveryDbKey(scope.id,'current'),journal:recoveryJournalKey(scope.id,scope.writer,'pending'),previous:recoveryJournalKey(scope.id,scope.writer,'previous'),invalid:recoveryJournalKey(scope.id,scope.writer,'invalid')};}
