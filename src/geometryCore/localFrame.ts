import paper from 'paper';
import {GEOMETRY_UNVERIFIED} from '../geometrySafety';
import {validNumber} from '../units';
import type {Shape} from '../types';
const bits=new DataView(new ArrayBuffer(8));
function exponent(value:number):number {
 bits.setFloat64(0,value);const n=bits.getBigUint64(0),e=Number(n>>52n&2047n);return e?e-1023:(n&((1n<<52n)-1n)).toString(2).length-1075;
}
function upward(value:number):number {bits.setFloat64(0,value);bits.setBigUint64(0,bits.getBigUint64(0)+1n);return bits.getFloat64(0);}
/** Exact power-of-two scaling is temporary numeric conditioning, never a part
 * placement or a persistent change of units. Refuse lost input information. */
export class BooleanLocalFrame {
 readonly origin:paper.Point;
 readonly scale:number;
 readonly errorMM:number;
 readonly extent:number;
 constructor(paths:readonly paper.Path[]){
  const points=paths.flatMap(p=>p.segments.flatMap(s=>[s.point,s.point.add(s.handleIn),s.point.add(s.handleOut)]));
  if(!points.length||points.some(p=>!validNumber(p.x)||!validNumber(p.y)))throw new Error(GEOMETRY_UNVERIFIED);
  let origin=points[0].clone(),extent=0,magnitude=0;
  for(const p of points){extent=Math.max(extent,Math.abs(p.x-origin.x),Math.abs(p.y-origin.y));magnitude=Math.max(magnitude,Math.abs(p.x),Math.abs(p.y));}
  if(magnitude<=8*extent){origin=new paper.Point(0,0);extent=magnitude;}this.origin=origin;
  if(!(extent>0))throw new Error(GEOMETRY_UNVERIFIED);
  this.extent=extent;const power=8-exponent(extent);if(power< -900||power>900)throw new Error(GEOMETRY_UNVERIFIED);this.scale=2**power;
  // Two world-coordinate ULPs plus 64 extent-relative rounded operations.
  // This is an observed-result verification allowance, not a kernel tolerance.
  const ulp=magnitude?2**Math.max(-1074,exponent(magnitude)-52):Number.MIN_VALUE;
  this.errorMM=upward(2*ulp+upward(64*Number.EPSILON*extent));
  if(!Number.isFinite(this.errorMM)||this.errorMM<=0||this.errorMM>=extent/1e6)throw new Error(GEOMETRY_UNVERIFIED);
  for(const path of paths)for(const s of path.segments){const back=this.world(this.local(s.point));if(back.x!==s.point.x||back.y!==s.point.y)throw new Error(GEOMETRY_UNVERIFIED);for(const h of [s.handleIn,s.handleOut])for(const value of [h.x,h.y])if(value*this.scale/this.scale!==value)throw new Error(GEOMETRY_UNVERIFIED);}
 }
 local(p:paper.Point):paper.Point{return p.subtract(this.origin).multiply(this.scale);}
 world(p:paper.Point):paper.Point{return p.divide(this.scale).add(this.origin);}
 condition(path:paper.Path):void {
  for(const s of path.segments){s.point=this.local(s.point);s.handleIn=s.handleIn.multiply(this.scale);s.handleOut=s.handleOut.multiply(this.scale);}
 }
 restore(shape:Shape):void {
  const paths=shape instanceof paper.Path?[shape]:shape.children as paper.Path[];
  for(const p of paths)for(const s of p.segments){
   const anchor=s.point.clone(),incoming=s.handleIn.clone(),outgoing=s.handleOut.clone();
   s.point=this.world(anchor);s.handleIn=incoming.divide(this.scale);s.handleOut=outgoing.divide(this.scale);
   for(const [target,world]of [[anchor,s.point],[anchor.add(incoming),s.point.add(s.handleIn)],[anchor.add(outgoing),s.point.add(s.handleOut)]]){
    if(!validNumber(world.x)||!validNumber(world.y)||this.local(world).getDistance(target)/this.scale>this.errorMM)throw new Error(GEOMETRY_UNVERIFIED);
   }
  }
 }
}
