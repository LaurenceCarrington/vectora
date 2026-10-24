import {test,expect,type Page} from './fixtures';
const DEV='http://127.0.0.1:5174';
type Point=[number,number];
function occupied(contours:Point[][],point:Point):boolean {
 let inside=false;for(const points of contours)for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
async function rectangles(page:Page,b:number,operation:string,scale=1,perform=true){return page.evaluate(async({b,operation,scale,perform})=>{
 const e=(window as any).__vectora,p=(window as any).__paper,{exportSVG}=await import('/src/exportSVG.ts'),{exportDXF}=await import('/src/exportDXF.ts');e.newDocument();
 e.addShape(new p.Path.Rectangle({insert:false,strokeColor:'#383838',strokeWidth:.01,strokeScaling:true,rectangle:[b,b,.002*scale,.001*scale]}),'A');const a=e.selected;
 e.addShape(new p.Path.Rectangle({insert:false,strokeColor:'#383838',strokeWidth:.01,strokeScaling:true,rectangle:[b+.0005*scale,b+.0005*scale,.002*scale,.001*scale]}),'B');e.select(a,true);
 const before={session:JSON.stringify(e.captureSession()),svg:exportSVG(e.objects),dxf:exportDXF(e.objects,true)},beforeObjects=e.objects.map((o:any)=>o.exportJSON({precision:16}));let error:string|null=null;
 try{if(perform)e.applyShapeOperation(operation);}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
 const after={session:JSON.stringify(e.captureSession()),svg:exportSVG(e.objects),dxf:exportDXF(e.objects,true)};
 const contours=e.objects.flatMap((s:any)=>s instanceof p.Path?[s]:s.children).map((path:any)=>path.segments.map((s:any)=>{const q=path.localToGlobal(s.point);return[(q.x-b)/scale,(q.y-b)/scale];}));
 return{error,before,after,beforeObjects,afterObjects:e.objects.map((o:any)=>o.exportJSON({precision:16})),objects:e.objects.length,contours,paths:e.objects.map((o:any)=>o.pathData)};
 },{b,operation,scale,perform});}
for(const operation of ['weld','intersect','subtract'])test(`GP02 ${operation} at 900000 preserves occupancy or refuses atomically`,async({page})=>{
 await page.goto(DEV);const r=await rectangles(page,900000,operation);console.log('GP02 reproduction',JSON.stringify({operation,error:r.error,contours:r.contours,paths:r.paths,occupancy:r.error?null:[.00075,.00125,.00175].map(x=>occupied(r.contours,[x,.00075]))}));
 if(r.error){expect(r.error).toContain('cannot be verified safely');expect(r.after).toEqual(r.before);expect(r.afterObjects).toEqual(r.beforeObjects);expect(r.objects).toBe(2);}
 else{expect(r.objects).toBe(1);expect([.00075,.00125,.00175].map(x=>occupied(r.contours,[x,.00075]))).toEqual(operation==='subtract'?[false,false,false]:[true,true,true]);}
});
for(const [b,side] of [[10000,.001],[999990,.001],[999990,.01]])test(`GP10 square ${side} at ${b} has trustworthy area or explicit refusal`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async({b,side})=>{
  const {signedArea,validateOutlineContours}=await import('/src/geometry.ts');const points=[{x:b,y:b},{x:b+side,y:b},{x:b+side,y:b+side},{x:b,y:b+side}];let area:number|null=null,error:string|null=null;
  try{area=signedArea(points);validateOutlineContours([{closed:true,points}]);}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
  return{area,error,expected:(b+side-b)**2};
 },{b,side});console.log('GP10 reproduction',JSON.stringify({b,side,...r}));
 if(r.error)expect(r.error).toContain('cannot be verified safely');else expect(Math.abs(r.area!-r.expected)).toBeLessThanOrEqual(32*Number.EPSILON*r.expected);
});

