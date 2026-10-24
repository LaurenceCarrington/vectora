import {test,expect} from './fixtures';
import {routeCurveBaseline} from './curveAdaptiveHelpers';
test('VEC005B before/after approximation timing, points and depth on the preserved exact baseline',async({page})=>{
 await routeCurveBaseline(page);await page.goto('http://127.0.0.1:5174');
 const rows=await page.evaluate(async()=>{
  const p=(window as any).__paper,old=await import('/__v005a_geometry.js'),now=await import('/src/geometry.ts'),rows=[];
  for(const [scale,tolerance,offset]of [[1000,.001,0],[1000,.05,0],[10000,.001,0],[10000,.05,0],[10,.03,0],[.001,1e-6,900000],[100,1e-5,0]]){
   const path=new p.Path({insert:false,segments:[new p.Segment([offset,offset],[0,0],[0,scale]),new p.Segment([offset+scale,offset],[0,scale],[0,0])]});const before=path.exportJSON({precision:16});
   for(const [label,engine]of [['baseline',old],['current',now]]as const){const times=[],attempts=[];for(let k=0;k<5;k++){
    const depths=new WeakMap<number[],number>(),original=p.Curve.subdivide;let nodes=0,depth=0;const statistics:any={};
    p.Curve.subdivide=function(values:number[],t:number){const d=depths.get(values)??0,halves=original.call(this,values,t);nodes++;depth=Math.max(depth,d+1);halves.forEach((v:number[])=>depths.set(v,d+1));return halves;};
    (window as any).__curveBaselineNodes=0;const start=performance.now();try{const contours=engine.flattenInDocument(path,tolerance,200000,900000,{statistics});attempts.push({accepted:true,points:contours[0].points.length,depth:statistics.maxDepth??depth,nodes:statistics.nodes??(window as any).__curveBaselineNodes,subdivisions:statistics.subdivisions??nodes,verifiedMaxMM:statistics.maxErrorMM??null});}catch(e){const c=e as any;attempts.push({accepted:false,points:0,depth:statistics.maxDepth??depth,nodes:statistics.nodes??(window as any).__curveBaselineNodes,subdivisions:statistics.subdivisions??nodes,reason:c.reason,boundMM:c.boundMM});}finally{times.push(performance.now()-start);p.Curve.subdivide=original;}
   }times.sort((a,b)=>a-b);rows.push({scale,tolerance,offset,engine:label,medianMS:times[2],maxMS:times[4],...attempts[4]});}
   if(path.exportJSON({precision:16})!==before)throw new Error('Approximation changed source');path.remove();
  }return rows;
 });console.log('VEC005B PERFORMANCE',JSON.stringify(rows));expect(rows.filter(r=>r.engine==='current'&&r.offset===0&&r.scale>=1000).every(r=>r.accepted)).toBe(true);expect(rows.every(r=>Number.isFinite(r.maxMS)&&r.maxMS<10000)).toBe(true);
});

test('VEC005B optimized adjacent-float arithmetic is bit-identical to the retained interval policy',async({page})=>{
 await routeCurveBaseline(page);await page.goto('http://127.0.0.1:5174');const rows=await page.evaluate(async()=>{
  const before=await import('/__v005a_safety.js'),after=await import('/src/curveApproximationSafety.ts');
  const values=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,2**-1022,-(2**-1022),2**-1022+Number.MIN_VALUE,1,-1,1+2**-32,2**32,2**32-2**-21,900000,-900000,1e-300,-1e-300,1e150,-1e150];
  return values.flatMap((n,i)=>[0,1].map(flip=>{const v=[n,-n,n+2**(i-20),-n,n,n-2**(i-20),flip?n:0,0],ranges=v.map(x=>[x,x]);const run=(module:any)=>{try{return{split:module.subdivideCubicRanges(ranges),bound:module.cubicChordErrorBound(ranges,v)};}catch(e){return{error:(e as any).reason};}};return{before:run(before),after:run(after)};}));
 });for(const row of rows)expect(row.after).toEqual(row.before);expect(rows).toHaveLength(36);
});
