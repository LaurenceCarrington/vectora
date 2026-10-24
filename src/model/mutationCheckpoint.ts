import paper from 'paper';
import {canEdit,EntityAccessError} from './entityAccess';
/** Exact rollback state for legacy writers that edit live Paper objects before
 * committing. Unlike history JSON it retains binary64 values and owner identity.
 * Checkpoints are discarded after admission, not retained in undo history. */
interface ItemState {
 item:paper.Item;parent:paper.Item|null;editable:boolean;matrix:paper.Matrix;applyMatrix:boolean;style:paper.Style;data:any;
 name:string;visible:boolean;locked:boolean;opacity:number;closed?:boolean;
 segments?:paper.Segment[];children?:ItemState[];
}
// Paper 0.12.18's public Path.style delegates to its CompoundPath parent and
// style= merges rather than replaces. Use this narrowly isolated adapter to
// retain the actual per-item style and its owner, without propagating inherited
// compound/layer styles onto children during rollback.
type OwnedItem=paper.Item&{_style:paper.Style;_changed:(flags:number)=>void};
const OwnedStyle=paper.Style as unknown as new(style:object,owner:paper.Item)=>paper.Style;
function capture(item:paper.Item):ItemState {
 const style=new paper.Style((item as OwnedItem)._style);style.dashArray=[...style.dashArray];
 return {item,parent:item.parent,editable:canEdit(item),matrix:item.matrix.clone(),applyMatrix:item.applyMatrix,style,data:structuredClone(item.data),name:item.name,visible:item.visible,locked:item.locked,opacity:item.opacity,
 ...(item instanceof paper.Path?{closed:item.closed,segments:item.segments.map(s=>s.clone())}:{}),
 ...(item.children?{children:item.children.map(capture)}:{})};
}
function restore(state:ItemState):void {
 const {item}=state;item.applyMatrix=false;item.matrix=state.matrix.clone();(item as OwnedItem)._style=new OwnedStyle(state.style,item);(item as OwnedItem)._changed(129);
 if(item instanceof paper.Path){item.removeSegments();item.addSegments(state.segments!);item.closed=state.closed!;}
 if(state.children){item.removeChildren();for(const child of state.children){restore(child);item.addChild(child.item);}}
 item.data=structuredClone(state.data);item.name=state.name;
 item.visible=state.visible;item.locked=state.locked;item.opacity=state.opacity;item.applyMatrix=state.applyMatrix;
}
/** Compare already captured binary64 geometry/metadata/style without adding
 * another full JSON export per pointer sample. Access flags are checked separately. */
function sameContent(state:ItemState,item=state.item):boolean {
 const style=(item as OwnedItem)._style as paper.Style&{equals:(other:paper.Style)=>boolean};
 if(item.name!==state.name||item.opacity!==state.opacity||!style.equals(state.style)||JSON.stringify(item.data)!==JSON.stringify(state.data)||!item.matrix.values.every((v,i)=>v===state.matrix.values[i]))return false;
 if(item instanceof paper.Path){
  if(item.closed!==state.closed||item.segments.length!==state.segments?.length)return false;
  if(item.segments.some((s,i)=>[s.point.x,s.point.y,s.handleIn.x,s.handleIn.y,s.handleOut.x,s.handleOut.y].some((v,j)=>v!==[state.segments![i].point.x,state.segments![i].point.y,state.segments![i].handleIn.x,state.segments![i].handleIn.y,state.segments![i].handleOut.x,state.segments![i].handleOut.y][j])))return false;
 }
 return !state.children||!!item.children&&item.children.length===state.children.length&&state.children.every((child,i)=>sameContent(child,item.children[i]));
}
function denied(item:paper.Item,parent:paper.Item|null,layerAdministration:boolean):boolean {
 if(!item.visible||item.locked||item.children?.some(child=>denied(child,null,true)))return true;
 for(let p=parent;p;p=p.parent)if(!(layerAdministration&&p instanceof paper.Layer)&&(!p.visible||p.locked||p.data.deleted))return true;
 return false;
}
/** Prefer surviving object identity. A UID only identifies a replacement when
 * unique: corrupt live duplicates must never transfer sibling permissions. The
 * native admission gate still rejects duplicate identifiers independently. */
function uniqueOwners(layers:readonly paper.Layer[]):Map<unknown,paper.Item|null> {
 const result=new Map<unknown,paper.Item|null>();
 for(const layer of layers)for(const item of layer.children)result.set(item.data.uid,result.has(item.data.uid)?null:item);
 return result;
}
function currentOwner(state:ItemState,byId:Map<unknown,paper.Item|null>):paper.Item {
 return state.item.isInserted()?state.item:byId.get(state.data.uid)??state.item;
}
export class MutationCheckpoint {
 private states:ItemState[];
 constructor(readonly layers:paper.Layer[]){this.states=layers.map(capture);}
 /** Normal content commands cannot change/remove protected owners. Layer
  * administration can remove an otherwise editable owner while marking its
  * layer deleted, but never bypasses intrinsic owner protection. */
 assertAccess(current:readonly paper.Layer[],layerAdministration=false):void {
  const byId=uniqueOwners(current);
  for(const layer of this.states)for(const state of layer.children??[]){
   const item=currentOwner(state,byId);
   if((!state.editable||denied(item,item.parent??state.parent,layerAdministration))&&(item.parent!==state.parent||!sameContent(state,item)))throw new EntityAccessError();
  }
 }
 restore(current:readonly paper.Layer[],preserveAccess=false):void {
  // A revoked permission on a replacement copy is associated by stable owner
  // UID; rollback restores original identities without unlocking that copy.
  const byId=uniqueOwners(current);
  const overrides:{item:paper.Item;visible:boolean;locked:boolean;deleted:unknown}[]=[];
  const keep=(state:ItemState,actual=state.item)=>{if(actual.visible!==state.visible||actual.locked!==state.locked||actual instanceof paper.Layer&&actual.data.deleted!==state.data.deleted)overrides.push({item:state.item,visible:actual.visible,locked:actual.locked,deleted:actual.data.deleted});state.children?.forEach((child,i)=>keep(child,actual.children?.[i]??child.item));};
  if(preserveAccess)for(const layer of this.states){if(layer.item.visible!==layer.visible||layer.item.locked!==layer.locked||layer.item.data.deleted!==layer.data.deleted)overrides.push({item:layer.item,visible:layer.item.visible,locked:layer.item.locked,deleted:layer.item.data.deleted});for(const owner of layer.children??[])keep(owner,currentOwner(owner,byId));}

  for(const layer of current)if(!this.layers.includes(layer)){layer.removeChildren();layer.remove();}
  for(const state of this.states)restore(state);
  for(const state of overrides){state.item.visible=state.visible;state.item.locked=state.locked;if(state.item instanceof paper.Layer)state.item.data.deleted=state.deleted;}
 }
}