function dxfContours(text:string):Point[][] {
 const lines=text.trim().split(/\r?\n/),loops:Point[][]=[];let loop:Point[]|undefined,x=0;
 for(let i=0;i+1<lines.length;i+=2){const code=Number(lines[i]),value=lines[i+1];if(code===0){loop=value==='LWPOLYLINE'?[]:undefined;if(loop)loops.push(loop);}else if(loop&&code===10)x=Number(value);else if(loop&&code===20)loop.push([x,-Number(value)]);}
 return loops;
}
function svgContours(text:string):Point[][] {
 const loops:Point[][]=[];for(const match of text.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)){
  const tokens=match[1].match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)??[];let i=0,command='',x=0,y=0,start:Point=[0,0],loop:Point[]=[];
  while(i<tokens.length){if(/^[a-zA-Z]$/.test(tokens[i]))command=tokens[i++];const relative=command===command.toLowerCase(),upper=command.toUpperCase();
   if(upper==='Z'){if(loop.length)loops.push(loop);loop=[];[x,y]=start;command='';continue;}
   if(!['M','L','H','V'].includes(upper))throw new Error('Expected exact straight SVG contours.');
   if(upper==='M'||upper==='L'){const nx=Number(tokens[i++]),ny=Number(tokens[i++]);x=relative?x+nx:nx;y=relative?y+ny:ny;if(upper==='M'){if(loop.length)loops.push(loop);loop=[];start=[x,y];command=relative?'l':'L';}}
   else if(upper==='H'){const v=Number(tokens[i++]);x=relative?x+v:v;}else{const v=Number(tokens[i++]);y=relative?y+v:v;}
   loop.push([x,y]);
  }if(loop.length)loops.push(loop);
 }return loops;
}
const witnesses:Point[]=[.00025,.00075,.00125,.00175,.00225].flatMap(x=>[.00025,.00075,.00125].map(y=>[x,y] as Point));
function expectedAt(point:Point,operation:string):boolean {const [x,y]=point,a=x>0&&x<.002&&y>0&&y<.001,b=x>.0005&&x<.0025&&y>.0005&&y<.0015;return operation==='weld'?a||b:operation==='intersect'?a&&b:a&&!b;}
for(const [b,scale] of [[0,.1],[0,1],[0,1000],[1024,1000],[900000,1000],[900000,100],[10000,1]])for(const operation of ['weld','subtract','intersect'])test(`Boolean ${operation} scale ${scale} translation ${b} preserves native/SVG/DXF occupancy or refuses`,async({page})=>{
 await page.goto(DEV);const r=await rectangles(page,b,operation,scale);
 console.log('Containment domain',JSON.stringify({b,scale,operation,outcome:r.error??'accepted'}));
 if(b===0&&scale===1000||b===1024&&scale===1000)expect(r.error).toBeNull();
 if(r.error){expect(r.error).toContain('cannot be verified safely');expect(r.after).toEqual(r.before);expect(r.afterObjects).toEqual(r.beforeObjects);return;}
 const normalize=(loops:Point[][])=>loops.map(loop=>loop.map(([x,y])=>[(x-b)/scale,(y-b)/scale] as Point));
 for(const loops of [r.contours,normalize(dxfContours(r.after.dxf)),normalize(svgContours(r.after.svg))]){
  expect(loops.length).toBeGreaterThan(0);expect(witnesses.map(point=>occupied(loops,point))).toEqual(witnesses.map(point=>expectedAt(point,operation)));
 }
});

for(const relationship of ['disjoint','touching','overlapping'] as const)for(const operation of ['weld','subtract','intersect'])test(`${operation} keeps ${relationship} ordinary contours and winding correct`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(({relationship,operation})=>{
  const e=(window as any).__vectora,p=(window as any).__paper;e.newDocument();e.addShape(new p.Path.Rectangle({insert:false,rectangle:[0,0,4,4]}),'A');const a=e.selected;
  const x=relationship==='disjoint'?8:relationship==='touching'?4:2,b=new p.Path.Rectangle({insert:false,rectangle:[x,0,4,4]});b.reverse();e.addShape(b,'B');e.select(a,true);const before=JSON.stringify(e.captureSession());let error:string|null=null;
  try{e.applyShapeOperation(operation);}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
  return{x,error,unchanged:JSON.stringify(e.captureSession())===before,loops:e.objects.flatMap((s:any)=>s instanceof p.Path?[s]:s.children).map((path:any)=>path.segments.map((s:any)=>[s.point.x,s.point.y]))};
 },{relationship,operation});
 const empty=operation==='intersect'&&relationship!=='overlapping';
 if(empty){expect(r.error).toMatch(/empty|cannot be verified safely/);expect(r.unchanged).toBe(true);return;}
 expect(r.error).toBeNull();for(const point of [[1,2],[3,2],[5,2],[9,2]] as Point[]){const a=point[0]>0&&point[0]<4,b=point[0]>r.x&&point[0]<r.x+4;expect(occupied(r.loops,point)).toBe(operation==='weld'?a||b:operation==='intersect'?a&&b:a&&!b);}
});

