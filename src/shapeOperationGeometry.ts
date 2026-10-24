import {canEdit} from './model/entityAccess';
import paper from 'paper';
import {paperAreaRange,areaMagnitude,pointInsideContours,rectangleAreaRange,sumAreaRanges,areaComparisonUncertainty,GEOMETRY_UNVERIFIED,type AreaRange} from './geometrySafety';
import {BooleanLocalFrame} from './geometryCore/localFrame';
import {ExactArithmetic,NumericBudget} from './geometryCore/exactPredicates';
import {validateUncutCurves} from './geometryCore/uncutCurveValidation';
import {validatePolygonBoolean,type PolygonRegion} from './geometryCore/polygonBooleanValidation';
import {documentPath} from './deletion';
import {pathsOf} from './geometry';
import {validNumber} from './units';
import type {Shape} from './types';

export type ShapeOperation='weld'|'subtract'|'intersect';
export const OPERATION_LABELS:Record<ShapeOperation,string>={weld:'Weld',subtract:'Subtract',intersect:'Intersect'};

export function eligibleForShapeOperation(sources:readonly Shape[]):boolean {
 return sources.length>1&&sources.every(s=>s.layer===sources[0].layer&&canEdit(s)&&!s.data.text&&!s.data.dimension&&pathsOf(s).length>0&&pathsOf(s).every(p=>p.closed&&p.curves.length>1));
}

/** Protect the world-frame area signs used by Paper winding/orientation.
 * This is a refusal boundary, not a general cubic-Boolean certificate. */
function verifyAreaSigns(shape:Shape):void {
 for(const path of pathsOf(shape)){
  if(!path.globalMatrix.isIdentity())throw new Error(GEOMETRY_UNVERIFIED);
  const range=paperAreaRange(path.curves.map(c=>c.values));areaMagnitude(range);
  if(!Number.isFinite(path.area)||path.area<range.lower||path.area>range.upper||Math.sign(path.area)!==Math.sign(range.lower))throw new Error(GEOMETRY_UNVERIFIED);
 }
}
/** Independent contradiction checks for axis-aligned inputs: every nominal
 * input-cell midpoint plus occupied-area consistency. Paper may return tiny
 * slanted straight edges from rounding, so these witnesses are NOT a proof of
 * arbitrary topology or exact cell equality. No output vertex is moved. */
function verifyAxisOccupancy(inputs:readonly Shape[],result:Shape,operation:ShapeOperation):void {
 const monotone=(a:number,b:number,c:number,d:number)=>(a<=b&&b<=c&&c<=d)||(a>=b&&b>=c&&c>=d);
 const axis=(shape:Shape)=>pathsOf(shape).every(path=>path.curves.every(curve=>{
  const [x0,y0,x1,y1,x2,y2,x3,y3]=curve.values;
  return(x0===x1&&x1===x2&&x2===x3&&monotone(y0,y1,y2,y3))||(y0===y1&&y1===y2&&y2===y3&&monotone(x0,x1,x2,x3));
 }));
 if(!inputs.every(axis))return;
 if(!axis(result)&&pathsOf(result).some(path=>path.segments.some(s=>!s.handleIn.isZero()||!s.handleOut.isZero())))throw new Error(GEOMETRY_UNVERIFIED);
 const contours=[...inputs,result].map(shape=>pathsOf(shape).map(path=>path.segments.map(s=>s.point))),inputPoints=contours.slice(0,-1).flat(2),output=contours.at(-1)!;
 const xs=[...new Set(inputPoints.map(p=>p.x))].sort((a,b)=>a-b),ys=[...new Set(inputPoints.map(p=>p.y))].sort((a,b)=>a-b),outputPoints=output.flat();
 // Count independent point/edge comparisons, not a geometric tolerance.
 if((xs.length-1)*(ys.length-1)*(inputPoints.length+outputPoints.length)+output.length*outputPoints.length>1_000_000)throw new Error('This operation cannot be verified safely within the validation budget. Your original paths are unchanged. Work with fewer contours.');
 const cells:AreaRange[]=[];let smallestCellArea=Infinity;
 for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
  const point={x:xs[i-1]+(xs[i]-xs[i-1])/2,y:ys[j-1]+(ys[j]-ys[j-1])/2};
  if(!(point.x>xs[i-1]&&point.x<xs[i]&&point.y>ys[j-1]&&point.y<ys[j]))throw new Error(GEOMETRY_UNVERIFIED);
  const input=inputs.map((s,k)=>pointInsideContours(contours[k],point,s.fillRule==='evenodd'));
  const expected=operation==='weld'?input.some(Boolean):operation==='intersect'?input.every(Boolean):input[0]&&!input.slice(1).some(Boolean);
  if(pointInsideContours(output,point)!==expected)throw new Error(GEOMETRY_UNVERIFIED);
  const cell=rectangleAreaRange(xs[i-1],ys[j-1],xs[i],ys[j]);smallestCellArea=Math.min(smallestCellArea,cell.lower);if(expected)cells.push(cell);
 }
 const areas=output.map((points,i)=>{
  const area=paperAreaRange(pathsOf(result)[i].curves.map(c=>c.values)),[lo,hi]=areaMagnitude(area);
  const depth=output.reduce((n,other,j)=>n+(i!==j&&pointInsideContours([other],points[0])?1:0),0);
  return depth%2?{value:-Math.abs(area.value),lower:-hi,upper:-lo}:{value:Math.abs(area.value),lower:lo,upper:hi};
 });
 const expected=sumAreaRanges(cells),actual=sumAreaRanges(areas);
 if(actual.upper<expected.lower||actual.lower>expected.upper||smallestCellArea<=areaComparisonUncertainty(actual,expected))throw new Error(GEOMETRY_UNVERIFIED);
}

