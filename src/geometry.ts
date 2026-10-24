import {FlattenBudget,flattenCertifiedCubic,type FlattenLimits} from './geometryCore/flattenCertified';
import paper from 'paper';
import {orientation,segmentsMeet,polygonContains,NumericBudget,BOOLEAN_VALIDATION_BUDGET} from './geometryCore/exactPredicates';
import {CurveApproximationError,documentCubicRanges,hasNoncollinearPoints} from './curveApproximationSafety';
import {polygonAreaRange,areaMagnitude,GEOMETRY_UNVERIFIED} from './geometrySafety';
import type { Contour, Shape, Vertex } from './types';
import { geometrySettings, NUMERIC_EPSILON_MM as EPS, validNumber } from './units';
import {MAX_SOURCE_SEGMENTS,MAX_SOURCE_CONTOURS,MAX_FLATTEN_POINTS,MAX_DXF_POINTS} from './processingLimits';
export function pathsOf(source: Shape): paper.Path[] {
  return source instanceof paper.Path ? [source] : source.children as paper.Path[];
}
export function cleanVertices(points: Vertex[], closed: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (const p of points) {
    if (!validNumber(p.x) || !validNumber(p.y)) throw new Error('Geometry exceeds the supported coordinate range (±1,000,000 mm).');
    const last = result.at(-1);
    if (!last || Math.hypot(p.x-last.x, p.y-last.y) > EPS) result.push({x:p.x,y:p.y});
  }
  if (closed && result.length > 1 && distance(result[0],result[result.length-1]) <= EPS) result.pop();
  return result;
}
export function validateGeometryInput(objects:readonly Shape[]):void {
  let segments=0,contours=0;
  for(const object of objects)for(const path of pathsOf(object)){
    if(++contours>MAX_SOURCE_CONTOURS||(segments+=path.segments.length)>MAX_SOURCE_SEGMENTS)
      throw new Error('This geometry is too complex to process. Simplify the paths or process fewer objects.');
  }
}
// Paper 0.12.18 exposes these scalar cubic operations at runtime but omits
// their declarations. Use its own predicates to preserve Path.flatten semantics.
const cubic=paper.Curve as unknown as {
  isStraight(values:number[]):boolean;
  isFlatEnough(values:number[],tolerance:number):boolean;
  subdivide(values:number[],time:number):[number[],number[]];
};
export function flattenInDocument(source: Shape, toleranceMM=geometrySettings.flattenToleranceMM,maxPoints=MAX_FLATTEN_POINTS,maxWork=MAX_SOURCE_SEGMENTS+2*maxPoints,limits:FlattenLimits={}): Contour[] {
  if(!Number.isFinite(toleranceMM)||toleranceMM<=0||!Number.isInteger(maxPoints)||maxPoints<0||maxPoints>MAX_DXF_POINTS||!Number.isInteger(maxWork)||maxWork<0||maxWork>MAX_SOURCE_SEGMENTS+2*MAX_DXF_POINTS)throw new Error('Invalid curve processing limits.');
  validateGeometryInput([source]);
  let count=0;const budget=new FlattenBudget(toleranceMM,maxWork,limits);
  return pathsOf(source).map(path=>{
    const points:Vertex[]=[];let end:Vertex|undefined,nonconstant=false,hasLoop=false;
    const matrices:number[][]=[];for(let item:paper.Item|null=path;item;item=item.parent)matrices.push(item.matrix.values);
    const global=path.globalMatrix.values;
    const append=(x:number,y:number)=>{
      if(!validNumber(x)||!validNumber(y))throw new Error('Geometry exceeds the supported coordinate range (±1,000,000 mm).');
      const last=points.at(-1);if(last&&x===last.x&&y===last.y)return;
      if(count>=maxPoints)throw new CurveApproximationError('points',toleranceMM);
      count++;budget.stats.points=count;points.push({x,y});
    };
    const length=path.segments.length,curves=path.closed?length:Math.max(0,length-1);
    for(let i=0;i<curves;i++){
      const a=path.segments[i],b=path.segments[(i+1)%length];
      const p0=path.localToGlobal(a.point),p1=path.localToGlobal(a.point.add(a.handleOut)),p2=path.localToGlobal(b.point.add(b.handleIn)),p3=path.localToGlobal(b.point);
      const values=[p0.x,p0.y,p1.x,p1.y,p2.x,p2.y,p3.x,p3.y];
      // Paper Point.isZero uses an epsilon; constancy here must be exact.
      const sameAnchor=a.point.x===b.point.x&&a.point.y===b.point.y;
      const constant=sameAnchor&&a.handleOut.x===0&&a.handleOut.y===0&&b.handleIn.x===0&&b.handleIn.y===0;nonconstant ||= !constant;hasLoop ||= !constant&&sameAnchor;
      flattenCertifiedCubic(values,documentCubicRanges(a.point,a.handleOut,b.point,b.handleIn,matrices,global,values),constant,budget,{
        split:v=>cubic.subdivide(v,.5),compatibilitySplit:(v,t)=>!cubic.isStraight(v)&&!cubic.isFlatEnough(v,t)
      },leaf=>{append(leaf[0],leaf[1]);end={x:leaf[6],y:leaf[7]};});
    }
    if(!path.closed&&end)append(end.x,end.y);
    if(path.closed&&points.length>1&&points[0].x===points.at(-1)!.x&&points[0].y===points.at(-1)!.y){points.pop();count--;budget.stats.points=count;}
    if((path.closed||hasLoop)&&nonconstant&&!hasNoncollinearPoints(points))throw new CurveApproximationError('topology',toleranceMM);
    return {closed:path.closed,points};
  });
}
export function distance(a:Vertex,b:Vertex):number { return Math.hypot(a.x-b.x,a.y-b.y); }
export function signedArea(p:Vertex[]):number { const area=polygonAreaRange(p);if(p.length>=3)areaMagnitude(area);return area.value; }
export function contains(p:Vertex[],v:Vertex):boolean {return polygonContains([p],v);}
export function exteriorContours(contours:Contour[]):Contour[] {
  const areas=contours.map(c=>areaMagnitude(polygonAreaRange(c.points)));
  return contours.filter((c,i)=>!contours.some((other,j)=>{
    if(i===j||!contains(other.points,c.points[0]))return false;
    if(areas[j][0]>areas[i][1])return true;
    if(areas[j][1]<areas[i][0])return false;
    throw new Error(GEOMETRY_UNVERIFIED);
  }));
}
export function validateOutlineContours(contours:Contour[]):void {
  if(!contours.length) throw new Error('Select a closed shape first.');
  const count=contours.reduce((n,c)=>n+c.points.length,0);if(count*(count-1)/2>1000000)throw new Error(BOOLEAN_VALIDATION_BUDGET);
  const budget=new NumericBudget(4000000);
  for(const {points:p,closed} of contours) {
    if(!closed) throw new Error('Sticker outlines require closed paths.');
    if(p.length<3) throw new Error('The selected shape has too few vertices.');
    // Area sign must be resolved in mm²; a length epsilon is not an area floor.
    areaMagnitude(polygonAreaRange(p));
    if(p.length>12000) throw new Error('This shape has too many vertices for the MVP. Increase the curve tolerance.');
    for(let i=0;i<p.length;i++) {
      const prev=p[(i+p.length-1)%p.length],next=p[(i+1)%p.length],at=p[i];
      if(at.x===next.x&&at.y===next.y)throw new Error('The selected path has a zero-length edge.');
      if(orientation(prev,at,next,budget)===0&&(prev.x!==at.x?(prev.x>at.x)===(next.x>at.x):(prev.y>at.y)===(next.y>at.y))) throw new Error('The selected path doubles back on itself.');
      for(let j=i+1;j<p.length;j++) {
        if(j===i+1 || (i===0 && j===p.length-1)) continue;
        if(segmentsMeet(p[i],next,p[j],p[(j+1)%p.length],budget)) throw new Error('Self-intersecting paths cannot produce a sticker outline.');
      }
    }
  }
  for(let i=0;i<contours.length;i++) for(let j=i+1;j<contours.length;j++) {
    const a=contours[i].points,b=contours[j].points;
    for(let k=0;k<a.length;k++) for(let l=0;l<b.length;l++) if(segmentsMeet(a[k],a[(k+1)%a.length],b[l],b[(l+1)%b.length],budget)) throw new Error('Contours must not cross or touch one another.');
  }
}
