import {GEOMETRY_UNVERIFIED} from '../geometrySafety';
import {ExactArithmetic,NumericBudget,segmentsMeet,orientation,BOOLEAN_VALIDATION_BUDGET,type Rational as Q} from './exactPredicates';
import type {Vertex} from '../types';
export interface PolygonRegion {contours:Vertex[][];evenOdd:boolean}
type P={x:Q;y:Q};
type Edge={a:P;b:P;owner:number};
type Cell={lo:Edge;hi:Edge;expected:boolean;actual:boolean;id:number};
class Components {
 private parent:number[]=[];
 constructor(private budget:NumericBudget){}
 add():number {const id=this.parent.length;this.parent.push(id);return id;}
 root(i:number):number {while(this.parent[i]!==i){this.budget.tick();this.parent[i]=this.parent[this.parent[i]];i=this.parent[i];}return i;}
 join(i:number,j:number):void {i=this.root(i);j=this.root(j);if(i!==j)this.parent[j]=i;}
}
/** Exact vertical arrangement of represented straight input AND output edges.
 * All vertex/intersection abscissae are events: occupancy between events is
 * invariant. Disagreement must be wholly inside a measured arithmetic tube,
 * and occupied/exterior component counts must agree. No sampled-cell shortcut. */
export function validatePolygonBoolean(regions:readonly PolygonRegion[],output:PolygonRegion,operation:'weld'|'subtract'|'intersect',errorMM:number,maxWork=250000):{slabs:number;cells:number;components:number;holes:number} {
 const budget=new NumericBudget(maxWork),r=new ExactArithmetic(budget),zero=r.q(0n),one=r.q(1n),all=[...regions,output],out=regions.length;
 const fail=():never=>{throw new Error(GEOMETRY_UNVERIFIED);};
 const edges:Edge[]=[],vertices:P[]=[];
 for(const [owner,region]of all.entries()){
  const segments:{a:Vertex;b:Vertex;contour:number;index:number;length:number}[]=[];
  for(const [contour,points]of region.contours.entries()){
   if(points.length<3)fail();
   for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
    if(a.x===b.x&&a.y===b.y)fail();
    if(orientation(a,b,c,budget)===0&&((a.x!==b.x?(a.x>b.x)===(c.x>b.x):(a.y>b.y)===(c.y>b.y))))fail();
    segments.push({a,b,contour,index:i,length:points.length});
    const pa={x:r.number(a.x),y:r.number(a.y)},pb={x:r.number(b.x),y:r.number(b.y)};edges.push({a:pa,b:pb,owner});vertices.push(pa);
   }
  }
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
   budget.tick();const a=segments[i],b=segments[j];
   if(a.contour===b.contour&&(b.index===a.index+1||a.index===0&&b.index===a.length-1))continue;
   if(segmentsMeet(a.a,a.b,b.a,b.b,budget))fail();
  }
 }
 if(!edges.length)fail();
 const cross=(a:P,b:P)=>r.sub(r.mul(a.x,b.y),r.mul(a.y,b.x)),sub=(a:P,b:P):P=>({x:r.sub(a.x,b.x),y:r.sub(a.y,b.y)});
 const min=(a:Q,b:Q)=>r.cmp(a,b)<0?a:b,max=(a:Q,b:Q)=>r.cmp(a,b)>0?a:b;
 const between=(a:Q)=>r.cmp(a,zero)>=0&&r.cmp(a,one)<=0;
 const xs=vertices.map(p=>p.x),splits=edges.map(()=>[zero,one]);
 // Include every segment intersection, not just source vertices. Collinear
 // overlap endpoints already appear as events, and winding groups combine them.
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  budget.tick();const a=edges[i],b=edges[j];
  if(r.cmp(max(a.a.x,a.b.x),min(b.a.x,b.b.x))<0||r.cmp(max(b.a.x,b.b.x),min(a.a.x,a.b.x))<0||r.cmp(max(a.a.y,a.b.y),min(b.a.y,b.b.y))<0||r.cmp(max(b.a.y,b.b.y),min(a.a.y,a.b.y))<0)continue;
  const av=sub(a.b,a.a),bv=sub(b.b,b.a),den=cross(av,bv);
  if(r.cmp(den,zero)===0){
   if(a.owner!==out&&b.owner!==out&&r.cmp(cross(sub(b.a,a.a),av),zero)===0){
    for(const [index,edge,other]of [[i,a,b],[j,b,a]] as const){const axis=r.cmp(edge.a.x,edge.b.x)!==0?'x':'y';for(const p of [other.a,other.b]){const t=r.div(r.sub(p[axis],edge.a[axis]),r.sub(edge.b[axis],edge.a[axis]));if(between(t))splits[index].push(t);}}
   }continue;
  }
  const diff=sub(b.a,a.a),t=r.div(cross(diff,bv),den),u=r.div(cross(diff,av),den);
  if(between(t)&&between(u)){xs.push(r.add(a.a.x,r.mul(t,av.x)));if(a.owner!==out&&b.owner!==out){splits[i].push(t);splits[j].push(u);}}
 }
 const unique=(values:Q[])=>values.sort((a,b)=>r.cmp(a,b)).filter((x,i,a)=>!i||r.cmp(x,a[i-1])!==0);
 // Resolve every true input-edge feature before allowing an error tube.
 // Otherwise a sub-ULP-width ledge could vanish without changing component
 // counts. This separation is derived from reconstruction uncertainty in mm.
 const resolution=r.number(8*errorMM),resolution2=r.mul(resolution,resolution);
 for(let i=0;i<edges.length;i++)if(edges[i].owner!==out){const edge=edges[i],v=sub(edge.b,edge.a),length2=r.add(r.mul(v.x,v.x),r.mul(v.y,v.y)),ts=unique(splits[i]);for(let j=1;j<ts.length;j++){const dt=r.sub(ts[j],ts[j-1]);if(r.cmp(r.mul(r.mul(dt,dt),length2),resolution2)<=0)fail();}}
 let events=unique(xs);if(events.length<2||events.length>4096)throw new Error(BOOLEAN_VALIDATION_BUDGET);
 const ys=vertices.map(p=>p.y),minY=ys.reduce(min),maxY=ys.reduce(max),span=max(r.sub(events.at(-1)!,events[0]),r.sub(maxY,minY));if(r.cmp(span,zero)<=0)fail();
 const bottom=r.sub(minY,span),top=r.add(maxY,span),left=r.sub(events[0],span),right=r.add(events.at(-1)!,span);
 events=[left,...events,right];const horizontal=(y:Q):Edge=>({a:{x:left,y},b:{x:right,y},owner:-1}),floor=horizontal(bottom),ceiling=horizontal(top);
 const yAt=(e:Edge,x:Q):Q=>r.add(e.a.y,r.div(r.mul(r.sub(x,e.a.x),r.sub(e.b.y,e.a.y)),r.sub(e.b.x,e.a.x)));
 const allowed=r.number(errorMM),allowed2=r.mul(allowed,allowed);
 const near=(p:P,e:Edge):boolean=>{
  const v=sub(e.b,e.a),w=sub(p,e.a),dot=(a:P,b:P)=>r.add(r.mul(a.x,b.x),r.mul(a.y,b.y)),len=dot(v,v),projection=dot(v,w);
  if(r.cmp(projection,zero)<=0)return r.cmp(dot(w,w),allowed2)<=0;
  if(r.cmp(projection,len)>=0){const d=sub(p,e.b);return r.cmp(dot(d,d),allowed2)<=0;}
  const c=cross(v,w);return r.cmp(r.mul(c,c),r.mul(allowed2,len))<=0;
 };
 const expected=(w:number[])=>{const inside=regions.map((s,i)=>s.evenOdd?w[i]%2!==0:w[i]!==0);return operation==='weld'?inside.some(Boolean):operation==='intersect'?inside.every(Boolean):inside[0]&&!inside.slice(1).some(Boolean);};
 const aComponents=new Components(budget),bComponents=new Components(budget),cells:Cell[]=[],slabs:Cell[][]=[];
 for(let i=1;i<events.length;i++){
  const x0=events[i-1],x1=events[i],x=r.mid(x0,x1),hits=edges.filter(e=>r.cmp(x,min(e.a.x,e.b.x))>0&&r.cmp(x,max(e.a.x,e.b.x))<0).map(edge=>({edge,y:yAt(edge,x)})).sort((a,b)=>r.cmp(a.y,b.y));
  const groups:{edge:Edge;y:Q;crossings:Edge[]}[]=[{edge:floor,y:bottom,crossings:[]}];
  for(const h of hits){const last=groups.at(-1)!;if(r.cmp(h.y,last.y)===0)last.crossings.push(h.edge);else groups.push({...h,crossings:[h.edge]});}
  groups.push({edge:ceiling,y:top,crossings:[]});const winding=all.map(()=>0),slab:Cell[]=[];
  for(let j=0;j<groups.length-1;j++){
   const lo=groups[j],hi=groups[j+1];for(const e of lo.crossings)winding[e.owner]+=r.cmp(e.b.x,e.a.x)>0?1:-1;
   const e=expected(winding),actual=output.evenOdd?winding[out]%2!==0:winding[out]!==0;
   const id=aComponents.add();bComponents.add();const cell={lo:lo.edge,hi:hi.edge,expected:e,actual,id};slab.push(cell);cells.push(cell);
   if(e!==actual){
    // Convexity of the finite segment's distance tube: if all four corners
    // lie in both tubes, the entire (convex) disagreement trapezoid does.
    const corners=[x0,x1].flatMap(xx=>[lo.edge,hi.edge].map(edge=>({x:xx,y:yAt(edge,xx)})));
    // A near-vertical boundary is an event, not a slab's upper/lower edge.
    // Search all finite boundary segments instead of assuming those two edges
    // define both sides of the arithmetic discrepancy.
    if(![false,true].every(isOutput=>edges.some(edge=>(edge.owner===out)===isOutput&&corners.every(p=>near(p,edge)))))fail();
   }
   if(j){const previous=slab[j-1];if(e===previous.expected)aComponents.join(id,previous.id);if(actual===previous.actual)bComponents.join(id,previous.id);}
  }
  const prior=slabs.at(-1);if(prior)for(const a of prior)for(const b of slab){
   budget.tick();if(r.cmp(max(yAt(a.lo,x0),yAt(b.lo,x0)),min(yAt(a.hi,x0),yAt(b.hi,x0)))<0){if(a.expected===b.expected)aComponents.join(a.id,b.id);if(a.actual===b.actual)bComponents.join(a.id,b.id);}
  }
  slabs.push(slab);
 }
 const count=(components:Components,flag:'expected'|'actual',inside:boolean)=>new Set(cells.filter(c=>c[flag]===inside).map(c=>components.root(c.id))).size;
 const inside=count(aComponents,'expected',true),holes=count(aComponents,'expected',false)-1;
 if(inside!==count(bComponents,'actual',true)||holes!==count(bComponents,'actual',false)-1)fail();
 // Require a two-way correspondence for every occupied AND exterior component,
 // not just equal totals (balanced merging/splitting is still wrong topology).
 for(const occupied of [false,true]){
  const forward=new Map<number,Set<number>>(),backward=new Map<number,Set<number>>();
  for(const c of cells)if(c.expected===occupied&&c.actual===occupied){const a=aComponents.root(c.id),b=bComponents.root(c.id);if(!forward.has(a))forward.set(a,new Set());if(!backward.has(b))backward.set(b,new Set());forward.get(a)!.add(b);backward.get(b)!.add(a);}
  if(forward.size!==count(aComponents,'expected',occupied)||backward.size!==count(bComponents,'actual',occupied)||[...forward.values(),...backward.values()].some(s=>s.size!==1))fail();
 }
 return{slabs:slabs.length,cells:cells.length,components:inside,holes};
}
