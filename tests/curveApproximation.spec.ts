import {test,expect,type Page} from './fixtures';
const DEV='http://127.0.0.1:5174';
type Point={x:number;y:number};
function segmentDistance(q:Point,a:Point,b:Point):number {
 const x=b.x-a.x,y=b.y-a.y,d=x*x+y*y,t=d?Math.max(0,Math.min(1,((q.x-a.x)*x+(q.y-a.y)*y)/d)):0;
 return Math.hypot(q.x-a.x-t*x,q.y-a.y-t*y);
}
function cubicPoint(v:number[],t:number):Point {
 const u=1-t;return{x:u*u*u*v[0]+3*u*u*t*v[2]+3*u*t*t*v[4]+t*t*t*v[6],y:u*u*u*v[1]+3*u*u*t*v[3]+3*u*t*t*v[5]+t*t*t*v[7]};
}
function polylineDistance(q:Point,points:Point[],closed=false):number {
 let d=Infinity;for(let i=1;i<points.length;i++)d=Math.min(d,segmentDistance(q,points[i-1],points[i]));if(closed&&points.length)d=Math.min(d,segmentDistance(q,points.at(-1)!,points[0]));return d;
}
for(const [scale,tolerance] of [[1000,.001],[1000,.05],[10000,.001],[10000,.05]])test(`GP01 S=${scale} tolerance=${tolerance} satisfies independent deviation checks or refuses`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async({scale,tolerance})=>{
  const p=(window as any).__paper,{flattenInDocument}=await import('/src/geometry.ts'),path=new p.Path({insert:false,segments:[new p.Segment([0,0],[0,0],[0,scale]),new p.Segment([scale,0],[0,scale],[0,0])]});
  const before=path.exportJSON({precision:16});let error:string|null=null,points:{x:number;y:number}[]=[];
  try{points=flattenInDocument(path,tolerance)[0].points;}catch(e){error=(e as Error).message;}
  const unchanged=path.exportJSON({precision:16})===before;path.remove();return{error,points,unchanged};
 },{scale,tolerance});
 const v=[0,0,0,scale,scale,scale,scale,0],sampledMax=r.error?null:Math.max(...Array.from({length:2049},(_,i)=>polylineDistance(cubicPoint(v,i/2048),r.points))),witness=r.error?null:polylineDistance(cubicPoint(v,255/512),r.points);
 console.log('GP01 reproduction',JSON.stringify({scale,tolerance,error:r.error,points:r.points.length,sampledMax,witness,first:r.points.slice(0,3),last:r.points.slice(-3)}));expect(r.unchanged).toBe(true);
 if(r.error)expect(r.error).toMatch(/precision|tolerance/i);else{expect(r.points[0]).toEqual({x:0,y:0});expect(r.points.at(-1)).toEqual({x:scale,y:0});expect(sampledMax).toBeLessThanOrEqual(tolerance);}
 if(scale===1000&&tolerance===.05)expect(r.error).toBeNull();
});
for(const mode of ['standard','laser'] as const)test(`GP01 ${mode} export refuses unverified geometry without returning a partial file or changing state`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async mode=>{
  const e=(window as any).__vectora,p=(window as any).__paper,{exportDXF}=await import('/src/exportDXF.ts'),{encodeDocument}=await import('/src/documentFormat.ts');e.newDocument();e.setActiveLayer('cutline');e.addShape(new p.Path.Rectangle({insert:false,rectangle:[20,20,10,10]}),'Good');e.addShape(new p.Path({insert:false,segments:[new p.Segment([0,0],[0,0],[0,10000]),new p.Segment([10000,0],[0,10000],[0,0])]}),'GP01');
  const capture=()=>({session:JSON.stringify(e.captureSession()),native:encodeDocument(e),raw:e.objects.map((s:any)=>s.exportJSON({precision:16}))}),before=capture();let error:string|null=null,contents:string|null=null;
  try{contents=exportDXF(e.objects,false,mode,.05);}catch(e){error=(e as Error).message;}
  return{error,returnedFile:contents!==null,before,after:capture()};
 },mode);console.log('GP01 output reproduction',JSON.stringify({mode,error:r.error,returnedFile:r.returnedFile}));expect(r.error).toMatch(/precision|tolerance/i);expect(r.returnedFile).toBe(false);expect(r.after).toEqual(r.before);
});

