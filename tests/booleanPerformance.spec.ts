import {test,expect} from './fixtures';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

/** Baseline is the saved pre-task builder, not a reconstructed approximation.
 * Its imports use unchanged documentPath/pathsOf/access/area helper contracts. */
test('VEC004B measured baseline/current kernel timings on synthetic bounded scenarios',async({page})=>{
 const original=readFileSync(new URL('./fixtures/boolean-v004a.fixture.ts',import.meta.url),'utf8');
 const text=original.replace("import paper from 'paper';","const paper=(window as any).__paper;").replace(/from '\.\/([^']+)'/g,(_,p)=>`from '/src/${p}.ts'`);
 const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 await page.route('**/__vec004_baseline.js',route=>route.fulfill({contentType:'text/javascript',body:js}));await page.goto('http://127.0.0.1:5174');
 const results=await page.evaluate(async()=>{
  const e=(window as any).__vectora,p=(window as any).__paper,current=await import('/src/shapeOperationGeometry.ts'),baseline=await import('/__vec004_baseline.js'),rows=[];
  for(const scenario of ['ordinary rectangles','compound curved holes','40 disjoint rectangles','crossing cubics','64-contour compound','64-piece curved path','near-degenerate','extreme GP02']){
   e.newDocument();let shapes:any[],operation='weld';
   if(scenario==='compound curved holes'){shapes=[new p.Path.Rectangle({insert:false,rectangle:[0,0,80,40]}),new p.CompoundPath({insert:false,children:[new p.Path.Circle({insert:false,center:[20,20],radius:5}),new p.Path.Circle({insert:false,center:[60,20],radius:5})],fillRule:'evenodd'})];operation='subtract';}
   else if(scenario==='40 disjoint rectangles')shapes=Array.from({length:40},(_,i)=>new p.Path.Rectangle({insert:false,rectangle:[i*10,i*10,4,4]}));
   else if(scenario==='crossing cubics')shapes=[new p.Path.Circle({insert:false,center:[0,0],radius:20}),new p.Path.Circle({insert:false,center:[20,0],radius:20})];
   else if(scenario==='64-contour compound')shapes=[new p.CompoundPath({insert:false,children:Array.from({length:64},(_,i)=>new p.Path.Circle({insert:false,center:[i%8*10,Math.floor(i/8)*10],radius:2})),fillRule:'evenodd'}),new p.Path.Rectangle({insert:false,rectangle:[-5,-5,80,80]})];
   else if(scenario==='64-piece curved path'){const circle=new p.Path.Circle({insert:false,center:[0,0],radius:20});for(let round=0;round<4;round++)for(const curve of [...circle.curves])curve.divideAtTime(.5);shapes=[circle,new p.Path.Rectangle({insert:false,rectangle:[-30,-30,60,60]})];}
   else if(scenario==='near-degenerate')shapes=[new p.Path({insert:false,closed:true,segments:[[0,0],[20,0],[10,1e-10]]}),new p.Path.Rectangle({insert:false,rectangle:[0,0,10,10]})];
   else {const b=scenario==='extreme GP02'?900000:0,s=scenario==='extreme GP02'?.001:10;shapes=[new p.Path.Rectangle({insert:false,rectangle:[b,b,2*s,s]}),new p.Path.Rectangle({insert:false,rectangle:[b+.5*s,b+.5*s,2*s,s]})];}
   shapes.forEach((s,i)=>e.addShape(s,'Benchmark '+i));const source=[...e.objects];
   for(const [label,engine]of [['baseline',baseline],['current',current]]as const){const times=[],errors:string[]=[];let accepted=0;for(let repeat=0;repeat<7;repeat++){const start=performance.now();try{const result=engine.buildShapeOperation(source,operation as any);result.remove();accepted++;}catch(c){errors.push((c as Error).message);}times.push(performance.now()-start);}times.sort((a,b)=>a-b);rows.push({scenario,engine:label,medianMS:times[3],maxMS:times[6],accepted,refused:errors.length,reason:errors[0]??null});}
   if(e.objects.some((s:any,i:number)=>s!==source[i]))throw new Error('Benchmark changed source identities');
  }return rows;
 });console.log('VEC004B PERFORMANCE',JSON.stringify(results));expect(results).toHaveLength(16);expect(results.every(r=>Number.isFinite(r.maxMS)&&r.maxMS<5000)).toBe(true);expect(results.find(r=>r.scenario==='ordinary rectangles'&&r.engine==='current')!.accepted).toBe(7);expect(results.find(r=>r.scenario==='extreme GP02'&&r.engine==='current')!.accepted).toBe(7);
});
