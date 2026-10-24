import type paper from 'paper';
import {documentCubicRanges} from '../curveApproximationSafety';

/** Absolute millimetres, independent of segment count. Includes world-transform
 * evaluation uncertainty; SVG decimal encoding adds no binary64 round-trip loss.
 * This is a serialization allowance, not a flattening tolerance or circle fit. */
export const SVG_COORDINATE_ERROR_MM=1e-8;
const failure=()=>new Error('SVG export cannot preserve this geometry within the 0.00000001 mm precision contract. The drawing is unchanged.');
export function svgNumber(value:number):string {
 if(!Number.isFinite(value))throw failure();
 return String(value); // ECMAScript shortest decimal that round-trips to this value.
}
const bits=new DataView(new ArrayBuffer(8));
function up(value:number):number {
 if(!Number.isFinite(value)||value<0)throw failure();
 if(value===0)return 0;
 bits.setFloat64(0,value);let hi=bits.getUint32(0),lo=(bits.getUint32(4)+1)>>>0;if(lo===0)hi=(hi+1)>>>0;
 bits.setUint32(0,hi);bits.setUint32(4,lo);return bits.getFloat64(0);
}
// A shortest round-trip decimal lies inside this binary64 value's rounding
// cell. One outward ULP is a conservative real-decimal encoding allowance.
const encodingRadius=(value:number)=>Number.isSafeInteger(value)?0:up(up(Math.abs(value))-Math.abs(value));
const zero=(p:paper.Point)=>p.x===0&&p.y===0;
const equal=(a:paper.Point,b:paper.Point)=>a.x===b.x&&a.y===b.y;
const pair=(p:paper.Point)=>`${svgNumber(p.x)} ${svgNumber(p.y)}`;
/** Deterministic M/L/C/Z only. No epsilon-based straightening, handle reflection,
 * deduplication or relative delta integration. Read original world controls,
 * rather than subtracting/readding the handles of a baked temporary path. */
export function svgPathData(paths:readonly paper.Path[]):string {
 const commands:string[]=[];
 for(const path of paths){
  const segments=path.segments;if(!segments.length)continue;
  const matrices:number[][]=[];for(let item:paper.Item|null=path;item;item=item.parent)matrices.push(item.matrix.values);
  const global=path.globalMatrix.values,identity=matrices.every(m=>m.every((n,i)=>n===[1,0,0,1,0,0][i]));
  const start=path.localToGlobal(segments[0].point);commands.push(`M${pair(start)}`);
  const count=path.closed?segments.length:segments.length-1;
  for(let i=0;i<count;i++){
   const a=segments[i],b=segments[(i+1)%segments.length],curved=!zero(a.handleOut)||!zero(b.handleIn);
   const p0=path.localToGlobal(a.point),p3=path.localToGlobal(b.point);
   // Refuse lost endpoints/handles rather than silently collapsing source detail.
   if(!equal(a.point,b.point)&&equal(p0,p3))throw failure();
   const p1=curved?path.localToGlobal(a.point.add(a.handleOut)):p0,p2=curved?path.localToGlobal(b.point.add(b.handleIn)):p3;
   if(!zero(a.handleOut)&&equal(p0,p1)||!zero(b.handleIn)&&equal(p3,p2))throw failure();
   {
    const values=[p0.x,p0.y,p1.x,p1.y,p2.x,p2.y,p3.x,p3.y];
    let ranges:ReturnType<typeof documentCubicRanges>|undefined;
    if(!identity||curved)try{ranges=documentCubicRanges(a.point,a.handleOut,b.point,b.handleIn,matrices,global,values);}catch{throw failure();}
    // Outward-rounded L1 bounds dominate Euclidean control-point errors. The
    // Bernstein convex-hull property bounds the ENTIRE corresponding cubic by
    // their maximum, with no multiplication by segment count. A zero-handle
    // cubic has exactly the line-segment locus emitted by L/Z.
    for(let j=0;j<8;j+=2){
     const dx=ranges?up(Math.max(Math.abs(ranges[j][0]-values[j]),Math.abs(ranges[j][1]-values[j]))):0,dy=ranges?up(Math.max(Math.abs(ranges[j+1][0]-values[j+1]),Math.abs(ranges[j+1][1]-values[j+1]))):0;
     const x=up(dx+encodingRadius(values[j])),y=up(dy+encodingRadius(values[j+1]));
     if(up(x+y)>SVG_COORDINATE_ERROR_MM)throw failure();
    }
   }
   if(curved)commands.push(`C${pair(p1)} ${pair(p2)} ${pair(p3)}`);
   else if(!path.closed||i<count-1)commands.push(`L${pair(p3)}`);
  }
  if(path.closed)commands.push('Z');
 }
 return commands.join(' ');
}
