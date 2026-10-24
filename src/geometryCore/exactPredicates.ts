import {GEOMETRY_UNVERIFIED} from '../geometrySafety';
import type {Vertex} from '../types';

export const BOOLEAN_VALIDATION_BUDGET='This operation cannot be verified safely within the validation budget. Your original paths are unchanged. Work with fewer contours.';
/** Bounded exact fallback. No arbitrary-precision loop may grow without an
 * operation and integer-size limit. Coordinates are the actual binary64 data. */
export class NumericBudget {
 private work=0;
 constructor(readonly maxWork=250000,readonly maxBits=2048){}
 tick(count=1):void {if((this.work+=count)>this.maxWork)throw new Error(BOOLEAN_VALIDATION_BUDGET);}
 integer(n:bigint):void {this.tick();if(n.toString(2).length>this.maxBits)throw new Error(BOOLEAN_VALIDATION_BUDGET);}
}
export interface Rational {n:bigint;d:bigint}
export class ExactArithmetic {
 constructor(readonly budget=new NumericBudget()){}
 q(n:bigint,d=1n):Rational {
  this.budget.integer(n);this.budget.integer(d);if(d===0n)throw new Error(GEOMETRY_UNVERIFIED);if(d<0n){n=-n;d=-d;}
  let a=n<0n?-n:n,b=d;while(b){this.budget.tick();const r=a%b;a=b;b=r;}return{n:n/(a||1n),d:d/(a||1n)};
 }
 number(x:number):Rational {
  if(!Number.isFinite(x))throw new Error(GEOMETRY_UNVERIFIED);if(x===0)return this.q(0n);
  const v=new DataView(new ArrayBuffer(8));v.setFloat64(0,x);const bits=v.getBigUint64(0),e=Number(bits>>52n&2047n),m=(bits&((1n<<52n)-1n))|(e?1n<<52n:0n),power=e?e-1075:-1074,sign=bits>>63n?-1n:1n;
  return power>=0?this.q(sign*(m<<BigInt(power))):this.q(sign*m,1n<<BigInt(-power));
 }
 add(a:Rational,b:Rational):Rational{return this.q(a.n*b.d+b.n*a.d,a.d*b.d);}
 sub(a:Rational,b:Rational):Rational{return this.q(a.n*b.d-b.n*a.d,a.d*b.d);}
 mul(a:Rational,b:Rational):Rational{return this.q(a.n*b.n,a.d*b.d);}
 div(a:Rational,b:Rational):Rational{return this.q(a.n*b.d,a.d*b.n);}
 cmp(a:Rational,b:Rational):number {this.budget.tick();const n=a.n*b.d-b.n*a.d;this.budget.integer(n);return n<0n?-1:n>0n?1:0;}
 mid(a:Rational,b:Rational):Rational{return this.div(this.add(a,b),this.q(2n));}
}
/** Fast determinant with a forward-error filter, then exact binary rational
 * arithmetic. A zero result means exactly collinear, not 'within mm epsilon'. */
export function orientation(a:Vertex,b:Vertex,c:Vertex,budget=new NumericBudget()):number {
 budget.tick();const x=b.x-a.x,y=b.y-a.y,u=c.x-a.x,v=c.y-a.y,left=x*v,right=y*u,det=left-right;
 const bound=16*Number.EPSILON*(Math.abs(left)+Math.abs(right));
 if(Number.isFinite(det)&&Number.isFinite(bound)&&Math.abs(det)>bound&&Math.abs(det)>Number.MIN_VALUE/Number.EPSILON)return Math.sign(det);
 const r=new ExactArithmetic(budget),xx=r.sub(r.number(b.x),r.number(a.x)),yy=r.sub(r.number(b.y),r.number(a.y)),uu=r.sub(r.number(c.x),r.number(a.x)),vv=r.sub(r.number(c.y),r.number(a.y));return r.cmp(r.mul(xx,vv),r.mul(yy,uu));
}
export function pointOnSegment(a:Vertex,b:Vertex,p:Vertex,budget=new NumericBudget()):boolean {
 return p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y)&&orientation(a,b,p,budget)===0;
}
export function segmentsMeet(a:Vertex,b:Vertex,c:Vertex,d:Vertex,budget=new NumericBudget()):boolean {
 if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y))return false;
 const abC=orientation(a,b,c,budget),abD=orientation(a,b,d,budget),cdA=orientation(c,d,a,budget),cdB=orientation(c,d,b,budget);
 return abC*abD<0&&cdA*cdB<0||abC===0&&pointOnSegment(a,b,c,budget)||abD===0&&pointOnSegment(a,b,d,budget)||cdA===0&&pointOnSegment(c,d,a,budget)||cdB===0&&pointOnSegment(c,d,b,budget);
}
export function polygonContains(contours:readonly (readonly Vertex[])[],p:Vertex,evenOdd=true,budget=new NumericBudget()):boolean {
 let winding=0;
 for(const points of contours)for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];if(pointOnSegment(a,b,p,budget))throw new Error(GEOMETRY_UNVERIFIED);
  if(a.y<=p.y&&b.y>p.y&&orientation(a,b,p,budget)>0)winding++;
  else if(b.y<=p.y&&a.y>p.y&&orientation(a,b,p,budget)<0)winding--;
 }
 return evenOdd?winding%2!==0:winding!==0;
}