type CurveFixture={name:string;v:number[];tolerance:number;matrix?:number[];closed?:boolean;outcome:'accept'|'refuse'|'either'};
const angle=31*Math.PI/180;
const cases:CurveFixture[]=[
 {name:'ordinary cubic',v:[0,0,0,10,10,10,10,0],tolerance:.01,outcome:'accept'},
 {name:'translated ordinary cubic',v:[0,0,0,10,10,10,10,0],matrix:[1,0,0,1,900000,-900000],tolerance:.01,outcome:'accept'},
 {name:'rotated nonuniform scaling',v:[0,0,0,20,20,20,20,0],matrix:[2.2*Math.cos(angle),2.2*Math.sin(angle),-.7*Math.sin(angle),.7*Math.cos(angle),50,20],tolerance:.03,outcome:'accept'},
 {name:'reflection at large coordinates',v:[0,0,0,10,10,10,10,0],matrix:[-1,0,0,1,900000,-900000],tolerance:.01,outcome:'accept'},
 {name:'negative local coordinates',v:[-100,-100,-100,-80,-80,-80,-80,-100],tolerance:.01,outcome:'accept'},
 {name:'very short cubic below old dedup epsilon',v:[0,0,0,1e-7,1e-7,1e-7,1e-7,0],tolerance:1e-9,outcome:'accept'},
 {name:'tiny coordinates',v:[0,0,0,1e-14,1e-14,1e-14,1e-14,0],tolerance:1e-16,outcome:'accept'},
 {name:'nearly straight',v:[0,0,1,1e-10,2,-1e-10,3,0],tolerance:1e-9,outcome:'accept'},
 {name:'far-origin tiny curve',v:[0,0,0,.001,.001,.001,.001,0],matrix:[1,0,0,1,999990,999990],tolerance:1e-6,outcome:'either'},
 {name:'unresolved far-origin arithmetic',v:[0,0,0,.001,.001,.001,.001,0],matrix:[1,0,0,1,900000,900000],tolerance:1e-12,outcome:'refuse'},
 {name:'depth exhausted large curve',v:[0,0,0,500000,500000,500000,500000,0],tolerance:.001,outcome:'refuse'},
 {name:'finite chord with overhanging collinear handles',v:[0,0,100,0,-100,0,1,0],tolerance:.001,outcome:'either'},
 {name:'adversarial near-zero chord with huge handles',v:[0,0,500000,500000,-500000,-500000,.001,0],tolerance:.001,outcome:'refuse'},
 {name:'zero chord must not silently erase a loop',v:[0,0,.001,.01,-.001,.01,0,0],tolerance:.05,outcome:'refuse'},
 {name:'resolved closed loop',v:[0,0,.001,.01,-.001,.01,0,0],tolerance:1e-5,closed:true,outcome:'accept'},
 {name:'tiny zero-chord loop is not a constant curve',v:[0,0,1e-14,1e-14,-1e-14,1e-14,0,0],tolerance:1e-13,outcome:'refuse'},
 {name:'resolved tiny loop retains nonzero handles',v:[0,0,1e-14,1e-14,-1e-14,1e-14,0,0],tolerance:1e-17,closed:true,outcome:'accept'},
];
for(const fixture of cases)test(`Conservative flattening: ${fixture.name}`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async fixture=>{
  const p=(window as any).__paper,{flattenInDocument}=await import('/src/geometry.ts'),v=fixture.v,path=new p.Path({insert:false,closed:!!fixture.closed,segments:[new p.Segment([v[0],v[1]],[0,0],[v[2]-v[0],v[3]-v[1]]),new p.Segment([v[6],v[7]],[v[4]-v[6],v[5]-v[7]],[0,0])]}),parent=new p.CompoundPath({insert:false,children:[path]});parent.applyMatrix=false;parent.matrix=new p.Matrix(...(fixture.matrix??[1,0,0,1,0,0]));
  const before=parent.exportJSON({precision:16});let error:null|{message:string;reason:string;code:string}=null,contours:any[]=[];
  try{contours=flattenInDocument(parent,fixture.tolerance);}catch(e){const cause=e as any;error={message:cause.message,reason:cause.reason,code:cause.code};}
  const unchanged=parent.exportJSON({precision:16})===before;parent.remove();return{error,contours,unchanged};
 },fixture);expect(r.unchanged).toBe(true);
 if(fixture.outcome==='accept')expect(r.error).toBeNull();if(fixture.outcome==='refuse')expect(r.error).not.toBeNull();
 if(r.error){expect(r.error.code).toBe('CURVE_APPROXIMATION_UNVERIFIED');expect(r.error.message).toMatch(/tolerance|precision/i);expect(r.contours).toEqual([]);return;}
 const points=r.contours[0].points,m=fixture.matrix??[1,0,0,1,0,0];expect(points.length).toBeGreaterThanOrEqual(fixture.closed?3:2);
 const max=Math.max(...Array.from({length:2049},(_,i)=>{const q=cubicPoint(fixture.v,i/2048),world={x:m[0]*q.x+m[2]*q.y+m[4],y:m[1]*q.x+m[3]*q.y+m[5]};return polylineDistance(world,points,fixture.closed);}));expect(max).toBeLessThanOrEqual(fixture.tolerance);
});
for(const [kind,points,work] of [['points',4,500008],['work',200000,4]] as const)test(`Explicit ${kind} budget failure returns no partial contours`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async({points,work})=>{const p=(window as any).__paper,{flattenInDocument}=await import('/src/geometry.ts'),path=new p.Path({insert:false,segments:[new p.Segment([0,0],[0,0],[0,10]),new p.Segment([10,0],[0,10],[0,0])]});const before=path.exportJSON();let result:any=null,error:any=null;try{result=flattenInDocument(path,.01,points,work);}catch(e){const cause=e as any;error={reason:cause.reason,code:cause.code};}const unchanged=path.exportJSON()===before;path.remove();return{result,error,unchanged};},{points,work});expect(r).toEqual({result:null,error:{reason:kind,code:'CURVE_APPROXIMATION_UNVERIFIED'},unchanged:true});
});

