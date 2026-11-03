import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildDesign} from '../scripts/build.mjs';
import {lintDocument} from '../scripts/lint.mjs';
const recipe=()=>({format:'vectora-design',version:1,units:'mm',canvasSize:{kind:'fixed',width:120,height:80,unit:'mm'},objects:[{type:'rectangle',id:'plate',name:'Plate',layer:'cutline',x:10,y:10,width:100,height:60}]});
const valid=()=>buildDesign(recipe());
const issues=(doc)=>lintDocument(doc).issues;
const codes=(doc)=>issues(doc).map(i=>i.code);
test('builder emits the native v1 envelope, operation layers and exact mm coordinates',()=>{
 const d=valid();assert.equal(d.format,'vectora');assert.equal(d.version,1);assert.equal(d.rasterLayerInitialized,true);assert.equal(d.units,'mm');
 const layer=d.layers.find(l=>l.id==='cutline'),o=layer.objects[0];assert.equal(o.data.role,layer.role);assert.equal(o.data.uid,'plate');assert.equal(o.style.stroke,'#FF0000');assert.equal(o.style.fill,null);
 assert.deepEqual(o.contours[0].segments[0],[10,10,0,0,0,0]);assert.equal(lintDocument(d).ok,true);assert.deepEqual(issues(d),[]);
});
test('circles retain relative cubic handles; compounds preserve independent closed holes',()=>{
 const r=recipe();r.objects=[{type:'compound',layer:'cutline',contours:[{type:'rectangle',x:10,y:10,width:100,height:60},{type:'circle',cx:30,cy:30,radius:5}]}];
 const d=buildDesign(r),o=d.layers.find(l=>l.id==='cutline').objects[0];assert.equal(o.kind,'compound');assert.equal(o.contours.length,2);assert.equal(o.style.fillRule,'evenodd');
 const circle=o.contours[1];assert.deepEqual(circle.segments[0].slice(0,2),[35,30]);assert.ok(Math.abs(circle.segments[0][5]-2.761423749153967)<1e-12);assert.equal(circle.closed,true);assert.deepEqual(issues(d),[]);
});
test('all authoring primitives build natively valid contours without quantizing coordinates',()=>{
 const r=recipe();r.objects=[{type:'ellipse',cx:50,cy:40,rx:10,ry:4},{type:'polygon',cx:50,cy:40,radius:10,sides:7,angle:15},{type:'line',points:[[1.125,2],[9.375,4]]},{type:'polyline',points:[[0,0],[2,3],[4,1]]},{type:'path',closed:false,segments:[[0,0,0,0,3,4],[10,0,-3,4,0,0]]}];
 const d=buildDesign(r);assert.equal(lintDocument(d).ok,true);assert.equal(lintDocument(d).summary.objects,5);assert.deepEqual(d.layers[0].objects[2].contours[0].segments[0],[1.125,2,0,0,0,0]);
});
for(const [name,mutate,code] of [
 ['wrong version',d=>d.version=2,'VERSION'],['wrong units',d=>d.units='px','UNITS'],
 ['missing style',d=>delete d.layers[1].objects[0].style,'STYLE'],
 ['nonfinite coordinates',d=>d.layers[1].objects[0].contours[0].segments[0][0]=NaN,'NUMBER'],
 ['wrong segment shape',d=>d.layers[1].objects[0].contours[0].segments[0]=[1,2],'SEGMENT'],
 ['duplicate layer IDs',d=>d.layers.push(structuredClone(d.layers[0])),'LAYER_ID'],
 ['duplicate object IDs',d=>d.layers[0].objects.push(structuredClone(d.layers[1].objects[0])),'OBJECT_ID'],
 ['missing active layer',d=>d.activeLayerId='missing','ACTIVE_LAYER'],
 ['invalid opacity',d=>d.layers[1].objects[0].style.opacity=2,'NUMBER'],
 ['bad grid',d=>d.grid.spacing=0,'GRID'],['bad canvas',d=>d.canvasSize.width=0,'CANVAS'],
 ['role mismatch',d=>d.layers[1].objects[0].data.role='artwork','ROLE_MISMATCH'],
 ['invalid stroke colour',d=>d.layers[1].objects[0].style.stroke='red','COLOUR'],
])test(`linter reports ${name} with an actionable JSON path`,()=>{const d=valid();mutate(d);const found=issues(d).find(i=>i.code===code);assert.ok(found,JSON.stringify(issues(d)));assert.equal(found.severity,'error');assert.ok(found.path.startsWith('$'));assert.equal(lintDocument(d).ok,false);});
test('a drawing that exceeds the importer geometry bounds fails even if anchors are in range',()=>{
 const d=valid();d.layers[1].objects[0].contours=[{closed:false,segments:[[999999,0,0,0,1000000,0],[999999,1,1000000,0,0,0]]}];assert.ok(codes(d).includes('BOUNDS'));
});
test('curve bounds use extrema rather than rejecting harmless outlying control points',()=>{
 const d=valid();d.canvasSize={kind:'infinite'};d.layers[1].objects[0].contours=[{closed:false,segments:[[0,0,0,0,1000000,0],[0,1,1000000,0,0,0]]}];assert.equal(lintDocument(d).ok,true);assert.equal(lintDocument(d).summary.bounds.right,750000);
});
test('intentional open cuts, duplicate cuts and off-canvas geometry are advisory and never repaired',()=>{
 const d=valid(),o=d.layers[1].objects[0];o.contours[0].closed=false;const copy=structuredClone(o);copy.data.uid='copy';d.layers[1].objects.push(copy);d.canvasSize.width=20;
 const before=JSON.stringify(d),result=lintDocument(d);assert.equal(result.ok,true);for(const c of ['OPEN_CUT','DUPLICATE_GEOMETRY','OUTSIDE_CANVAS'])assert.ok(codes(d).includes(c));assert.equal(JSON.stringify(d),before);
});
test('invalid recipe options fail instead of silently creating a different design',()=>{
 for(const change of [r=>r.units='in',r=>r.objects[0].width=-1,r=>r.objects[0].layer='missing',r=>r.objects[0].widht=15,r=>r.objects[0].type='unknown']){const r=recipe();change(r);assert.throws(()=>buildDesign(r));}
});
test('compound child contours reject object options rather than silently changing their operation',()=>{
 for(const option of [{layer:'engrave'},{style:{stroke:'#0000FF'}},{id:'child'},{visible:false},{locked:true},{name:'child'}]){
  const r=recipe();r.objects=[{type:'compound',layer:'cutline',contours:[{type:'rectangle',x:10,y:10,width:20,height:20,...option}]}];
  assert.throws(()=>buildDesign(r),/Unknown rectangle field/);
 }
});
test('malformed advanced metadata yields diagnostics instead of crashing the linter',()=>{
 const mutations=[o=>o.data.arc={},o=>{o.data.arc={cx:0,cy:0,radius:10,start:0,sweep:180};o.contours=[{closed:false,segments:{length:3}}];},o=>o.data.text={},o=>o.data.dimension={},o=>o.data.rasterTrace={settings:null},o=>o.data.fillPaint=null,o=>o.style.fill={type:'gradient',stops:[null,null]},o=>o.data.customColour={type:'gradient'}];
 for(const mutate of mutations){const d=valid();mutate(d.layers[1].objects[0]);assert.equal(lintDocument(d).ok,false);}
});
test('error status remains correct after diagnostic truncation and budgets reject before geometry work',()=>{
 const d=valid(),o=d.layers[1].objects[0];for(let i=0;i<1100;i++)o.data[`unknown-${i}`]=true;o.style.opacity=2;
 const result=lintDocument(d);assert.equal(result.ok,false);assert.equal(result.truncated,true);assert.equal(result.issues.length,1000);assert.ok(result.errors>0);
 d.layers[1].objects=Array(20001).fill(o);assert.ok(codes(d).includes('BUDGET'));
});
test('native arc identity checks every anchor and relative handle',()=>{
 const d=valid(),o=d.layers[1].objects[0],k=4/3*Math.tan(Math.PI/8)*10;
 o.data.arc={cx:30,cy:30,radius:10,start:0,sweep:180};
 o.contours=[{closed:false,segments:[[40,30,0,0,0,k],[30,40,k,0,-k,0],[20,30,0,k,0,0]]}];
 assert.equal(lintDocument(d).ok,true);o.contours[0].segments[1][4]+=.01;assert.ok(codes(d).includes('ARC_IDENTITY'));
});
test('CLI build and lint work without dependencies, preserve existing files and expose JSON diagnostics',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vectora-kit-')),cli=fileURLToPath(new URL('../scripts/vectora.mjs',import.meta.url));
 const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',cwd:dir});
 try{
  const input=join(dir,'recipe.json'),out=join(dir,'plate.vectora');await writeFile(input,JSON.stringify(recipe()));
  assert.equal(run('build',input,'--out',out).status,0);assert.equal(run('lint',out,'--strict').status,0);
  assert.equal(run('build',input,'--out',out).status,2);assert.equal(run('build',input,'--out',out,'--force').status,0);
  const d=JSON.parse(await readFile(out,'utf8'));d.layers[1].objects[0].contours[0].closed=false;await writeFile(out,JSON.stringify(d));
  assert.equal(run('lint',out).status,0);assert.equal(run('lint',out,'--strict').status,1);
  const report=JSON.parse(run('lint',out,'--json').stdout);assert.ok(report.files[0].issues.some(i=>i.code==='OPEN_CUT'));
  await writeFile(out,'{ broken json');assert.equal(run('lint',out).status,1);assert.equal(run('lint',join(dir,'missing.vectora')).status,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