/** Exact monotone straight curves can be checked as segment images without
 * changing their handles or substituting an approximation in the result. */
function polygonRegion(shape:Shape):PolygonRegion|null {
 const contours=[],r=new ExactArithmetic(new NumericBudget(250000)),zero=r.q(0n);
 for(const path of pathsOf(shape)){
  for(let i=0;i<path.segments.length;i++){
   const a=path.segments[i],b=path.segments[(i+1)%path.segments.length];
   if(a.handleOut.x===0&&a.handleOut.y===0&&b.handleIn.x===0&&b.handleIn.y===0)continue;
   if(a.point.x===b.point.x&&a.point.y===b.point.y)return null;
   const dx=r.sub(r.number(b.point.x),r.number(a.point.x)),dy=r.sub(r.number(b.point.y),r.number(a.point.y));
   for(const h of [a.handleOut,b.handleIn])if(r.cmp(r.mul(dx,r.number(h.y)),r.mul(dy,r.number(h.x)))!==0)return null;
   const axis=a.point.x!==b.point.x?'x':'y',delta=axis==='x'?dx:dy,values=[zero,r.number(a.handleOut[axis]),r.add(delta,r.number(b.handleIn[axis])),delta],direction=r.cmp(delta,zero);
   if(!values.every((x,i)=>!i||r.cmp(x,values[i-1])*direction>=0))throw new Error(GEOMETRY_UNVERIFIED);
  }
  contours.push(path.segments.map(s=>({x:s.point.x,y:s.point.y})));
 }
 return {contours,evenOdd:shape.fillRule==='evenodd'};
}

