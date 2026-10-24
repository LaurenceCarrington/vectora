import type {Vertex} from './types';

type Range=readonly [number,number];
export type CubicRanges=readonly Range[];
export type ApproximationFailure='depth'|'points'|'work'|'nodes'|'memory'|'canceled'|'precision'|'topology'|'serialization';
export class CurveApproximationError extends Error {
 readonly code='CURVE_APPROXIMATION_UNVERIFIED';
 constructor(readonly reason:ApproximationFailure,readonly toleranceMM?:number,readonly boundMM?:number){
  const cause={depth:'subdivision depth limit',points:'too many curve points',work:'curve work budget exhausted',nodes:'curve node budget exhausted',memory:'temporary curve stack budget exhausted',canceled:'operation canceled',precision:'available arithmetic precision',topology:'a nonconstant contour would collapse',serialization:'DXF coordinate rounding would collapse an edge'}[reason];
  super(`This curve is too complex to verify within the requested${toleranceMM===undefined?'':` ${toleranceMM}`} mm tolerance (${cause}). The original drawing is unchanged.`);
  this.name='CurveApproximationError';
 }
}
const bits=new DataView(new ArrayBuffer(8));
function down(n:number):number {
 if(!Number.isFinite(n))throw new CurveApproximationError('precision');
 if(n===0)return -Number.MIN_VALUE;
 // Adjacent binary64 using two exact uint32 words avoids BigInt allocation
 // in the hot interval path. Positive values decrement; negatives increment.
 bits.setFloat64(0,n);let hi=bits.getUint32(0),lo=bits.getUint32(4);
 if(n<0){lo=(lo+1)>>>0;if(lo===0)hi=(hi+1)>>>0;}
 else{if(lo===0)hi=(hi-1)>>>0;lo=(lo-1)>>>0;}
 bits.setUint32(0,hi);bits.setUint32(4,lo);return bits.getFloat64(0);
}
const up=(n:number)=>-down(-n);
const exact=(n:number):Range=>{if(!Number.isFinite(n))throw new CurveApproximationError('precision');return[n,n];};
const add=(a:Range,b:Range):Range=>b[0]===0&&b[1]===0?a:a[0]===0&&a[1]===0?b:[down(a[0]+b[0]),up(a[1]+b[1])];
const sub=(a:Range,b:Range):Range=>a[0]===a[1]&&b[0]===b[1]&&a[0]===b[0]?[0,0]:b[0]===0&&b[1]===0?a:[down(a[0]-b[1]),up(a[1]-b[0])];
function mul(a:Range,b:Range):Range {
 if(a[0]===0&&a[1]===0||b[0]===0&&b[1]===0)return[0,0];
 if(a[0]===1&&a[1]===1)return b;if(b[0]===1&&b[1]===1)return a;
 const values=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return[down(Math.min(...values)),up(Math.max(...values))];
}
const magnitude=(r:Range)=>Math.max(Math.abs(r[0]),Math.abs(r[1]));
const join=(...r:Range[]):Range=>[Math.min(...r.map(r=>r[0])),Math.max(...r.map(r=>r[1]))];
function transform(values:CubicRanges,matrix:readonly number[]):CubicRanges {
 if(matrix.length!==6)throw new CurveApproximationError('precision');
 if(matrix.every((n,i)=>n===[1,0,0,1,0,0][i]))return values;
 const [a,b,c,d,tx,ty]=matrix.map(exact),out:Range[]=[];
 for(let i=0;i<8;i+=2){out.push(add(add(mul(a,values[i]),mul(c,values[i+1])),tx),add(add(mul(b,values[i]),mul(d,values[i+1])),ty));}
 return out;
}
/** Enclose exact represented local anchors+handles under the ancestor matrix
 * chain, Paper's represented global matrix, and its evaluated world controls.
 * No conditioned coordinates replace the source or emitted geometry. */
