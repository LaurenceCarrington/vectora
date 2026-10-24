/** Inspect retained journals in the current namespace across a reload's writer
 * nonce. This is storage addressing, not a replacement recovery implementation. */
export async function retainedJournal():Promise<string|null>{
 const {recoveryLocation}=await import('../src/storage/recoverySession'),loc=await recoveryLocation(),prefix=`vectora.recovery.session.${loc.id}.`;
 const values:{raw:string;sequence?:number;time:number}[]=[];
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;if(!key.startsWith(prefix)||!key.endsWith('.pending'))continue;const raw=localStorage.getItem(key)!;let r:any;try{r=JSON.parse(raw);}catch{}values.push({raw,sequence:r?.sequence,time:r?.time??-1});}
 values.sort((a,b)=>a.sequence!==undefined&&b.sequence!==undefined?b.sequence-a.sequence:b.time-a.time);return values[0]?.raw??null;
}