/** Detached Boolean operands, numeric-only local frame, validated world result. */
export function buildShapeOperation(sources:readonly Shape[],operation:ShapeOperation):Shape {
 if(!['weld','subtract','intersect'].includes(operation))throw new Error(GEOMETRY_UNVERIFIED);
 if(!eligibleForShapeOperation(sources))throw new Error('Select two or more closed paths on the same visible, unlocked layer. Convert text to paths first.');
 if(sources.length>100||sources.reduce((n,s)=>n+pathsOf(s).reduce((m,p)=>m+p.curves.length,0),0)>2000)throw new Error('This selection is too detailed. Work with fewer shapes at a time.');
 const sorted=[...sources].sort((a,b)=>a.index-b.index),base=sorted[0];
 const copy=(source:Shape):Shape=>{const paths=pathsOf(source).map(path=>path.globalMatrix.isIdentity()?new paper.Path({insert:false,closed:path.closed,segments:path.segments.map(s=>s.clone())}):documentPath(path)),shape:Shape=paths.length===1?paths[0]:new paper.CompoundPath({insert:false,children:paths});shape.fillRule=source.fillRule;return shape;};
 const inputs:Shape[]=[],world:Shape[]=[];let result:Shape|undefined;
 try{
  sorted.forEach(s=>world.push(copy(s)));
  const polygons=world.map(polygonRegion),straight=polygons.every(p=>p!==null),frame=new BooleanLocalFrame(world.flatMap(pathsOf));
  world.forEach(s=>{const local=copy(s);pathsOf(local).forEach(p=>frame.condition(p));verifyAreaSigns(local);inputs.push(local);});
  result=copy(inputs[0]);
  for(const operand of inputs.slice(1)){
   const next=(operation==='weld'?result.unite(operand,{insert:false}):operation==='subtract'?result.subtract(operand,{insert:false}):result.intersect(operand,{insert:false})) as Shape;
   result.remove();result=next;
   if(!pathsOf(result).some(p=>p.curves.length>1))throw new Error('The result is empty. Choose another operation or adjust the shapes.');
   verifyAreaSigns(result);
   if(pathsOf(result).reduce((n,p)=>n+p.segments.length,0)>10000)throw new Error('The result is too detailed. Work with fewer shapes at a time.');
  }
  // Retain /A's independent axis witnesses and mm² guard in the numerically
  // suitable frame, then add the stronger full straight-region arrangement.
  verifyAxisOccupancy(inputs,result,operation);
  frame.restore(result);
  if(pathsOf(result).some(p=>!p.closed||p.segments.some(s=>[s.point,s.point.add(s.handleIn),s.point.add(s.handleOut)].some(q=>!validNumber(q.x)||!validNumber(q.y)))))throw new Error(GEOMETRY_UNVERIFIED);
  const output=polygonRegion(result);
  if(straight){if(!output)throw new Error(GEOMETRY_UNVERIFIED);output.evenOdd=true;validatePolygonBoolean(polygons as PolygonRegion[],output,operation,frame.errorMM);}
  else{const selected=validateUncutCurves(world,result,operation,frame.errorMM,frame.extent),contours=selected.map(p=>new paper.Path({insert:false,closed:true,segments:p.segments.map(s=>s.clone())}));result.remove();result=contours.length===1?contours[0]:new paper.CompoundPath({insert:false,children:contours});}
  // Both the native writer and the existing SVG/DXF writers must retain every
  // nonzero edge. This is a format-quantization refusal, not a minimum mm size.
  for(const path of pathsOf(result))for(let i=0;i<path.segments.length;i++){const a=path.segments[i].point,b=path.segments[(i+1)%path.segments.length].point;for(const precision of [8,12])for(const round of [(v:number)=>Number(v.toFixed(precision)),(v:number)=>Math.round(v*10**precision)/10**precision])if((a.x!==b.x||a.y!==b.y)&&(round(a.x)===round(b.x)&&round(a.y)===round(b.y)||round(b.x-a.x)===0&&round(b.y-a.y)===0))throw new Error(GEOMETRY_UNVERIFIED);}
  result.style=base.style;result.opacity=base.opacity;result.fillRule='evenodd';
  result.data={uid:crypto.randomUUID(),role:base.data.role,name:OPERATION_LABELS[operation],rotationDegrees:0,customColour:base.data.customColour,customStroke:base.data.customStroke,fillPaint:base.data.fillPaint?structuredClone(base.data.fillPaint):undefined};
  if(base.data.regionFill){result.data.regionFill=true;result.data.regionFillColor=base.data.regionFillColor;}
  if(base.data.rasterTrace?.mode==='fill')result.data.rasterTrace={mode:'fill'};
  return result;
 }catch(error){result?.remove();throw error;}finally{inputs.forEach(input=>input.remove());world.forEach(input=>input.remove());}
}