test('Constant duplicate anchors do not erase adjacent nonzero geometry',async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async()=>{const p=(window as any).__paper,{flattenInDocument}=await import('/src/geometry.ts'),path=new p.Path({insert:false,segments:[[0,0],[0,0],[1,0],[1,0]]});try{return flattenInDocument(path,1e-9);}finally{path.remove();}});expect(r).toEqual([{closed:false,points:[{x:0,y:0},{x:1,y:0}]}]);
});

test('Every flattening consumer propagates precision refusal without changing committed state or returning partial data',async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async()=>{
  const e=(window as any).__vectora,p=(window as any).__paper,{flattenInDocument}=await import('/src/geometry.ts'),{exportContours,standardContours}=await import('/src/dxfGeometry.ts'),{createPathOffset,createStickerOutline,initializeClipper}=await import('/src/clipperService.ts'),{materialPreviewInput}=await import('/src/materialPreviewInput.ts'),{encodeDocument}=await import('/src/documentFormat.ts');await initializeClipper();e.newDocument();e.setActiveLayer('cutline');e.addShape(new p.Path.Rectangle({insert:false,rectangle:[20,20,10,10]}),'Good');e.addShape(new p.Path({insert:false,closed:true,segments:[new p.Segment([0,0],[0,0],[0,10000]),new p.Segment([10000,0],[0,10000],[0,0])]}),'Bad');const bad=e.selected;
  const capture=()=>({session:JSON.stringify(e.captureSession()),native:encodeDocument(e),raw:e.objects.map((s:any)=>s.exportJSON({precision:16}))}),before=capture(),rows=[];
  for(const [name,action] of [['flatten',()=>flattenInDocument(bad,.001)],['exportContours',()=>exportContours(bad,.05)],['standardContours',()=>standardContours(bad,.05)],['offset',()=>createPathOffset(bad,{distance:2,direction:'outward',corners:'round'})],['sticker',()=>createStickerOutline(bad,2)],['materialPreview',()=>materialPreviewInput(e.objects)]] as const){let returned=false,error:any=null;try{const value=await action();returned=true;if(value&&typeof (value as any).remove==='function')(value as any).remove();}catch(cause){const e=cause as any;error={message:e.message,code:e.code};}rows.push({name,returned,error,unchanged:JSON.stringify(capture())===JSON.stringify(before)});}
  return rows;
 });expect(r).toHaveLength(6);for(const row of r){expect(row.returned,row.name).toBe(false);expect(row.error?.code,row.name).toBe('CURVE_APPROXIMATION_UNVERIFIED');expect(row.unchanged,row.name).toBe(true);}
});