test('Nested holes keep even-odd occupancy through winding reversal, reflection and native reload',async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async()=>{
  const e=(window as any).__vectora,p=(window as any).__paper,{encodeDocument,decodeDocument}=await import('/src/documentFormat.ts');e.newDocument();
  const outer=new p.Path.Rectangle({insert:false,rectangle:[0,0,40,40]}),hole=new p.Path.Rectangle({insert:false,rectangle:[10,10,20,20]});outer.reverse();hole.reverse();
  const frame=new p.CompoundPath({insert:false,children:[outer,hole],fillRule:'evenodd',strokeColor:'#ff0000'});frame.applyMatrix=false;frame.matrix=new p.Matrix(-1,0,0,1,100,0);e.addShape(frame,'Frame');e.addShape(new p.Path.Rectangle({insert:false,rectangle:[60,0,30,40]}),'Mask');e.select(frame,true);e.applyShapeOperation('intersect');
  const capture=()=>e.objects.flatMap((s:any)=>s instanceof p.Path?[s]:s.children).map((path:any)=>path.segments.map((s:any)=>[s.point.x,s.point.y]));const persistent=()=>{const {selected,selectedIds,...saved}=e.snapshot();return JSON.stringify(saved);};const before=capture(),canonical=persistent(),doc=await decodeDocument(encodeDocument(e));e.loadDocument(doc.snapshot,doc.view);return{before,after:capture(),canonical,reloaded:persistent(),selected:e.selected,selectionCount:e.selection.length};
 });expect(r.reloaded).toBe(r.canonical);expect(r.selected).toBeNull();expect(r.selectionCount).toBe(0);for(const loops of [r.before,r.after])expect([[65,20],[75,20],[85,5],[95,20]].map(p=>occupied(loops,p as Point))).toEqual([true,false,true,false]);
});

test('Refusal preserves history, redo, native data and exports while reporting a safe UI failure',async({page})=>{
 await page.goto(DEV);await rectangles(page,900000,'weld',1,false);
 const before=await page.evaluate(async()=>{const e=(window as any).__vectora,{encodeDocument}=await import('/src/documentFormat.ts');e.setProperty('x',900000.01);const redo=encodeDocument(e);e.undo();return{session:JSON.stringify(e.captureSession()),native:encodeDocument(e),redo,children:e.artwork.children.length};});
 // GP02 is now a supported success. Exercise the same refusal/state/redo
 // assertions with a deliberately contradictory backend result instead.
 await page.evaluate(()=>{const p=(window as any).__paper,old=p.Path.prototype.unite;(window as any).__restoreBoolean=()=>{p.Path.prototype.unite=old;};p.Path.prototype.unite=function(){return this.clone({insert:false});};});
 await page.getByRole('button',{name:'Shape operations',exact:true}).click();await page.locator('#selection-menu [data-shape-operation="weld"]').click();await expect(page.locator('.toast-error')).toContainText('cannot be verified safely');
 await page.evaluate(()=>(window as any).__restoreBoolean());
 const after=await page.evaluate(async()=>{const e=(window as any).__vectora,{encodeDocument}=await import('/src/documentFormat.ts');const r={session:JSON.stringify(e.captureSession()),native:encodeDocument(e),children:e.artwork.children.length,canRedo:e.canRedo};e.redo();return{...r,redo:encodeDocument(e)};});
 expect(after).toEqual({...before,canRedo:true});
});