export function documentCubicRanges(start:Vertex,out:Vertex,end:Vertex,into:Vertex,matrices:readonly (readonly number[])[],global:readonly number[],world:readonly number[]):CubicRanges {
 const local=[exact(start.x),exact(start.y),add(exact(start.x),exact(out.x)),add(exact(start.y),exact(out.y)),add(exact(end.x),exact(into.x)),add(exact(end.y),exact(into.y)),exact(end.x),exact(end.y)];
 let chain:CubicRanges=local;for(const matrix of matrices)chain=transform(chain,matrix);
 const combined=transform(local,global);if(world.length!==8)throw new CurveApproximationError('precision');
 return chain.map((r,i)=>join(r,combined[i],exact(world[i])));
}
/** Exact de Casteljau subdivision at 1/2, enclosed outward at every scalar op. */
export function subdivideCubicRanges(values:CubicRanges):[CubicRanges,CubicRanges] {
 const left:Range[]=[],right:Range[]=[];
 for(let axis=0;axis<2;axis++){
  const mid=(a:Range,b:Range)=>mul(add(a,b),exact(.5));
  const a=values[axis],b=values[axis+2],c=values[axis+4],d=values[axis+6],ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);
  [a,ab,abc,center].forEach((r,i)=>left[2*i+axis]=r);[center,bcd,cd,d].forEach((r,i)=>right[2*i+axis]=r);
 }
 return[left,right];
}
function normUpper(x:Range,y:Range):number {
 const ax=magnitude(x),ay=magnitude(y);if(ax===0&&ay===0)return 0;const square=add(mul(exact(ax),exact(ax)),mul(exact(ay),exact(ay)))[1];
 let n=Math.sqrt(square);
 // Do not assume Math.sqrt is correctly rounded: certify n² >= the upper
 // squared distance using a downward product, or fall back to the L1 bound.
 for(let i=0;i<4&&Number.isFinite(n);i++,n=up(n))if(down(n*n)>=square)return n;
 return up(ax+ay);
}
/** Distance to a chosen point on the FINITE chord. The projection is only a
 * candidate: interval evaluation supplies the bound even if division rounds. */
function distanceToChord(x:Range,y:Range,values:readonly number[],i:number):number {
 const ax=values[0],ay=values[1],bx=values[6],by=values[7],dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
 const projection=den?((values[i]-ax)*dx+(values[i+1]-ay)*dy)/den:0;
 // Fix endpoint witnesses to A and B. The matching chord-point cubic is
 // continuous and covers the whole segment, giving a two-sided distance bound.
 const t=i===0?0:i===6?1:Number.isFinite(projection)?Math.max(0,Math.min(1,projection)):0;
 const qx=t===0?exact(ax):t===1?exact(bx):add(exact(ax),mul(exact(t),sub(exact(bx),exact(ax))));
 const qy=t===0?exact(ay):t===1?exact(by):add(exact(ay),mul(exact(t),sub(exact(by),exact(ay))));
 return normUpper(sub(x,qx),sub(y,qy));
}
/** Convex distance to a segment: endpoint weights sum to 1-3t(1-t), inner
 * weights to 3t(1-t) <= 3/4. This bounds the full continuous subcurve, not
 * samples. Endpoint enclosures also cover subdivision/transform rounding. */
export function cubicChordErrorBound(ranges:CubicRanges,values:readonly number[]):number {
 const distances=[0,2,4,6].map(i=>distanceToChord(ranges[i],ranges[i+1],values,i));
 const end=Math.max(distances[0],distances[3]),inner=Math.max(distances[1],distances[2]);
 return Math.max(end,add(mul(exact(.25),exact(end)),mul(exact(.75),exact(inner)))[1]);
}

/** Structural collapse check only, not a general topology certificate. */
export function hasNoncollinearPoints(points:readonly Vertex[]):boolean {
 const a=points[0],b=points.find(p=>p.x!==a.x||p.y!==a.y);if(!b)return false;
 const dx=sub(exact(b.x),exact(a.x)),dy=sub(exact(b.y),exact(a.y));
 return points.some(c=>{const cross=sub(mul(dx,sub(exact(c.y),exact(a.y))),mul(dy,sub(exact(c.x),exact(a.x))));return cross[0]>0||cross[1]<0;});
}

/** Allocate without rounding the available geometric tolerance upward. */
export function curveToleranceAfterAllowance(requested:number,allowance:number):number {
 const remaining=down(requested-allowance);if(!(remaining>0))throw new CurveApproximationError('precision',requested);return remaining;
}