// Rational arithmetic uses exact represented binary64 inputs. No production
// interval, Paper flatness/area/contains, or sample-only guarantee is reused.
type Q={n:bigint;d:bigint};
function rational(n:bigint,d:bigint):Q {if(!n)return{n:0n,d:1n};if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return{n:n/a,d:d/a};}
function rat(v:number):Q {const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,v);const b=d.getBigUint64(0),e=Number((b>>52n)&2047n),f=b&((1n<<52n)-1n),sign=b>>63n?-1n:1n,n=sign*(e?((1n<<52n)|f):f),k=(e?e-1023: -1022)-52;return k>=0?rational(n<<BigInt(k),1n):rational(n,1n<<BigInt(-k));}
const qa=(a:Q,b:Q):Q=>rational(a.n*b.d+b.n*a.d,a.d*b.d);
const qs=(a:Q,b:Q):Q=>rational(a.n*b.d-b.n*a.d,a.d*b.d);
const qm=(a:Q,b:Q):Q=>rational(a.n*b.n,a.d*b.d);
const qd=(a:Q,b:Q):Q=>{if(!b.n)throw Error('Rational zero denominator');return rational(a.n*b.d,a.d*b.n);};
const qc=(a:Q,b:Q)=>a.n*b.d-b.n*a.d;
const square=(a:Q)=>qm(a,a);
function finiteChordSquared(v:Q[],i:number):Q {
 const x=qs(v[i],v[0]),y=qs(v[i+1],v[1]),dx=qs(v[6],v[0]),dy=qs(v[7],v[1]),den=qa(square(dx),square(dy)),dot=qa(qm(x,dx),qm(y,dy));
 if(!den.n||dot.n<=0n)return qa(square(x),square(y));if(qc(dot,den)>=0n)return qa(square(qs(v[i],v[6])),square(qs(v[i+1],v[7])));return qs(qa(square(x),square(y)),qd(square(dot),den));
}
test('Exact rational finite-chord oracle validates the continuous cubic error bound across scale and translation',async({page})=>{
 await page.goto(DEV);const curves=Array.from({length:32},(_,i)=>{const b=[0,10000,900000,-900000][i%4],s=[.001,.125,1,1000][Math.floor(i/4)%4];return i<16?[b,b,b-s,b+2*s,b+2*s,b-s,b+s,b]:[b,b,b+100*s,b,b-100*s,b,b+s,b];});curves.push([0,0,.001,.01,-.001,.01,0,0],[0,0,0,0,1,0,1,0]);
 const bounds=await page.evaluate(async curves=>{const {cubicChordErrorBound}=await import('/src/curveApproximationSafety.ts');return curves.map(v=>cubicChordErrorBound(v.map(n=>[n,n]),v));},curves);
 for(let i=0;i<curves.length;i++){const v=curves[i].map(rat),a=finiteChordSquared(v,2),b=finiteChordSquared(v,4),inner=qc(a,b)>0n?a:b,required=qm({n:9n,d:16n},inner);expect(qc(square(rat(bounds[i])),required)).toBeGreaterThanOrEqual(0n);}
});
function exactTransform(values:Q[],matrix:number[]):Q[]{const m=matrix.map(rat),out:Q[]=[];for(let i=0;i<8;i+=2)out.push(qa(qa(qm(m[0],values[i]),qm(m[2],values[i+1])),m[4]),qa(qa(qm(m[1],values[i]),qm(m[3],values[i+1])),m[5]));return out;}
function exactHalves(v:Q[]):[Q[],Q[]]{const left:Q[]=[],right:Q[]=[];for(let k=0;k<2;k++){const mid=(a:Q,b:Q)=>qm(qa(a,b),{n:1n,d:2n}),a=v[k],b=v[k+2],c=v[k+4],d=v[k+6],ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),center=mid(abc,bcd);[a,ab,abc,center].forEach((q,i)=>left[2*i+k]=q);[center,bcd,cd,d].forEach((q,i)=>right[2*i+k]=q);}return[left,right];}
test('Exact rational transform and de Casteljau oracle encloses ancestor, global and split-control arithmetic',async({page})=>{
 await page.goto(DEV);const f={start:{x:.001,y:-.003},out:{x:.002,y:.01},end:{x:.04,y:.005},into:{x:-.01,y:.003},matrices:[[1.3,.2,-.4,.7,900000,-900000],[-.75,.125,.25,1.5,20,30]]};
 const r=await page.evaluate(async f=>{const p=(window as any).__paper,{documentCubicRanges,subdivideCubicRanges}=await import('/src/curveApproximationSafety.ts');let m=new p.Matrix();for(const a of f.matrices)m.prepend(new p.Matrix(...a));const v=[f.start.x,f.start.y,f.start.x+f.out.x,f.start.y+f.out.y,f.end.x+f.into.x,f.end.y+f.into.y,f.end.x,f.end.y],world=[];for(let i=0;i<8;i+=2){const q=m.transform(new p.Point(v[i],v[i+1]));world.push(q.x,q.y);}let bounds=documentCubicRanges(f.start,f.out,f.end,f.into,f.matrices,m.values,world),leaves=[bounds];for(let k=0;k<8;k++)leaves=leaves.flatMap(subdivideCubicRanges);return{bounds,leaves,global:m.values,world};},f);
 const local=[rat(f.start.x),rat(f.start.y),qa(rat(f.start.x),rat(f.out.x)),qa(rat(f.start.y),rat(f.out.y)),qa(rat(f.end.x),rat(f.into.x)),qa(rat(f.end.y),rat(f.into.y)),rat(f.end.x),rat(f.end.y)];let chain=local;for(const m of f.matrices)chain=exactTransform(chain,m);const global=exactTransform(local,r.global);
 const encloses=(ranges:number[][],values:Q[])=>values.forEach((q,i)=>{expect(qc(rat(ranges[i][0]),q)).toBeLessThanOrEqual(0n);expect(qc(rat(ranges[i][1]),q)).toBeGreaterThanOrEqual(0n);});for(const v of [chain,global,r.world.map(rat)])encloses(r.bounds,v);
 let leaves=[chain];for(let k=0;k<8;k++)leaves=leaves.flatMap(exactHalves);leaves.forEach((v,i)=>encloses(r.leaves[i],v));
});