test('Supported Boolean undo/redo preserves canonical geometry, export and native round-trip stability',async({page})=>{
 await page.goto(DEV);const r=await rectangles(page,0,'weld',1000);expect(r.error).toBeNull();
 const state=await page.evaluate(async()=>{
  const e=(window as any).__vectora,{encodeDocument,decodeDocument}=await import('/src/documentFormat.ts'),{exportSVG}=await import('/src/exportSVG.ts'),{exportDXF}=await import('/src/exportDXF.ts');
  // Native v1 intentionally omits selection. Keep exact committed metadata and
  // canonical (12-decimal) geometry, and assert the separate selection contract.
  const capture=()=>{const {selected,selectedIds,...saved}=e.snapshot();return{snapshot:JSON.stringify(saved),selected,selectedIds,svg:exportSVG(e.objects),dxf:exportDXF(e.objects,true)};},result=capture();
  e.undo();const count=e.objects.length;e.redo();const redo=capture(),doc=await decodeDocument(encodeDocument(e));e.loadDocument(doc.snapshot,doc.view);return{result,redo,reloaded:capture(),count};
 });expect(state.count).toBe(2);
 // Paper may spell a vertical segment as either v or l after canonical history
 // reload. Parse geometry independently; retain exact SVG attributes and DXF.
 for(const next of [state.redo,state.reloaded]){
  expect(next.snapshot).toBe(state.result.snapshot);expect(next.dxf).toBe(state.result.dxf);
  expect(next.svg.replace(/ d="[^"]*"/g,'')).toBe(state.result.svg.replace(/ d="[^"]*"/g,''));
  expect(svgContours(next.svg)).toEqual(svgContours(state.result.svg));
 }
 expect(state.redo.selected).toBe(state.result.selected);expect(state.redo.selectedIds).toEqual(state.result.selectedIds);
 expect(state.reloaded.selected).toBeNull();expect(state.reloaded.selectedIds).toEqual([]);
});

// Independent exact dyadic/polynomial oracle: no floating shoelace, Paper
// area/contains, Clipper, or production interval helper is reused here.
function dyadic(value:number):bigint {const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,value);const bits=d.getBigUint64(0),exponent=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n),sign=bits>>63n?-1n:1n;return sign*(exponent?((1n<<52n)|fraction)<<BigInt(exponent-1):fraction);}
test('Outward area ranges enclose exact dyadic polygon and cubic integrals across scale and translation',async({page})=>{
 await page.goto(DEV);const fixtures=Array.from({length:24},(_,i)=>{const b=[0,10000,900000,-999990][i%4],s=[.001,.01,1,100][Math.floor(i/4)%4];return{points:[[b,b],[b+2*s,b+s/4],[b+s,b+3*s]] as Point[],curve:[b,b,b+s/3,b+2*s,b+s*2,b-s,b+3*s,b+s]};});
 const ranges=await page.evaluate(async fixtures=>{const {polygonAreaRange,paperAreaRange}=await import('/src/geometrySafety.ts');return fixtures.map(f=>({polygon:polygonAreaRange(f.points.map(([x,y])=>({x,y}))),cubic:paperAreaRange([f.curve])}));},fixtures);
 for(let k=0;k<fixtures.length;k++){
  const f=fixtures[k],p=f.points.map(([x,y])=>[dyadic(x),dyadic(y)]),twice=p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0n),r=ranges[k].polygon;
  expect(dyadic(r.lower)<<1075n).toBeLessThanOrEqual(twice);expect(dyadic(r.upper)<<1075n).toBeGreaterThanOrEqual(twice);
  const v=f.curve.map(dyadic),power=(p:bigint[])=>[p[0],3n*(p[1]-p[0]),3n*(p[0]-2n*p[1]+p[2]),-p[0]+3n*p[1]-3n*p[2]+p[3]],x=power([v[0],v[2],v[4],v[6]]),y=power([v[1],v[3],v[5],v[7]]);let integral=0n;
  for(let i=0;i<4;i++)for(let j=1;j<4;j++)integral+=(x[i]*y[j]-y[i]*x[j])*BigInt(j)*(120n/BigInt(2*(i+j)));
  const c=ranges[k].cubic;expect(dyadic(c.lower)*120n*(1n<<1074n)).toBeLessThanOrEqual(integral);expect(dyadic(c.upper)*120n*(1n<<1074n)).toBeGreaterThanOrEqual(integral);
 }
});

for(const operation of ['weld','intersect','subtract'])test(`Coincident contours ${operation} preserve supported occupancy without partial empty edits`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(operation=>{const e=(window as any).__vectora,p=(window as any).__paper;e.newDocument();e.addShape(new p.Path.Rectangle({insert:false,rectangle:[20,20,4,4]}),'A');const a=e.selected;e.addShape(new p.Path.Rectangle({insert:false,rectangle:[20,20,4,4]}),'B');e.select(a,true);const before=JSON.stringify(e.captureSession());let error:string|null=null;try{e.applyShapeOperation(operation);}catch(cause){error=cause instanceof Error?cause.message:String(cause);}return{error,unchanged:JSON.stringify(e.captureSession())===before,count:e.objects.length};},operation);
 if(operation==='subtract'){expect(r.error).toMatch(/empty|cannot be verified safely/);expect(r.unchanged).toBe(true);}else{expect(r.error).toBeNull();expect(r.count).toBe(1);}
});

