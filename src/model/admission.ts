import paper from 'paper';
import {assertCircularIdentity} from '../geometryCore/circularIdentity';
import type {CADEditor} from '../editor';
import type {Shape} from '../types';
import {pathsOf} from '../geometry';
import {encodeDocument,prepareDocument} from '../documentFormat';
import {MAX_DOCUMENT_OBJECTS,MAX_DOCUMENT_LAYERS,MAX_SOURCE_CONTOURS,MAX_SOURCE_SEGMENTS} from '../processingLimits';

export interface DocumentCounts {objects:number;contours:number;segments:number;layers:number}
export function countEntities(items:readonly Shape[],layers=0):DocumentCounts {
 const count={objects:items.length,contours:0,segments:0,layers};
 for(const item of items)for(const path of pathsOf(item)){count.contours++;count.segments+=path.segments.length;}
 return count;
}
export function admitCounts(count:DocumentCounts):void {
 if(count.objects>MAX_DOCUMENT_OBJECTS)throw new Error('This document contains too many objects (20,000 maximum).');
 if(count.layers>MAX_DOCUMENT_LAYERS)throw new Error('This document contains too many layers (1,000 maximum).');
 if(count.contours>MAX_SOURCE_CONTOURS)throw new Error('This document contains too many contours (50,000 maximum).');
 if(count.segments>MAX_SOURCE_SEGMENTS)throw new Error('This document contains too many curve points (500,000 maximum).');
}
/** Reserve known bulk additions before allocating copies or applying any source edit.
 * Recounting deliberately avoids a second mutable model or stale counter cache. */
export function admitCopies(editor:CADEditor,sources:readonly Shape[],copies=1,extraLayers=0):void {
 const current=countEntities(editor.objects,editor.documentLayers.length),extra=countEntities(sources,extraLayers);
 if(!Number.isSafeInteger(copies)||copies<0)throw new Error('Invalid object copy count.');
 admitCounts({objects:current.objects+extra.objects*copies,contours:current.contours+extra.contours*copies,segments:current.segments+extra.segments*copies,layers:current.layers+extra.layers});
}
function finiteMetadata(value:unknown):void {
 if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Object metadata contains a nonfinite number.');
 if(value&&typeof value==='object')for(const child of Object.values(value))finiteMetadata(child);
}
/** Complete fallback for every published mutation. Use the actual v1 reader,
 * including style, metadata, aggregate, world-bound and byte validation. The
 * prepared snapshot is discarded, never projected back onto nominal geometry. */
export function admitDocument(editor:CADEditor):void {
 admitCounts(countEntities(editor.objects,editor.documentLayers.length));
 for(const item of editor.objects){
  if(!(item instanceof paper.Path||item instanceof paper.CompoundPath))throw new Error('Unsupported document object.');
  finiteMetadata(item.data);
  if(item.data.arc!==undefined)assertCircularIdentity(item);
  for(const path of pathsOf(item)){
   if(!path.globalMatrix.values.every(Number.isFinite))throw new Error('Geometry has a nonfinite transform.');
   for(const s of path.segments)if(![s.point.x,s.point.y,s.handleIn.x,s.handleIn.y,s.handleOut.x,s.handleOut.y].every(Number.isFinite))throw new Error('Geometry contains nonfinite coordinates.');
  }
 }
 prepareDocument(encodeDocument(editor,false));
}