function dxfSegments(text:string):[Point,Point][] {
 const lines=text.trim().split(/\r?\n/),segments:[Point,Point][]=[],tags:[number,string][]=[];let kind='';
 const flush=()=>{const get=(code:number)=>Number(tags.find(t=>t[0]===code)?.[1]);if(kind==='LINE')segments.push([{x:get(10),y:-get(20)},{x:get(11),y:-get(21)}]);if(kind==='LWPOLYLINE'){const points:Point[]=[];let x=0;for(const [c,v] of tags){if(c===10)x=Number(v);if(c===20)points.push({x,y:-Number(v)});}for(let i=1;i<points.length;i++)segments.push([points[i-1],points[i]]);if(get(70)&1)segments.push([points.at(-1)!,points[0]]);}tags.length=0;};
 for(let i=0;i<lines.length;i+=2){const code=Number(lines[i]),value=lines[i+1];if(code===0){flush();kind=value;}else tags.push([code,value]);}flush();return segments;
}
for(const mode of ['standard','laser'] as const)test(`${mode} accepted transformed curve and origin relocation meet the requested file-space tolerance`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async mode=>{
  const p=(window as any).__paper,{exportDXF}=await import('/src/exportDXF.ts'),{dxfAtOrigin}=await import('/src/exportLayout.ts'),v=[0,0,0,20,20,20,20,0],a=31*Math.PI/180,m=[2.2*Math.cos(a),2.2*Math.sin(a),-.7*Math.sin(a),.7*Math.cos(a),900000,-900000];
  const path=new p.Path({insert:false,segments:[new p.Segment([0,0],[0,0],[0,20]),new p.Segment([20,0],[0,20],[0,0])]}),parent=new p.CompoundPath({insert:false,children:[path]});parent.applyMatrix=false;parent.matrix=new p.Matrix(...m);parent.data.role='cutline';const before=parent.exportJSON({precision:16});try{const text=exportDXF([parent],false,mode,.01);return{text,origin:dxfAtOrigin(text),v,m,unchanged:parent.exportJSON({precision:16})===before};}finally{parent.remove();}
 },mode);expect(r.unchanged).toBe(true);const original=dxfSegments(r.text),relocated=dxfSegments(r.origin);expect(original.length).toBeGreaterThan(1);expect(relocated.length).toBe(original.length);
 const minX=Math.min(...original.flat().map(p=>p.x)),maxY=Math.max(...original.flat().map(p=>p.y));
 for(const [segments,dx,dy] of [[original,0,0],[relocated,minX,maxY]] as const){const max=Math.max(...Array.from({length:2049},(_,i)=>{const q=cubicPoint(r.v,i/2048),world={x:r.m[0]*q.x+r.m[2]*q.y+r.m[4]-dx,y:r.m[1]*q.x+r.m[3]*q.y+r.m[5]-dy};return Math.min(...segments.map(([a,b])=>segmentDistance(world,a,b)));}));expect(max).toBeLessThanOrEqual(.01);}
});
for(const mode of ['standard','laser'] as const)test(`${mode} refuses DXF rounding collapse rather than returning a zero-length curve`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async mode=>{const p=(window as any).__paper,{exportDXF}=await import('/src/exportDXF.ts'),path=new p.Path({insert:false,segments:[[0,0],[1e-10,0]]});path.data.role='cutline';let contents=null,error:any=null;try{contents=exportDXF([path],false,mode,.001);}catch(cause){const e=cause as any;error={reason:e.reason,code:e.code};}finally{path.remove();}return{contents,error};},mode);expect(r).toEqual({contents:null,error:{reason:'serialization',code:'CURVE_APPROXIMATION_UNVERIFIED'}});
});
test('Laser DXF retains representable nonzero edges below the old length epsilon',async({page})=>{
 await page.goto(DEV);const text=await page.evaluate(async()=>{const p=(window as any).__paper,{exportDXF}=await import('/src/exportDXF.ts'),path=new p.Path({insert:false,segments:[[0,0],[1e-7,0]]});path.data.role='cutline';try{return exportDXF([path],false,'laser',.001);}finally{path.remove();}});expect(dxfSegments(text)).toEqual([[{x:0,y:-0},{x:1e-7,y:-0}]]);
});

