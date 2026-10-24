import paper from 'paper';

/** Editing and visible references have deliberately different lock policies.
 * Native owners are Paths/CompoundPaths; walk every ancestor through its Layer.
 * Detached proposals are not interactive document targets. Opacity is appearance,
 * not visibility; locked visible construction remains an intentional reference. */
export function canReferenceVisible(item:paper.Item):boolean {
 if(!item.isInserted())return false;
 for(let p:paper.Item|null=item;p;p=p.parent){
  if(!p.visible||p.data.deleted)return false;
  if(p instanceof paper.Layer)return true;
 }
 return false;
}
export function canEdit(item:paper.Item):boolean {
 if(!canReferenceVisible(item))return false;
 for(let p:paper.Item|null=item;p;p=p.parent)if(p.locked)return false;
 // Whole-owner transforms must not move a protected descendant either.
 return !item.children||item.children.every(child=>canEdit(child));
}
export const canSelectEditingTarget=(item:paper.Item):boolean=>item.parent instanceof paper.Layer&&canEdit(item);
export function canUseLockedConstructionReference(item:paper.Item):boolean {
 return canReferenceVisible(item)&&item.layer.data.objectRole==='construction';
}
export class EntityAccessError extends Error {
 constructor(){super('This operation includes hidden, locked or unavailable objects. Show and unlock every target, then try again.');this.name='EntityAccessError';}
}
export function requireEditable(items:readonly paper.Item[]):void {
 if(items.some(item=>!canEdit(item)))throw new EntityAccessError();
}
/** Preserve the established explicit export profiles; locks never exclude output.
 * DXF includes hidden process geometry, independently of selection eligibility.
 * SVG uses its existing visible-owner/layer policy, unless includeHidden is set. */
export function canExport(item:paper.Item,profile:{kind:'svg';includeHidden:boolean}|{kind:'dxf';includeArtwork:boolean}):boolean {
 const role=item.data.role;
 if(profile.kind==='dxf')return role==='cutline'||role==='engrave'||profile.includeArtwork&&role==='artwork';
 return ['artwork','cutline','engrave','raster'].includes(role)&&(profile.includeHidden||(item.visible&&item.layer.visible))&&!item.layer.data.deleted&&item.opacity>0;
}
