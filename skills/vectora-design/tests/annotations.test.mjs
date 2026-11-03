import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildDesign} from '../scripts/build.mjs';
import {lintDocument} from '../scripts/lint.mjs';
const build=(objects,extra={})=>buildDesign({format:'vectora-design',version:1,units:'mm',objects,...extra});
const all=doc=>doc.layers.flatMap(l=>l.objects);
const text=extra=>({type:'text',content:'Office BØ 20°',x:10,y:20,...extra});

test('text produces filled native Lato outlines and complete editable glyph metadata',()=>{
 const o=all(build([text()]))[0];
 assert.equal(o.kind,'compound');assert.equal(o.style.fill,'#383838');assert.equal(o.style.stroke,null);
 assert.equal(o.style.fillRule,'nonzero');
 assert.equal(o.data.text.fontId,'lato');assert.equal(o.data.text.sizeMM,3.2);
 assert.deepEqual(o.data.text.transform,[1,0,0,1,10,20]);
 assert.deepEqual(o.data.text.glyphLabels,Array.from('OfficeBØ20°'));
 assert.equal(o.data.text.glyphContours.reduce((a,b)=>a+b,0),o.contours.length);
 assert.ok(o.contours.some(c=>c.segments.some(s=>s.slice(2).some(n=>n!==0))));
 assert.ok(o.contours.every(c=>c.closed));assert.equal(o.data.regionFill,undefined);
 assert.equal(lintDocument(build([text()])).errors,0);
});
test('text preserves multiline spacing, normalizes tabs/CRLF and keeps block alignment in its affine transform',()=>{
 const a=all(build([text({content:'AV\r\nB\tO',align:'center',angle:90,size:10})]))[0];
 assert.deepEqual(a.data.text.glyphLabels,['A','V','B','O']);assert.equal(a.data.text.content,'AV\r\nB\tO');
 assert.ok(Math.abs(a.data.text.transform[0])<1e-12);assert.equal(a.data.text.transform[1],1);
 assert.ok(a.data.text.transform[5]<20);assert.equal(a.data.rotationDegrees,90);
 const b=all(build([text({content:'B',size:10})]))[0];
 assert.equal(b.data.text.glyphContours[0],3); // Outer contour plus two counters.
});
test('text supports layer colours and explicit filled-text paint without becoming a region fill',()=>{
 const [a,b]=all(build([text({id:'cut-label',layer:'cutline'}),text({id:'custom-label',style:{fill:'#123456'}})]));
 // Layer order is Artwork then Cut Path.
 assert.equal(a.style.fill,'#123456');assert.equal(b.style.fill,'#FF0000');
 assert.equal(a.data.regionFill,undefined);assert.equal(b.style.stroke,null);
});
test('arrows preserve their shaft and create correctly oriented open arrowheads as one object',()=>{
 const o=all(build([{type:'arrow',points:[[0,0],[10,0]],ends:'both',headLength:2,headWidth:2}]))[0];
 assert.equal(o.kind,'compound');assert.equal(o.style.fill,null);assert.equal(o.contours.length,3);
 assert.deepEqual(o.contours[0].segments.map(s=>s.slice(0,2)),[[0,0],[10,0]]);
 assert.deepEqual(o.contours[1].segments.map(s=>s.slice(0,2)),[[2,1],[0,0],[2,-1]]);
 assert.deepEqual(o.contours[2].segments.map(s=>s.slice(0,2)),[[8,-1],[10,0],[8,1]]);
 assert.ok(o.contours.every(c=>!c.closed));
});
test('dimensions produce native annotation geometry and metadata with exact measured references',()=>{
 const o=all(build([{type:'dimension',kind:'aligned',points:[[0,0],[30,40]],position:[-8,6]}]))[0];
 assert.equal(o.kind,'compound');assert.equal(o.style.fill,null);assert.equal(o.contours.length,6);
 assert.deepEqual(o.data.dimension,{kind:'dimension-aligned',points:[[0,0],[30,40],[-8,6]],transform:[1,0,0,1,0,0]});
 const scaled=all(build([{type:'dimension',kind:'linear',axis:'x',points:[[0,0],[12000,500]],position:[0,-1000],size:320}]))[0];
 assert.deepEqual(scaled.data.dimension.transform,[100,0,0,100,0,0]);
 assert.deepEqual(scaled.data.dimension.points,[[0,0],[120,5],[0,-10]]);
 assert.equal(scaled.data.dimension.axis,'x');
});
test('linear auto-axis, radius, diameter and leader helpers preserve their intended annotation kinds',()=>{
 const defs=[
  {kind:'linear',points:[[0,0],[30,40]],position:[50,20]},
  {kind:'radial',points:[[20,20],[25,20]],position:[30,30]},
  {kind:'diameter',points:[[20,20],[25,20]],position:[30,30]},
  {kind:'leader',points:[[0,0],[10,10]],position:[30,10],text:'Check clearance'},
 ];
 const os=all(build(defs.map(d=>({type:'dimension',...d}))));
 assert.equal(os[0].data.dimension.axis,'y');assert.equal(os[1].data.dimension.kind,'dimension-radial');
 assert.equal(os[2].data.dimension.kind,'dimension-diameter');assert.equal(os[3].data.dimension.text,'Check clearance');
 assert.ok(os.every(o=>o.contours.every(c=>!c.closed)));
});
test('scaled dimension gaps use measured document endpoints at rounding boundaries',()=>{
 const o=all(build([{type:'dimension',kind:'linear',axis:'x',points:[[10,0],[10010.005,0]],position:[10,20],size:320}]))[0];
 // Native Matrix/Point measurement rounds this transformed span to "10000 mm".
 assert.ok(Math.abs(o.contours[2].segments[1][0]-4190.0025)<1e-9);
});
test('helpers reject invalid text, dimensions, arrowheads, layers and unknown fields',()=>{
 const bad=[text({content:' '}),text({content:'x'.repeat(501)}),text({content:'😀'}),text({fontId:'missing'}),text({size:0}),text({size:1001}),text({align:'middle'}),text({angle:NaN}),text({style:{stroke:'#383838'}}),text({typo:true}),
  {type:'arrow',points:[[0,0],[0,0]]},{type:'arrow',points:[[0,0],[1,0]],headLength:0},{type:'arrow',points:[[0,0],[1,0]],ends:'none'},{type:'arrow',points:[[0,0],[1,0]],style:{fill:'#123456'}},
  {type:'dimension',points:[[0,0],[0,0]],position:[0,10]},
  {type:'dimension',kind:'linear',axis:'x',points:[[0,0],[0,10]],position:[10,10]},
  {type:'dimension',kind:'radial',points:[[0,0],[10,0]],position:[0,0]},
  {type:'dimension',kind:'leader',points:[[0,0],[10,10]],position:[20,10],text:''},
  {type:'dimension',points:[[0,0],[10,0]],position:[0,10],layer:'cutline'},
  {type:'dimension',points:[[0,0],[10,0]],position:[0,10],axis:'x'},
  {type:'dimension',points:[[0,0],[10,0]],position:[0,10],style:{fill:'#123456'}},
 ];
 for(const def of bad)assert.throws(()=>build([def]),undefined,JSON.stringify(def));
});
test('expanded glyph geometry respects the global budget and translated outlines respect coordinate bounds',()=>{
 assert.throws(()=>build([text({x:1000000})]));
 assert.throws(()=>build(Array.from({length:200},(_,i)=>text({id:`t-${i}`,content:'B'.repeat(500)}))),/budget/i);
});
test('the annotated native example is reproducible and only reports expected editable-metadata warnings',async()=>{
 const input=JSON.parse(await readFile(new URL('../assets/annotated-plate.design.json',import.meta.url),'utf8'));
 const expected=JSON.parse(await readFile(new URL('../assets/annotated-plate.vectora',import.meta.url),'utf8'));
 assert.deepEqual(buildDesign(input),expected);
 const report=lintDocument(expected);assert.equal(report.errors,0);assert.equal(report.warnings,6);
 assert.ok(report.issues.every(i=>i.code==='EDITABLE_METADATA'));
});
test('copied authoring kit generates labels, dimensions and arrows without npm or application source',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vectora-annotations-'));
 try{
  await cp(new URL('..',import.meta.url),join(dir,'kit'),{recursive:true});
  await writeFile(join(dir,'recipe.json'),JSON.stringify({format:'vectora-design',version:1,units:'mm',objects:[text(),{type:'dimension',points:[[0,0],[30,0]],position:[0,10]},{type:'arrow',points:[[0,0],[10,10]]}]}));
  const r=spawnSync(process.execPath,[join(dir,'kit/scripts/vectora.mjs'),'build','recipe.json','--out','drawing.vectora','--json'],{cwd:dir,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr||r.stdout);assert.equal(JSON.parse(r.stdout).files[0].summary.objects,3);
  assert.equal(JSON.parse(await readFile(join(dir,'drawing.vectora'),'utf8')).format,'vectora');
 }finally{await rm(dir,{recursive:true,force:true});}
});
