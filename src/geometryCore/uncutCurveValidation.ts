import paper from 'paper';
import {GEOMETRY_UNVERIFIED} from '../geometrySafety';
import {pathsOf,flattenInDocument} from '../geometry';
import {ExactArithmetic,NumericBudget,polygonContains,type Rational as Q} from './exactPredicates';
import type {Shape} from '../types';
type P={x:Q;y:Q};
type Cubic=readonly [P,P,P,P];
type Loop={path:paper.Path;owner:number;curves:Cubic[];sign:number;unique:number};
/** Noncrossing Jordan-curve domain. Exact rational control hull separation and
 * monotonicity prove simplicity/disjointness; whole-contour provenance avoids
 * trusting Paper's cubic intersection/root solver. Crossing/unresolved cubics
 * refuse. Certified flattening is only a nesting witness, never output data. */
export function validateUncutCurves(inputs:readonly Shape[],output:Shape,operation:'weld'|'subtract'|'intersect',errorMM:number,extent:number):paper.Path[] {
 const budget=new NumericBudget(1000000),r=new ExactArithmetic(budget),zero=r.q(0n),allowance=r.number(errorMM),three=r.q(3n);
 const fail=():never=>{throw new Error(GEOMETRY_UNVERIFIED);};
 const point=(p:paper.Point):P=>({x:r.number(p.x),y:r.number(p.y)}),sub=(a:P,b:P):P=>({x:r.sub(a.x,b.x),y:r.sub(a.y,b.y)}),add=(a:P,b:P):P=>({x:r.add(a.x,b.x),y:r.add(a.y,b.y)});
 const cross=(a:P,b:P)=>r.sub(r.mul(a.x,b.y),r.mul(a.y,b.x)),same=(a:P,b:P)=>r.cmp(a.x,b.x)===0&&r.cmp(a.y,b.y)===0;
 const close=(a:P,b:P)=>[r.sub(a.x,b.x),r.sub(a.y,b.y)].every(v=>r.cmp(v,allowance)<=0&&r.cmp(v,r.sub(zero,allowance))>=0);
 const get=(shape:Shape,owner:number):Loop[]=>pathsOf(shape).map(path=>{
  const curves=path.segments.map((s,i)=>{const b=path.segments[(i+1)%path.segments.length],a=point(s.point),end=point(b.point);return[a,add(a,point(s.handleOut)),add(end,point(b.handleIn)),end] as const;});
  let area=zero;const origin=curves[0][0];
  for(const curve of curves){
   const c=curve.map(p=>sub(p,origin)),[a,b,d,e]=c;
   // Exact Green integral of the represented point+relative-handle cubics.
   let term=r.sub(r.mul(r.sub(e.y,a.y),r.add(b.x,d.x)),r.mul(r.sub(e.x,a.x),r.add(b.y,d.y)));
   term=r.add(term,r.mul(b.y,r.sub(a.x,d.x)));term=r.sub(term,r.mul(b.x,r.sub(a.y,d.y)));
   term=r.add(term,r.mul(e.y,r.add(d.x,r.div(a.x,three))));term=r.sub(term,r.mul(e.x,r.add(d.y,r.div(a.y,three))));area=r.add(area,term);
   // A monotone coordinate proves this individual cubic has no loop/cusp.
   const derivatives=[1,2,3].map(i=>sub(curve[i],curve[i-1])),directions=[{x:r.q(1n),y:zero},{x:zero,y:r.q(1n)},sub(curve[3],curve[0]),...derivatives,...derivatives.map(v=>({x:r.sub(zero,v.y),y:v.x}))];
   // Search the finite boundary directions of the derivative half-plane cone.
   // Unlike an X/Y-only test this property survives nonsingular affine maps.
   if(!directions.some(n=>{const signs=derivatives.map(v=>r.cmp(r.add(r.mul(n.x,v.x),r.mul(n.y,v.y)),zero));return signs.some(Boolean)&&(signs.every(s=>s>=0)||signs.every(s=>s<=0));}))fail();
  }
  const sign=r.cmp(area,zero);if(!sign)fail();return{path,owner,curves,sign,unique:-1};
 });
 const original=inputs.flatMap(get),result=get(output,inputs.length),unique:Loop[]=[];
 const equivalent=(a:Loop,b:Loop,tolerant=false):boolean=>{
  if(a.curves.length!==b.curves.length)return false;const n=a.curves.length,eq=tolerant?close:same;
  for(let shift=0;shift<n;shift++)for(const reversed of [false,true]){
   budget.tick();if(a.curves.every((c,i)=>c.every((p,j)=>eq(p,reversed?b.curves[(shift-i+n)%n][3-j]:b.curves[(shift+i)%n][j]))))return true;
  }return false;
 };
 for(const loop of original){const found=unique.findIndex(other=>equivalent(loop,other));loop.unique=found<0?unique.push(loop)-1:found;}
 const chosen=new Set<number>();
 for(const loop of result){const matches=unique.flatMap((other,i)=>equivalent(loop,other,true)?[i]:[]);if(matches.length!==1||chosen.has(matches[0]))fail();loop.unique=matches[0];chosen.add(matches[0]);}
 const on=(a:P,b:P,p:P)=>r.cmp(cross(sub(b,a),sub(p,a)),zero)===0&&(['x','y'] as const).every(k=>(r.cmp(p[k],a[k])>=0&&r.cmp(p[k],b[k])<=0)||(r.cmp(p[k],b[k])>=0&&r.cmp(p[k],a[k])<=0));
 const separated=(a:Cubic,b:Cubic,adjacent:boolean):boolean=>{
  // Each control-polygon edge supplies a possible separating support line.
  // Exact evaluation can reject a candidate, never manufacture separation.
  const lines:[P,P][]=[];for(const c of [a,b])for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(!same(c[i],c[j]))lines.push([c[i],c[j]]);
  for(const [u,v]of lines){
   budget.tick();const side=(p:P)=>r.cmp(cross(sub(v,u),sub(p,u)),zero),aa=a.map(side),bb=b.map(side);
   if(!(aa.every(s=>s>=0)&&bb.every(s=>s<=0)||aa.every(s=>s<=0)&&bb.every(s=>s>=0)))continue;
   const aLine=aa.every(s=>s===0),bLine=bb.every(s=>s===0),contacts:[P,P][]=[];
   for(const pa of [a[0],a[3]])for(const pb of [b[0],b[3]])if(same(pa,pb))contacts.push([pa,pb]);
   if(aLine)for(const pb of [b[0],b[3]])if(on(a[0],a[3],pb)&&!contacts.some(([p])=>same(p,pb)))fail();
   if(bLine)for(const pa of [a[0],a[3]])if(on(b[0],b[3],pa)&&!contacts.some(([p])=>same(p,pa)))fail();
   if(contacts.length&&!adjacent)fail();
   if(aLine&&bLine){
    // Collinear segments may meet only at their common endpoint.
    const aMid={x:r.mid(a[0].x,a[3].x),y:r.mid(a[0].y,a[3].y)},bMid={x:r.mid(b[0].x,b[3].x),y:r.mid(b[0].y,b[3].y)};
    if(on(a[0],a[3],bMid)||on(b[0],b[3],aMid))continue;
   }
   return true;
  }return false;
 };
 const check=(loops:Loop[])=>{
  const curves=loops.flatMap((loop,owner)=>loop.curves.map((curve,index)=>({curve,owner,index,count:loop.curves.length})));
  if(curves.length>500)fail();
  for(let i=0;i<curves.length;i++)for(let j=i+1;j<curves.length;j++){
   const a=curves[i],b=curves[j];
   // First try exact axis-aligned hull gaps, avoiding rational determinants.
   const gap=(axis:'x'|'y')=>{const av=a.curve.map(p=>p[axis]).sort((x,y)=>r.cmp(x,y)),bv=b.curve.map(p=>p[axis]).sort((x,y)=>r.cmp(x,y));return r.cmp(av[3],bv[0])<0||r.cmp(bv[3],av[0])<0;};
   if(gap('x')||gap('y'))continue;
   const adjacent=a.owner===b.owner&&(b.index===a.index+1||a.index===0&&b.index===a.count-1);
   if(!separated(a.curve,b.curve,adjacent))fail();
  }
 };
 check(unique);check(result);
 const tolerance=extent*1e-5;
 const polygons=unique.map(loop=>flattenInDocument(loop.path,tolerance,4096,12000)[0].points),polyQ=polygons.map(poly=>poly.map(p=>point(new paper.Point(p.x,p.y)))),distance=r.add(r.number(tolerance),r.mul(allowance,r.q(8n))),limit2=r.mul(distance,distance);
 const min=(a:Q,b:Q)=>r.cmp(a,b)<0?a:b,max=(a:Q,b:Q)=>r.cmp(a,b)>0?a:b;
 const occupied=(w:number[])=>{const inside=inputs.map((s,i)=>s.fillRule==='evenodd'?w[i]%2!==0:w[i]!==0);return operation==='weld'?inside.some(Boolean):operation==='intersect'?inside.every(Boolean):inside[0]&&!inside.slice(1).some(Boolean);};
 for(const [i,loop]of unique.entries()){
  const p=loop.path.firstSegment.point,w=inputs.map(()=>0);let outside=false;
  for(const [j,other]of unique.entries())if(i!==j){
   const poly=polygons[j],pp=point(p);
   for(let k=0;k<poly.length;k++){
    budget.tick();const aa=polyQ[j][k],bb=polyQ[j][(k+1)%poly.length];
    if(r.cmp(pp.x,r.sub(min(aa.x,bb.x),distance))<0||r.cmp(pp.x,r.add(max(aa.x,bb.x),distance))>0||r.cmp(pp.y,r.sub(min(aa.y,bb.y),distance))<0||r.cmp(pp.y,r.add(max(aa.y,bb.y),distance))>0)continue;
    // Exact squared distance separates a nesting witness from the certified
    // chord tube; no nearest-point/root solver or rounded square root decides.
    const v=sub(bb,aa),w=sub(pp,aa),dot=(x:P,y:P)=>r.add(r.mul(x.x,y.x),r.mul(x.y,y.y)),length=dot(v,v),projection=dot(v,w);
    let clear:boolean;
    if(r.cmp(projection,zero)<=0)clear=r.cmp(dot(w,w),limit2)>0;
    else if(r.cmp(projection,length)>=0){const d=sub(pp,bb);clear=r.cmp(dot(d,d),limit2)>0;}
    else{const determinant=cross(v,w);clear=r.cmp(r.mul(determinant,determinant),r.mul(limit2,length))>0;}
    if(!clear)fail();
   }
   if(polygonContains([poly],p,true,budget)){for(const o of original)if(o.unique===j)w[o.owner]+=o.sign;if(chosen.has(j))outside=!outside;}
  }
  const before=occupied(w);for(const o of original)if(o.unique===i)w[o.owner]+=o.sign;
  if(before!==outside||occupied(w)!==(chosen.has(i)?!outside:outside))fail();
 }
 // The certified selection consists of whole input contours. Return those
 // original controls, not a numerically perturbed backend copy.
 return unique.filter((_,i)=>chosen.has(i)).map(loop=>loop.path);
}
