import paper from 'paper';
import type {ArcGeometry} from '../arc';
import {MAX_COORDINATE_MM,MIN_DIMENSION_MM} from '../units';

const mismatch=():never=>{throw new Error('Arc parameters disagree with the represented curve geometry. The original drawing is unchanged.');};
export const normalizedArcAngle=(angle:number):number=>((angle%360)+360)%360;
/** Editable circular identity is the established equal-span tangent-cubic
 * construction, not a claim that polynomial cubics are exact circles. Compare
 * EVERY anchor and handle in document mm; no visual fitting or flattening.
 * 4e-12 covers v1's 12-place point/vector writes and reconstruction. The bounded
 * binary64 allowance covers trig and ordinary affine evaluation at this scale;
 * it is not the application's joining/flattening/manufacturing tolerance.
 * Paper's legacy Arc allows a span up to 90+1e-5 degrees at its count boundary. */
export function assertCircularIdentity(item:paper.Item,arc:ArcGeometry=item.data.arc,local=false):{maxErrorMM:number;budgetMM:number;spans:number} {
 if(!(item instanceof paper.Path)||!arc||item.closed||item.data.text||item.data.dimension)mismatch();
 if(![arc.cx,arc.cy,arc.radius,arc.start,arc.sweep].every(Number.isFinite)||Math.abs(arc.cx)>MAX_COORDINATE_MM||Math.abs(arc.cy)>MAX_COORDINATE_MM||arc.radius<MIN_DIMENSION_MM||arc.radius>MAX_COORDINATE_MM||Math.abs(arc.start)>1e12||Math.abs(arc.sweep)<1||Math.abs(arc.sweep)>359)mismatch();
 const path=item as paper.Path,spans=path.segments.length-1,step=arc.sweep/spans;
 if(spans<1||spans>4||Math.abs(step)>90+1e-5)mismatch();
 const budgetMM=4e-12+64*Number.EPSILON*Math.max(1,Math.abs(arc.cx),Math.abs(arc.cy),arc.radius);
 const matrix=local?new paper.Matrix():path.globalMatrix,[a,b,c,d]=matrix.values;
 if(!matrix.values.every(Number.isFinite))mismatch();
 let maxErrorMM=0;
 const compare=(actual:paper.Point,x:number,y:number)=>{
  const error=Math.max(Math.abs(actual.x-x),Math.abs(actual.y-y));
  if(!Number.isFinite(error)||error>budgetMM)mismatch();maxErrorMM=Math.max(maxErrorMM,error);
 };
 const vector=(p:paper.Point)=>new paper.Point(a*p.x+c*p.y,b*p.x+d*p.y);
 const start=normalizedArcAngle(arc.start),k=4/3*Math.tan(step*Math.PI/720)*arc.radius;
 for(const [i,s] of path.segments.entries()){
  const angle=normalizedArcAngle(start+i*step)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),tx=-sin*k,ty=cos*k;
  compare(matrix.transform(s.point),arc.cx+arc.radius*cos,arc.cy+arc.radius*sin);
  compare(vector(s.handleIn),i?-tx:0,i?-ty:0);
  compare(vector(s.handleOut),i<spans?tx:0,i<spans?ty:0);
 }
 return {maxErrorMM,budgetMM,spans};
}

/** A newly supplied detached Path may still carry its constructor's LOCAL arc
 * parameters and a known affine matrix. Verify local construction first, then
 * promote metadata to world space for a proven similarity. Known nonuniform
 * deformation explicitly becomes a freeform curve, retaining every control.
 * Never use this compatibility bridge on native files or committed mutations. */
export function adoptDetachedArcFrame(item:paper.Item):void {
 if(item.data.arc===undefined)return;
 const m=item.globalMatrix,[ma,mb,mc,md]=m.values,similarity=ma===md&&mb===-mc||ma===-md&&mb===mc;
 // A known nonuniform frame never gains circular authority via the numeric
 // comparison budget, even for a tiny deformation at a large coordinate.
 if(!item.isInserted()&&!similarity){
  try{assertCircularIdentity(item,item.data.arc,true);}catch{assertCircularIdentity(item);return;}
  delete item.data.arc;return;
 }
 try{assertCircularIdentity(item);return;}catch{/* Only a verified detached local construction may be promoted. */}
 if(item.isInserted()||!(item instanceof paper.Path))mismatch();
 const arc={...item.data.arc} as ArcGeometry;assertCircularIdentity(item,arc,true);
 const matrix=item.globalMatrix,[a,b,c,d]=matrix.values;
 if(matrix.isIdentity())mismatch();
 const positive=a===d&&b===-c,negative=a===-d&&b===c;
 if(!positive&&!negative){delete item.data.arc;return;}
 const scale=Math.hypot(a,b);if(!scale)mismatch();
 const center=matrix.transform(new paper.Point(arc.cx,arc.cy)),angle=normalizedArcAngle(arc.start)*Math.PI/180;
 const x=a*Math.cos(angle)+c*Math.sin(angle),y=b*Math.cos(angle)+d*Math.sin(angle);
 const world={...arc,cx:center.x,cy:center.y,radius:arc.radius*scale,start:normalizedArcAngle(Math.atan2(y,x)*180/Math.PI),sweep:negative?-arc.sweep:arc.sweep};
 assertCircularIdentity(item,world);item.data.arc=world;
}

