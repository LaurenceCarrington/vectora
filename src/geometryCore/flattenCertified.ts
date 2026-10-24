import {MAX_SOURCE_SEGMENTS,MAX_DXF_POINTS} from '../processingLimits';
import {CurveApproximationError,cubicChordErrorBound,subdivideCubicRanges,type CubicRanges} from '../curveApproximationSafety';

export const MAX_CURVE_DEPTH=32;
export const MAX_CURVE_NODES=1_000_000;
export const MAX_CURVE_STACK=MAX_CURVE_DEPTH+1;
export interface FlattenStatistics {nodes:number;subdivisions:number;maxDepth:number;peakStack:number;work:number;points:number;maxErrorMM:number}
export interface CertifiedLeaf {readonly values:readonly number[];readonly ranges:CubicRanges;readonly from:number;readonly to:number;readonly depth:number;readonly boundMM:number}
export interface FlattenLimits {
 maxDepth?:number;maxNodes?:number;maxStack?:number;signal?:AbortSignal;
 statistics?:Partial<FlattenStatistics>;
 /** Internal diagnostic hook. Leaves are transient, not a persisted document representation. */
 onLeaf?:(leaf:CertifiedLeaf)=>void;
}
/** One budget per complete object, shared across its paths and source cubics.
 * DFS holds at most depth+1 queued frames; no recursive call or leaf list. */
export class FlattenBudget {
 readonly maxDepth:number;readonly maxNodes:number;readonly maxStack:number;
 readonly stats:FlattenStatistics;
 constructor(readonly toleranceMM:number,readonly maxWork:number,readonly limits:FlattenLimits={}){
  if(!Number.isFinite(toleranceMM)||toleranceMM<=0||!Number.isInteger(maxWork)||maxWork<0||maxWork>MAX_SOURCE_SEGMENTS+2*MAX_DXF_POINTS)throw new Error('Invalid curve processing limits.');
  this.maxDepth=limits.maxDepth??MAX_CURVE_DEPTH;this.maxNodes=limits.maxNodes??MAX_CURVE_NODES;this.maxStack=limits.maxStack??MAX_CURVE_STACK;
  if(!Number.isInteger(this.maxDepth)||this.maxDepth<0||this.maxDepth>MAX_CURVE_DEPTH||!Number.isInteger(this.maxNodes)||this.maxNodes<0||this.maxNodes>MAX_CURVE_NODES||!Number.isInteger(this.maxStack)||this.maxStack<1||this.maxStack>MAX_CURVE_STACK)throw new Error('Invalid curve processing limits.');
  this.stats=Object.assign(limits.statistics??{},{nodes:0,subdivisions:0,maxDepth:0,peakStack:0,work:0,points:0,maxErrorMM:0}) as FlattenStatistics;
  this.checkCanceled();
 }
 checkCanceled():void {if(this.limits.signal?.aborted)throw new CurveApproximationError('canceled',this.toleranceMM);}
 consume():void {this.checkCanceled();if(this.stats.work>=this.maxWork)throw new CurveApproximationError('work',this.toleranceMM);this.stats.work++;}
 visit(depth:number,stack:number):void {this.consume();if(this.stats.nodes>=this.maxNodes)throw new CurveApproximationError('nodes',this.toleranceMM);this.stats.nodes++;this.stats.maxDepth=Math.max(this.stats.maxDepth,depth);this.stats.peakStack=Math.max(this.stats.peakStack,stack);}
 split(depth:number,queued:number,bound:number):void {
  if(depth>=this.maxDepth)throw new CurveApproximationError('depth',this.toleranceMM,bound);
  if(queued+2>this.maxStack)throw new CurveApproximationError('memory',this.toleranceMM,bound);
  this.consume();this.stats.subdivisions++;this.stats.peakStack=Math.max(this.stats.peakStack,queued+2);
 }
}
export interface CubicOperations {
 split:(values:number[])=>[number[],number[]];
 /** Preserve existing ordinary Paper segmentation for the first eight levels.
  * This may refine a certified leaf; it can never waive the error certificate. */
 compatibilitySplit:(values:number[],tolerance:number)=>boolean;
}
/** Continuous, two-sided finite-chord certificate from VEC-005/A, with outward
 * transform/subdivision intervals. An accepted chord MUST satisfy the bound.
 * Dyadic parameter intervals are exact through the finite depth-32 domain. */
export function flattenCertifiedCubic(values:number[],ranges:CubicRanges,constant:boolean,budget:FlattenBudget,operations:CubicOperations,emit:(values:readonly number[])=>void):void {
 type Frame={values:number[];ranges:CubicRanges;depth:number;from:number;to:number};
 const stack:Frame[]=[{values,ranges,depth:0,from:0,to:1}];
 while(stack.length){
  const node=stack.pop()!;budget.visit(node.depth,stack.length+1);
  const v=node.values,bound=cubicChordErrorBound(node.ranges,v),zeroChord=v[0]===v[6]&&v[1]===v[7];
  const compatibility=node.depth<8&&operations.compatibilitySplit(v,budget.toleranceMM);
  if(!compatibility&&bound<=budget.toleranceMM&&(!zeroChord||constant)){
   budget.stats.maxErrorMM=Math.max(budget.stats.maxErrorMM,bound);emit(v);budget.limits.onLeaf?.({...node,boundMM:bound});continue;
  }
  budget.split(node.depth,stack.length,bound);
  const halves=operations.split(v),enclosures=subdivideCubicRanges(node.ranges),middle=(node.from+node.to)/2,depth=node.depth+1;
  stack.push({values:halves[1],ranges:enclosures[1],depth,from:middle,to:node.to},{values:halves[0],ranges:enclosures[0],depth,from:node.from,to:middle});
 }
}
