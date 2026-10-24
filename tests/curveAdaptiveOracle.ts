import assert from 'node:assert/strict';
// Host-side exact rational oracle. No production arithmetic, flattening or
// Paper predicates are imported. Polynomial restriction is independent of the
// production de Casteljau tree; all continuous leaf controls are checked.
export type Q={n:bigint;d:bigint};
export function q(n:bigint,d=1n):Q {if(!d)throw Error('Zero divisor');if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){const t=a%b;a=b;b=t;}return{n:n/(a||1n),d:d/(a||1n)};}
export function rat(v:number):Q {assert.ok(Number.isFinite(v));const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,v);const bits=view.getBigUint64(0),e=Number(bits>>52n&2047n),m=(bits&((1n<<52n)-1n))|(e?1n<<52n:0n),power=e?e-1075:-1074,sign=bits>>63n?-1n:1n;return power>=0?q(sign*m<<BigInt(power)):q(sign*m,1n<<BigInt(-power));}
export const add=(a:Q,b:Q)=>q(a.n*b.d+b.n*a.d,a.d*b.d),sub=(a:Q,b:Q)=>q(a.n*b.d-b.n*a.d,a.d*b.d),mul=(a:Q,b:Q)=>q(a.n*b.n,a.d*b.d),div=(a:Q,b:Q)=>q(a.n*b.d,a.d*b.n),cmp=(a:Q,b:Q)=>a.n*b.d-b.n*a.d,sq=(a:Q)=>mul(a,a);
const max=(a:Q,b:Q)=>cmp(a,b)>=0n?a:b;
export function exactRoot(local:number[],matrices:number[][]):Q[]{
 let v=[rat(local[0]),rat(local[1]),add(rat(local[0]),rat(local[2])),add(rat(local[1]),rat(local[3])),add(rat(local[4]),rat(local[6])),add(rat(local[5]),rat(local[7])),rat(local[4]),rat(local[5])];
 for(const matrix of matrices){const m=matrix.map(rat),out:Q[]=[];for(let i=0;i<8;i+=2)out.push(add(add(mul(m[0],v[i]),mul(m[2],v[i+1])),m[4]),add(add(mul(m[1],v[i]),mul(m[3],v[i+1])),m[5]));v=out;}return v;
}
function polynomial(v:Q[]):Q[][] {return[0,1].map(i=>{const[a,b,c,d]=[v[i],v[i+2],v[i+4],v[i+6]];return[a,mul(q(3n),sub(b,a)),mul(q(3n),add(sub(c,mul(q(2n),b)),a)),sub(add(d,mul(q(3n),b)),add(mul(q(3n),c),a))];});}
function restrict(coeff:Q[][],from:number,to:number):Q[]{
 const t=rat(from),h=sub(rat(to),t),h2=sq(h),h3=mul(h2,h),t2=sq(t),out:Q[]=[];
 for(let axis=0;axis<2;axis++){
  const[a,b,c,d]=coeff[axis],A=add(add(add(a,mul(b,t)),mul(c,t2)),mul(d,mul(t2,t))),B=mul(h,add(add(b,mul(q(2n),mul(c,t))),mul(q(3n),mul(d,t2)))),C=mul(h2,add(c,mul(q(3n),mul(d,t)))),D=mul(h3,d);
  [A,add(A,div(B,q(3n))),add(add(A,div(mul(q(2n),B),q(3n))),div(C,q(3n))),add(add(add(A,B),C),D)].forEach((v,i)=>out[i*2+axis]=v);
 }return out;
}
function distanceSquared(v:Q[],i:number,a:Q[],b:Q[],endpoint=false):Q {
 const x=sub(v[i],a[0]),y=sub(v[i+1],a[1]);if(endpoint)return add(sq(x),sq(y));
 const dx=sub(b[0],a[0]),dy=sub(b[1],a[1]),len=add(sq(dx),sq(dy)),dot=add(mul(x,dx),mul(y,dy));
 if(!len.n||dot.n<=0n)return add(sq(x),sq(y));if(cmp(dot,len)>=0n)return add(sq(sub(v[i],b[0])),sq(sub(v[i+1],b[1])));return sub(add(sq(x),sq(y)),div(sq(dot),len));
}
export type Leaf={values:number[];from:number;to:number;depth:number;boundMM:number};
export function verifyContinuousLeaves(roots:Q[][],leaves:Leaf[],points:{x:number;y:number}[],tolerance:number):void {
 assert.ok(leaves.length>0);let previous=0;const expected:{x:number;y:number}[]=[];
 for(const leaf of leaves){assert.equal(leaf.from,previous);assert.equal(leaf.to-leaf.from,2**-leaf.depth);previous=leaf.to;assert.ok(leaf.boundMM<=tolerance);const p={x:leaf.values[0],y:leaf.values[1]};if(!expected.length||p.x!==expected.at(-1)!.x||p.y!==expected.at(-1)!.y)expected.push(p);}
 assert.equal(previous,1);const final={x:leaves.at(-1)!.values[6],y:leaves.at(-1)!.values[7]};if(expected.at(-1)!.x!==final.x||expected.at(-1)!.y!==final.y)expected.push(final);assert.deepEqual(points,expected);
 for(const root of roots){const coefficients=polynomial(root);for(const leaf of leaves){
  const v=restrict(coefficients,leaf.from,leaf.to),a=leaf.values.slice(0,2).map(rat),b=leaf.values.slice(6).map(rat),e2=max(distanceSquared(v,0,a,b,true),distanceSquared(v,6,b,a,true)),i2=max(distanceSquared(v,2,a,b),distanceSquared(v,4,a,b));
  // Check the actual reported bound AND the requested tolerance with exact
  // squared inequalities: B >= max(E,(E+3I)/4), without trusting JS sqrt.
  for(const bound of [leaf.boundMM,tolerance]){const b2=sq(rat(bound));assert.ok(cmp(b2,e2)>=0n,'endpoint uncertainty');if(cmp(i2,e2)>=0n){const k=sub(sub(mul(q(16n),b2),e2),mul(q(9n),i2));assert.ok(k.n>=0n,'weighted side condition');assert.ok(cmp(sq(k),mul(q(36n),mul(e2,i2)))>=0n,'continuous finite-chord bound');}}
 }}
}
export type Point={x:number;y:number};
export function segmentDistance(p:Point,a:Point,b:Point):number {const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export function readDXFEdges(text:string):[Point,Point][] {
 const lines=text.trim().split(/\r?\n/),edges:[Point,Point][]=[],tags:[number,string][]=[];let kind='';const flush=()=>{const num=(n:number)=>Number(tags.find(t=>t[0]===n)?.[1]);if(kind==='LINE')edges.push([{x:num(10),y:-num(20)},{x:num(11),y:-num(21)}]);if(kind==='LWPOLYLINE'){const points:Point[]=[];let x=0;for(const[c,v]of tags){if(c===10)x=Number(v);if(c===20)points.push({x,y:-Number(v)});}for(let i=1;i<points.length;i++)edges.push([points[i-1],points[i]]);if(num(70)&1)edges.push([points.at(-1)!,points[0]]);}tags.length=0;};for(let i=0;i<lines.length;i+=2){if(Number(lines[i])===0){flush();kind=lines[i+1];}else tags.push([Number(lines[i]),lines[i+1]]);}flush();return edges;
}

/** Native v1 intentionally canonicalizes supported metadata and formats
 * coordinates at 12 decimals. Check all geometry within that fixture's format
 * allowance and all other persistent fields exactly, rather than byte identity
 * of an advisory field the unchanged reader never restores. */
export function verifyNativeRoundTrip(expected:string,actual:string):void {
 const a=JSON.parse(expected),b=JSON.parse(actual);assert.equal(a.layers.length,b.layers.length);
 for(let l=0;l<a.layers.length;l++){assert.equal(a.layers[l].objects.length,b.layers[l].objects.length);for(let o=0;o<a.layers[l].objects.length;o++){
  const x=a.layers[l].objects[o],y=b.layers[l].objects[o];delete x.data.offsetDistanceMM;delete y.data.offsetDistanceMM;assert.equal(x.contours.length,y.contours.length);
  for(let c=0;c<x.contours.length;c++){const xs=x.contours[c].segments,ys=y.contours[c].segments;assert.equal(xs.length,ys.length);for(let i=0;i<xs.length;i++)for(let j=0;j<xs[i].length;j++){const bound=2e-12+4*Number.EPSILON*Math.max(1,Math.abs(xs[i][j]),Math.abs(ys[i][j]));assert.ok(Math.abs(xs[i][j]-ys[i][j])<=bound,'native coordinate precision');xs[i][j]=0;ys[i][j]=0;}}
 }}assert.deepEqual(b,a);
}