export interface CircularMeasurement {
 kind:'circle'|'arc';center:paper.Point;radius:number;
}
interface CircularControls {points:paper.Point[];ins:paper.Point[];outs:paper.Point[];anchorBudget:number;handleBudget:number}
const kappa=4*(Math.SQRT2-1)/3;
const quarter=(v:paper.Point,direction:number)=>new paper.Point(-direction*v.y,direction*v.x);
const similarity=(m:paper.Matrix)=>{const [a,b,c,d]=m.values;return (a===d&&b===-c||a===-d&&b===c)&&Math.hypot(a,b)>0;};
function measurementControls(path:paper.Path,local=false):CircularControls|null {
 const matrix=local?new paper.Matrix():path.globalMatrix,[a,b,c,d,tx,ty]=matrix.values;
 if(!matrix.values.every(Number.isFinite))return null;
 let anchorScale=1,handleScale=1,localScale=1;
 const points:paper.Point[]=[],ins:paper.Point[]=[],outs:paper.Point[]=[];
 for(const s of path.segments){
  if(![s.point,s.handleIn,s.handleOut].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
  localScale=Math.max(localScale,Math.abs(s.point.x),Math.abs(s.point.y));
  points.push(matrix.transform(s.point));anchorScale=Math.max(anchorScale,Math.abs(a*s.point.x),Math.abs(c*s.point.y),Math.abs(b*s.point.x),Math.abs(d*s.point.y),Math.abs(tx),Math.abs(ty));
  for(const [handle,target] of [[s.handleIn,ins],[s.handleOut,outs]] as const){
   target.push(new paper.Point(a*handle.x+c*handle.y,b*handle.x+d*handle.y));
   handleScale=Math.max(handleScale,Math.abs(a*handle.x),Math.abs(c*handle.y),Math.abs(b*handle.x),Math.abs(d*handle.y));
  }
 }
 if(![...points,...ins,...outs].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
 // VEC-003's v1 writer/evaluation allowance. Paper's baked transforms
 // recover a handle by subtracting two absolute positions: allow one local
 // coordinate ULP for those two roundings, propagated through the frame.
 // Otherwise translation uncertainty belongs to anchors, not tangent lengths.
 const bakedUlp=2**(Math.floor(Math.log2(localScale))-52)*Math.max(Math.abs(a)+Math.abs(c),Math.abs(b)+Math.abs(d));
 const anchorBudget=4e-12+64*Number.EPSILON*anchorScale,handleBudget=4e-12+64*Number.EPSILON*handleScale+bakedUlp;
 // An ill-conditioned frame cannot buy authority with an unbounded allowance.
 const ceiling=4e-12+128*Number.EPSILON*MAX_COORDINATE_MM;
 if(!Number.isFinite(anchorBudget+handleBudget)||!local&&(anchorBudget>ceiling||handleBudget>ceiling))return null;
 return {points,ins,outs,anchorBudget,handleBudget};
}
const close=(a:paper.Point,b:paper.Point,budget:number)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))<=budget;
function closedMeasurement(c:CircularControls,local=false):CircularMeasurement|null {
 const {points,ins,outs,anchorBudget,handleBudget}=c;
 const direction=Math.sign(outs[0].cross(outs[1]));if(!direction)return null;
 // The chosen tangent determines both the centre and radial basis. Compose
 // its /kappa uncertainty twice, plus the two compared anchor uncertainties.
 const anchorMatch=2*anchorBudget+2*handleBudget/kappa,handleMatch=2*handleBudget;
 // Radius comes from ONE canonical tangent, not averaged unequal bounds/axes.
 // This also avoids losing a small radius to a large translated anchor.
 let radial=quarter(outs[0],-direction).divide(kappa);
 const radius=radial.length,center=points[0].subtract(radial);
 if(!Number.isFinite(radius)||radius<=0||!local&&(radius<MIN_DIMENSION_MM-handleBudget||radius>MAX_COORDINATE_MM+handleBudget))return null;
 for(let i=0;i<4;i++){
  const tangent=quarter(radial,direction).multiply(kappa);
  if(!close(points[i],center.add(radial),anchorMatch)||!close(outs[i],tangent,handleMatch)||!close(ins[i],tangent.multiply(-1),handleMatch))return null;
  radial=quarter(radial,direction);
 }
 // Report one validated opposite-anchor diameter. Unlike a tangent-derived
 // value this preserves the exact canonical R10/R20 values after v1 writes.
 // This does not average unequal axes or fit a new circle to an ellipse.
 const opposite=points[2].subtract(points[0]);
 return {kind:'circle',center:points[0].add(opposite.multiply(.5)),radius:opposite.length/2};
}
function openMeasurement(c:CircularControls,local=false):CircularMeasurement|null {
 const {points,ins,outs,anchorBudget,handleBudget}=c;
 if(ins[0].length>handleBudget||outs.at(-1)!.length>handleBudget)return null;
 // Infer a construction from tangent DIRECTIONS and one tangent length,
 // not the intersection of almost parallel lines at large world coordinates.
 // Untagged spans with |sin(angle)| <= 1e-4 are deliberately unqualified;
 // validated nominal metadata remains the route for shallow editable arcs.
 const sweeps:number[]=[];
 for(let i=0;i<points.length-1;i++){
  if(outs[i].length<=handleBudget||ins[i+1].length<=handleBudget)return null;
  const from=outs[i].normalize(),to=ins[i+1].multiply(-1).normalize(),sweep=Math.atan2(from.cross(to),from.dot(to));
  if(Math.abs(Math.sin(sweep))<=1e-4||Math.abs(sweep)>Math.PI/2+2e-7)return null;
  sweeps.push(sweep);
 }
 const firstK=4/3*Math.tan(sweeps[0]/4),firstRadial=quarter(outs[0],-1).divide(firstK),radius=firstRadial.length,center=points[0].subtract(firstRadial);
 if(!Number.isFinite(radius)||radius<=0||!local&&(radius<MIN_DIMENSION_MM-handleBudget||radius>MAX_COORDINATE_MM+handleBudget))return null;
 let total=0;
 for(let i=0;i<sweeps.length;i++){
  const sweep=sweeps[i],k=4/3*Math.tan(sweep/4);
  if(total*sweep<0)return null;
  const r0=quarter(outs[i],-1).divide(k).normalize(radius),r1=quarter(ins[i+1],1).divide(k).normalize(radius);
  if(!close(points[i],center.add(r0),anchorBudget)||!close(points[i+1],center.add(r1),anchorBudget))return null;
  if(!close(outs[i],quarter(r0,1).multiply(k),handleBudget)||!close(ins[i+1],quarter(r1,-1).multiply(k),handleBudget))return null;
  total+=sweep;
 }
 if(Math.abs(total)>=2*Math.PI-1e-8)return null;
 return {kind:'arc',center,radius};
}
/** Nominal circular-construction recognition for NEW R/diameter measurements.
 * Cubic circle/arc controls are polynomial approximations, not exact rational
 * circles. Require every world-space anchor and tangent to match the supported
 * construction within the bounded writer/evaluation allowance above. No visual
 * fitting, sampled roundness, name/primitive hint, or mutation is permitted.
 * A known nonsimilarity of a local circular construction is an ellipse even
 * below the residual budget. A compensated affine frame remains admissible if
 * only its WORLD controls describe a circle (the existing VEC-003 contract).
 */
