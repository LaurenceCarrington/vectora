import type {Vertex} from './types';

export const GEOMETRY_UNVERIFIED='This operation cannot be verified safely at this size or position. Your original paths are unchanged.';
type Range=readonly [number,number];
export interface AreaRange {value:number;lower:number;upper:number}
const bits=new DataView(new ArrayBuffer(8));
/** One representable step outward encloses each rounded binary64 operation.
 * These bounds are arithmetic uncertainty, not a physical joining tolerance. */
function down(value:number):number {
 if(!Number.isFinite(value))throw new Error(GEOMETRY_UNVERIFIED);
 if(value===0)return -Number.MIN_VALUE;
 bits.setFloat64(0,value);bits.setBigUint64(0,bits.getBigUint64(0)+(value<0?1n:-1n));return bits.getFloat64(0);
}
const up=(value:number)=>-down(-value);
const exact=(value:number):Range=>{if(!Number.isFinite(value))throw new Error(GEOMETRY_UNVERIFIED);return[value,value];};
const add=(a:Range,b:Range):Range=>[down(a[0]+b[0]),up(a[1]+b[1])];
const sub=(a:Range,b:Range):Range=>[down(a[0]-b[1]),up(a[1]-b[0])];
function mul(a:Range,b:Range):Range {const products=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return[down(Math.min(...products)),up(Math.max(...products))];}
const divide=(a:Range,positive:number):Range=>[down(a[0]/positive),up(a[1]/positive)];
export function areaMagnitude(area:AreaRange):Range {
 if(area.lower>0)return[area.lower,area.upper];
 if(area.upper<0)return[-area.upper,-area.lower];
 throw new Error(GEOMETRY_UNVERIFIED);
}
/** Shared translated frame and compensated sum. The interval independently
 * encloses the exact polygon area of the represented input coordinates (mm²). */
export function polygonAreaRange(points:readonly Vertex[]):AreaRange {
 if(points.length<3)return{value:0,lower:0,upper:0};
 const origin=points[0],x0=exact(origin.x),y0=exact(origin.y);
 const local=points.map(p=>({x:sub(exact(p.x),x0),y:sub(exact(p.y),y0),px:p.x-origin.x,py:p.y-origin.y}));
 let range:Range=[0,0],sum=0,correction=0;
 for(let i=0;i<local.length;i++){
  const a=local[i],b=local[(i+1)%local.length];range=add(range,sub(mul(a.x,b.y),mul(b.x,a.y)));
  const term=a.px*b.py-b.px*a.py-correction,next=sum+term;correction=(next-sum)-term;sum=next;
 }
 range=divide(range,2);const value=sum/2;
 if(!Number.isFinite(value)||value<range[0]||value>range[1])throw new Error(GEOMETRY_UNVERIFIED);
 return{value,lower:range[0],upper:range[1]};
}
/** Outward evaluation of Paper 0.12.18 Curve.getArea / Path.getArea in its
 * actual coordinate frame. No shifted/scaled replacement geometry is created. */
export function paperAreaRange(curves:readonly (readonly number[])[]):AreaRange {
 let range:Range=[0,0];
 for(const values of curves){
  if(values.length!==8)throw new Error(GEOMETRY_UNVERIFIED);
  const [x0,y0,x1,y1,x2,y2,x3,y3]=values.map(exact);
  let term=sub(mul(sub(y3,y0),add(x1,x2)),mul(sub(x3,x0),add(y1,y2)));
  term=add(term,mul(y1,sub(x0,x2)));term=sub(term,mul(x1,sub(y0,y2)));
  term=add(term,mul(y3,add(x2,divide(x0,3))));term=sub(term,mul(x3,add(y2,divide(y0,3))));
  range=add(range,divide(mul(exact(3),term),20));
 }
 return{value:(range[0]+range[1])/2,lower:range[0],upper:range[1]};
}

/** Independent straight-contour ray crossing. Unresolved boundary/ray tests
 * refuse; callers never invent a physical epsilon to choose a side. */
export function pointInsideContours(contours:readonly (readonly Vertex[])[],point:Vertex,evenOdd=true):boolean {
 let winding=0;const px=exact(point.x),py=exact(point.y);
 for(const points of contours)for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],ax=exact(a.x),ay=exact(a.y),dx=sub(exact(b.x),ax),dy=sub(exact(b.y),ay),rx=sub(px,ax),ry=sub(py,ay);
  if(point.x>=Math.min(a.x,b.x)&&point.x<=Math.max(a.x,b.x)&&point.y>=Math.min(a.y,b.y)&&point.y<=Math.max(a.y,b.y)){
   const cross=sub(mul(dx,ry),mul(dy,rx));if(cross[0]<=0&&cross[1]>=0)throw new Error(GEOMETRY_UNVERIFIED);
  }
  if((a.y>point.y)===(b.y>point.y))continue;
  if(dy[0]<=0&&dy[1]>=0)throw new Error(GEOMETRY_UNVERIFIED);
  const numerator=mul(dx,ry),quotients=[numerator[0]/dy[0],numerator[0]/dy[1],numerator[1]/dy[0],numerator[1]/dy[1]];
  const hit=add(sub(ax,px),[down(Math.min(...quotients)),up(Math.max(...quotients))]);
  if(hit[0]>0)winding+=b.y>a.y?1:-1;else if(hit[1]>=0)throw new Error(GEOMETRY_UNVERIFIED);
 }
 return evenOdd?winding%2!==0:winding!==0;
}
export function rectangleAreaRange(x0:number,y0:number,x1:number,y1:number):AreaRange {
 const r=mul(sub(exact(x1),exact(x0)),sub(exact(y1),exact(y0)));return{value:(x1-x0)*(y1-y0),lower:r[0],upper:r[1]};
}
export function sumAreaRanges(areas:readonly AreaRange[]):AreaRange {
 let r:Range=[0,0];for(const area of areas)r=add(r,[area.lower,area.upper]);return{value:(r[0]+r[1])/2,lower:r[0],upper:r[1]};
}
/** A conservative mm² width for comparing independently accumulated areas. */
export function areaComparisonUncertainty(a:AreaRange,b:AreaRange):number {
 return up(up(a.upper-a.lower)+up(b.upper-b.lower));
}