async function seedBad(page:Page,scale=10000){await page.goto(DEV);return page.evaluate(async scale=>{const e=(window as any).__vectora,p=(window as any).__paper,{encodeDocument}=await import('/src/documentFormat.ts');e.newDocument();e.setActiveLayer('cutline');e.addShape(new p.Path.Rectangle({insert:false,rectangle:[20,20,10,10]}),'Good');const good=e.selected;e.addShape(new p.Path({insert:false,closed:true,segments:[new p.Segment([0,0],[0,0],[0,scale]),new p.Segment([scale,0],[0,scale],[0,0])]}),'GP01');e.select(good,true);return{session:JSON.stringify(e.captureSession()),native:encodeDocument(e)};},scale);}
test('Export UI clears a previously valid preview and cannot download stale over-tolerance DXF',async({page})=>{
 const before=await seedBad(page,1000);let downloads=0;page.on('download',()=>downloads++);await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export…',exact:true}).click();const d=page.locator('#export-dialog');await d.getByRole('tab',{name:'DXF',exact:true}).click();await expect(d.locator('[data-export-submit]')).toBeEnabled();await d.getByText('Advanced',{exact:true}).click();await d.getByLabel('Curve tolerance (mm)').fill('.001');await d.getByLabel('Curve tolerance (mm)').dispatchEvent('change');await expect(d.locator('.export-error')).toContainText('tolerance');await expect(d.locator('[data-export-submit]')).toBeDisabled();await expect(d.locator('.export-preview img')).toBeHidden();await d.locator('form').evaluate((form:HTMLFormElement)=>form.requestSubmit());await page.waitForTimeout(150);expect(downloads).toBe(0);await d.getByRole('button',{name:'Cancel',exact:true}).click();
 const after=await page.evaluate(async()=>{const e=(window as any).__vectora,{encodeDocument}=await import('/src/documentFormat.ts');return{session:JSON.stringify(e.captureSession()),native:encodeDocument(e)};});expect(after).toEqual(before);
});
test('Offset UI discards earlier valid copies when a later source has unverified precision',async({page})=>{
 const before=await seedBad(page);await page.evaluate(()=>{(window as any).__vectora.offsets.open();});const d=page.locator('#offset-dialog');await expect(d.locator('.pattern-feedback')).toContainText('tolerance');await expect(d.locator('[data-offset-create]')).toBeDisabled();const state=await page.evaluate(async()=>{const e=(window as any).__vectora,{encodeDocument}=await import('/src/documentFormat.ts');return{session:JSON.stringify(e.captureSession()),native:encodeDocument(e),copies:e.offsets.copies.length};});expect(state).toEqual({...before,copies:0});await d.locator('[data-offset-cancel]').click();
});
test('Material preview reports unavailable precision without showing a partial material model',async({page})=>{
 const before=await seedBad(page);const model=await page.evaluate(async()=>{const {MaterialPreview}=await import('/src/materialPreview.ts'),{materialPreviewInput}=await import('/src/materialPreviewInput.ts'),e=(window as any).__vectora,preview:any=new MaterialPreview(document.querySelector('[data-material-preview]')!,()=>materialPreviewInput(e.objects));(window as any).__curvePreview=preview;await preview.open();return{model:preview.model,input:preview.input};});expect(model).toEqual({model:null,input:null});const d=page.getByRole('dialog',{name:'Material & process preview'});await expect(d.locator('[data-preview-message]')).toContainText('tolerance');await expect(d.locator('[data-preview-status]')).toHaveText('Preview unavailable');await d.getByRole('button',{name:'Close preview',exact:true}).click();const after=await page.evaluate(async()=>{const e=(window as any).__vectora,{encodeDocument}=await import('/src/documentFormat.ts');return{session:JSON.stringify(e.captureSession()),native:encodeDocument(e)};});expect(after).toEqual(before);
});
test('Refused approximation preserves the existing redo branch and native round-trip integrity',async({page})=>{
 await seedBad(page);const r=await page.evaluate(async()=>{const e=(window as any).__vectora,p=(window as any).__paper,{exportDXF}=await import('/src/exportDXF.ts'),{exportSVG}=await import('/src/exportSVG.ts'),{encodeDocument,decodeDocument}=await import('/src/documentFormat.ts');e.addShape(new p.Path.Rectangle({insert:false,rectangle:[50,50,5,5]}),'Redo witness');const redo=encodeDocument(e);e.undo();const before={session:JSON.stringify(e.captureSession()),native:encodeDocument(e),svg:exportSVG(e.objects)};let error=null;try{exportDXF(e.objects,false,'standard',.001);}catch(cause){error=(cause as Error).message;}const after={session:JSON.stringify(e.captureSession()),native:encodeDocument(e),svg:exportSVG(e.objects)},canRedo=e.canRedo;e.redo();const redone=encodeDocument(e);e.undo();const doc=await decodeDocument(before.native);e.loadDocument(doc.snapshot,doc.view);return{error,before,after,canRedo,redo,redone,reloaded:encodeDocument(e)};});expect(r.error).toContain('tolerance');expect(r.after).toEqual(r.before);expect(r.canRedo).toBe(true);expect(r.redone).toBe(r.redo);expect(r.reloaded).toBe(r.before.native);
});