export function circularMeasurement(item:paper.Item):CircularMeasurement|null {
 if(!(item instanceof paper.Path)||item.data.text||item.data.dimension)return null;
 const path=item;
 if(path.segments.length<2||path.segments.length>5||path.closed&&path.segments.length!==4)return null;
 const controls=measurementControls(path);if(!controls)return null;
 if(!similarity(path.globalMatrix)){
  const local=measurementControls(path,true);
  if(local&&(path.closed?closedMeasurement(local,true):openMeasurement(local,true)))return null;
 }
 if(path.data.arc!==undefined){
  try{assertCircularIdentity(path);}catch{return null;}
  const arc=path.data.arc as ArcGeometry,spans=path.segments.length-1,step=arc.sweep/spans,k=4/3*Math.tan(step*Math.PI/720)*arc.radius;
  for(let i=0;i<=spans;i++){
   const angle=normalizedArcAngle(normalizedArcAngle(arc.start)+i*step)*Math.PI/180,tangent=new paper.Point(-Math.sin(angle)*k,Math.cos(angle)*k),zero=new paper.Point(0,0);
   if(!close(controls.outs[i],i<spans?tangent:zero,controls.handleBudget)||!close(controls.ins[i],i?tangent.multiply(-1):zero,controls.handleBudget))return null;
  }
  return {kind:'arc',center:new paper.Point(arc.cx,arc.cy),radius:arc.radius};
 }
 return path.closed?closedMeasurement(controls):openMeasurement(controls);
}
