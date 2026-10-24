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