test('Exact rational box-corner oracle validates endpoint uncertainty and weighted error-budget allocation',async({page})=>{
 await page.goto(DEV);const fixtures=Array.from({length:16},(_,i)=>{const b=[0,900000][i%2],s=[.001,.25,10,1000][Math.floor(i/2)%4],v=[b,b,b-s,b+2*s,b+2*s,b-s,b+s,b],r=i<8?1e-8:.0001;return{v,ranges:v.map(n=>[n-r,n+r])};});
 const results=await page.evaluate(async fixtures=>{const {cubicChordErrorBound,curveToleranceAfterAllowance}=await import('/src/curveApproximationSafety.ts'),{DXF_SERIALIZATION_ALLOWANCE_MM}=await import('/src/dxfGeometry.ts');return{bounds:fixtures.map(f=>cubicChordErrorBound(f.ranges as [number,number][],f.v)),budgets:[.001,.05,1].map(t=>({t,r:DXF_SERIALIZATION_ALLOWANCE_MM,available:curveToleranceAfterAllowance(t,DXF_SERIALIZATION_ALLOWANCE_MM)}))};},fixtures);
 for(let k=0;k<fixtures.length;k++){
  const f=fixtures[k],v=f.v.map(rat);let end=rat(0),inner=rat(0);
  for(const i of [0,2,4,6])for(const x of f.ranges[i])for(const y of f.ranges[i+1]){const controls=[...v];controls[i]=rat(x);controls[i+1]=rat(y);let d:Q;if(i===0||i===6)d=qa(square(qs(rat(x),v[i])),square(qs(rat(y),v[i+1])));else d=finiteChordSquared(controls,i);if(i===0||i===6){if(qc(d,end)>0n)end=d;}else if(qc(d,inner)>0n)inner=d;}
  const b2=square(rat(results.bounds[k]));expect(qc(b2,end)).toBeGreaterThanOrEqual(0n);
  if(qc(inner,end)>=0n){const left=qs(qs(qm(rat(16),b2),end),qm(rat(9),inner));expect(left.n).toBeGreaterThanOrEqual(0n);expect(qc(square(left),qm(rat(36),qm(end,inner)))).toBeGreaterThanOrEqual(0n);}
 }
 for(const b of results.budgets)expect(qc(qa(rat(b.available),rat(b.r)),rat(b.t))).toBeLessThanOrEqual(0n);
});
