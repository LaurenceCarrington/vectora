import {prepareDocument} from '../documentFormat';
import type {RecoveryData,RecoveryTab} from '../documentRecovery';

export interface PreparedRecovery {
 data:RecoveryData;
 tabs:{tab:RecoveryTab;loaded:ReturnType<typeof prepareDocument>}[];
 issues:string[];
 invalidTabIds:string[];
}
/** Detached native validation, never a load into the live editor. One bad tab
 * must not hide valid siblings; the original envelope is retained by recovery. */
export function prepareRecovery(data:RecoveryData):PreparedRecovery {
 if(!data||typeof data.contents!=='string'||typeof data.filename!=='string'||data.filename.length>1000||typeof data.dirty!=='boolean')throw new Error('Invalid recovery workspace.');
 const issues:string[]=[],tabs:PreparedRecovery['tabs']=[],seen=new Set<string>(),invalid=new Set<string>();
 const records=Array.isArray(data.tabs)&&data.tabs.length?data.tabs:[{id:'legacy',contents:data.contents,filename:data.filename,dirty:data.dirty}];
 for(const raw of records){
  try{
   if(!raw||typeof raw.id!=='string'||!/^[-\w]{1,100}$/.test(raw.id)||seen.has(raw.id)||typeof raw.filename!=='string'||raw.filename.length>1000||typeof raw.contents!=='string'||typeof raw.dirty!=='boolean')throw new Error('Invalid document tab.');
   const loaded=prepareDocument(raw.contents);seen.add(raw.id);tabs.push({tab:{id:raw.id,contents:raw.contents,filename:raw.filename,dirty:raw.dirty},loaded});
  }catch(error){if(typeof raw?.id==='string')invalid.add(raw.id);issues.push(error instanceof Error?error.message:String(error));}
 }
 if(!tabs.length)throw new Error('No valid document tabs were found.');
 const active=tabs.find(t=>t.tab.id===data.activeTabId)??tabs[0];
 let draft=data.draft;
 if(draft&&(!data.activeTabId||active.tab.id===data.activeTabId)){
  try{
   if(typeof draft.content!=='string'||draft.content.length>500||!(draft.sourceId===null||typeof draft.sourceId==='string'))throw new Error('The recovered text draft is invalid.');
   const source=draft.sourceId?JSON.parse(active.tab.contents).layers.flatMap((l:any)=>l.objects).find((o:any)=>o.data.uid===draft!.sourceId):null;
   if(draft.sourceId&&!source?.data.text)throw new Error('The recovered text object is missing.');
   const validPoint=Array.isArray(draft.point)&&draft.point.length===2&&draft.point.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6);
   if((!source||draft.point!==null)&&!validPoint)throw new Error('The recovered text position is invalid.');
   draft={content:draft.content,sourceId:draft.sourceId,point:validPoint?[draft.point![0],draft.point![1]]:null};
  }catch(error){issues.push(error instanceof Error?error.message:String(error));draft=undefined;}
 }else draft=undefined;
 return {data:{contents:active.tab.contents,filename:active.tab.filename,dirty:active.tab.dirty,tabs:tabs.map(t=>t.tab),activeTabId:active.tab.id,...(draft?{draft}: {})},tabs,issues,invalidTabIds:[...invalid].filter(id=>!seen.has(id))};
}