test('Validation budget refusal keeps all sources and history instead of sampling fewer cells',async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(()=>{const e=(window as any).__vectora,p=(window as any).__paper;e.newDocument();const sources=[];for(let i=0;i<40;i++){e.addShape(new p.Path.Rectangle({insert:false,rectangle:[i*10,i*10,4,4]}),'Box '+i);sources.push(e.selected);}e.select(null);sources.forEach(s=>e.select(s,true));const before=JSON.stringify(e.captureSession());let error:string|null=null;try{e.applyShapeOperation('weld');}catch(cause){error=cause instanceof Error?cause.message:String(cause);}return{error,unchanged:JSON.stringify(e.captureSession())===before,count:e.objects.length};});expect(r.error).toContain('validation budget');expect(r.unchanged).toBe(true);expect(r.count).toBe(40);
});

test('Legacy tiny-square outlines keep area/winding eligibility across translations without changing their source',async({page})=>{
 await page.goto(DEV);const rows=await page.evaluate(async()=>{
  const p=(window as any).__paper,{createStickerOutline,initializeClipper}=await import('/src/clipperService.ts');await initializeClipper();const rows=[];
  for(const b of [0,10000,999990])for(const reversed of [false,true]){
   const source=new p.Path.Rectangle({insert:false,rectangle:[b,b,.001,.001]});if(reversed)source.reverse();const before=source.exportJSON({precision:16});let error:string|null=null,width:number|null=null;
   try{const result=createStickerOutline(source,.001);width=result.bounds.width;result.remove();}catch(cause){error=cause instanceof Error?cause.message:String(cause);}
   rows.push({b,reversed,error,width,unchanged:source.exportJSON({precision:16})===before});source.remove();
  }return rows;
 });for(const r of rows){expect(r.unchanged).toBe(true);if(r.error)expect(r.error).toContain('cannot be verified safely');else expect(Math.abs(r.width!-.003)).toBeLessThanOrEqual(1e-5);}
});

for(const operation of ['weld','intersect','subtract'])test(`Independent verification rejects a contradictory ${operation} result atomically`,async({page})=>{
 await page.goto(DEV);const r=await page.evaluate(async operation=>{
  const e=(window as any).__vectora,p=(window as any).__paper,{exportSVG}=await import('/src/exportSVG.ts'),{exportDXF}=await import('/src/exportDXF.ts');e.newDocument();e.addShape(new p.Path.Rectangle({insert:false,rectangle:[20,20,4,4],strokeColor:'#ff0000'}),'A');const a=e.selected;e.addShape(new p.Path.Rectangle({insert:false,rectangle:[22,20,4,4],strokeColor:'#ff0000'}),'B');e.select(a,true);
  const capture=()=>({session:JSON.stringify(e.captureSession()),svg:exportSVG(e.objects),dxf:exportDXF(e.objects,true)}),before=capture(),method=operation==='weld'?'unite':operation,old=p.Path.prototype[method];let error:string|null=null;
  // Simulate an otherwise finite, closed, nonempty but incorrect backend result.
  p.Path.prototype[method]=function(){return this.clone({insert:false});};try{e.applyShapeOperation(operation);}catch(cause){error=cause instanceof Error?cause.message:String(cause);}finally{p.Path.prototype[method]=old;}
  return{error,before,after:capture()};
 },operation);expect(r.error).toContain('cannot be verified safely');expect(r.after).toEqual(r.before);
});

test('Indeterminate zero-area predicates refuse instead of inventing winding or outline eligibility',async({page})=>{
 await page.goto(DEV);const errors=await page.evaluate(async()=>{const {signedArea,validateOutlineContours,exteriorContours}=await import('/src/geometry.ts');const points=[{x:900000,y:900000},{x:900001,y:900001},{x:900002,y:900002}];return[()=>signedArea(points),()=>validateOutlineContours([{closed:true,points}]),()=>exteriorContours([{closed:true,points}])].map(action=>{try{action();return null;}catch(cause){return cause instanceof Error?cause.message:String(cause);}});});for(const error of errors)expect(error).toContain('cannot be verified safely');
});
