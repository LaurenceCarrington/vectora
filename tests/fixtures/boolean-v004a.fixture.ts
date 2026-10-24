import {canEdit} from './model/entityAccess';
import paper from 'paper';
import {paperAreaRange,areaMagnitude,pointInsideContours,rectangleAreaRange,sumAreaRanges,areaComparisonUncertainty,GEOMETRY_UNVERIFIED,type AreaRange} from './geometrySafety';
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

/** Boolean occupancy in document coordinates. Source items are never modified or inserted. */
export function buildShapeOperation(sources:readonly Shape[],operation:ShapeOperation):Shape {
 if(!eligibleForShapeOperation(sources))throw new Error('Select two or more closed paths on the same visible, unlocked layer. Convert text to paths first.');
 if(sources.length>100||sources.reduce((n,s)=>n+pathsOf(s).reduce((m,p)=>m+p.curves.length,0),0)>2000)throw new Error('This selection is too detailed. Work with fewer shapes at a time.');
 const sorted=[...sources].sort((a,b)=>a.index-b.index),base=sorted[0];
 const copy=(source:Shape):Shape=>{
  const paths=pathsOf(source).map(documentPath);
  const shape:Shape=paths.length===1?paths[0]:new paper.CompoundPath({insert:false,children:paths});
  shape.fillRule=source.fillRule;return shape;
 };
 const inputs:Shape[]=[];let result:Shape|undefined;
 try{
  result=copy(base);inputs.push(result);verifyAreaSigns(result);
  for(const source of sorted.slice(1)){
   const operand=copy(source);inputs.push(operand);
   try{
    verifyAreaSigns(operand);
    const next=(operation==='weld'?result.unite(operand,{insert:false}):operation==='subtract'?result.subtract(operand,{insert:false}):result.intersect(operand,{insert:false})) as Shape;
    result.remove();result=next;
   }finally{operand.remove();}
   verifyAreaSigns(result);
   if(!pathsOf(result).some(p=>p.curves.length>1&&Math.abs(p.area)>1e-10))throw new Error('The result is empty. Choose another operation or adjust the shapes.');
   if(pathsOf(result).reduce((n,p)=>n+p.segments.length,0)>10000)throw new Error('The result is too detailed. Work with fewer shapes at a time.');
  }
  if(pathsOf(result).some(p=>!p.closed||p.segments.some(s=>[s.point,s.point.add(s.handleIn),s.point.add(s.handleOut)].some(q=>!validNumber(q.x)||!validNumber(q.y)))))throw new Error('The result exceeds the document bounds. Move the shapes closer to the origin.');
  verifyAxisOccupancy(inputs,result,operation);
  result.style=base.style;result.opacity=base.opacity;result.fillRule='evenodd';
  result.data={uid:crypto.randomUUID(),role:base.data.role,name:OPERATION_LABELS[operation],rotationDegrees:0,customColour:base.data.customColour,customStroke:base.data.customStroke,fillPaint:base.data.fillPaint?structuredClone(base.data.fillPaint):undefined};
  // Preserve fill semantics when the result is transferred to another document layer.
  if(base.data.regionFill){result.data.regionFill=true;result.data.regionFillColor=base.data.regionFillColor;}
  if(base.data.rasterTrace?.mode==='fill')result.data.rasterTrace={mode:'fill'};
  return result;
 }catch(error){result?.remove();throw error;}finally{inputs.forEach(input=>input.remove());}
}
