import {finite,identifier,isRecord,tuple,ROLES,INKS,LAYER_NAMES,LIMITS,contourBounds,unionBounds} from './geometry.mjs';
import {lintDocument} from './lint.mjs';
import {buildText} from './text.mjs';
import {buildArrow,buildDimension} from './annotations.mjs';
const fail=message=>{throw new Error(message);};
const number=(v,name,min=-1_000_000)=>finite(v)&&v>=min?v:fail(`${name} must be a finite number from ${min} to 1000000.`);
function keys(value,allowed,label){if(!isRecord(value))fail(`${label} must be an object.`);for(const key of Object.keys(value))if(!allowed.includes(key))fail(`Unknown ${label} field: ${key}.`);}
const anchor=([x,y])=>[x,y,0,0,0,0];
const geometryKeys={rectangle:['x','y','width','height'],circle:['cx','cy','radius'],ellipse:['cx','cy','rx','ry'],polygon:['cx','cy','radius','sides','angle'],line:['points'],polyline:['points'],path:['segments','closed'],compound:['contours']};
const helperKeys={text:['content','x','y','size','fontId','align','angle'],arrow:['points','ends','headLength','headWidth'],dimension:['points','position','kind','axis','text','size']};
const objectKeys=['type','id','name','layer','visible','locked','style'];
function contour(shape,child=false){
 const type=shape.type;if(!geometryKeys[type]||type==='compound')fail(`Unsupported contour type: ${String(type)}. Use rectangle, circle, ellipse, polygon, line, polyline or path.`);
 keys(shape,[...(child?['type']:objectKeys),...geometryKeys[type]],type);
 if(type==='rectangle'){
  const x=number(shape.x,'x'),y=number(shape.y,'y'),w=number(shape.width,'width',.001),h=number(shape.height,'height',.001);
  return {closed:true,segments:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(anchor)};
 }
 if(type==='circle'||type==='ellipse'){
  const x=number(shape.cx,'cx'),y=number(shape.cy,'cy'),rx=number(type==='circle'?shape.radius:shape.rx,'radius / rx',.001),ry=number(type==='circle'?shape.radius:shape.ry,'radius / ry',.001),k=4/3*Math.tan(Math.PI/8);
  return {closed:true,segments:[[x+rx,y,0,-k*ry,0,k*ry],[x,y+ry,k*rx,0,-k*rx,0],[x-rx,y,0,k*ry,0,-k*ry],[x,y-ry,-k*rx,0,k*rx,0]]};
 }
 if(type==='polygon'){
  const x=number(shape.cx,'cx'),y=number(shape.cy,'cy'),r=number(shape.radius,'radius',.001),n=shape.sides,angle=number(shape.angle??0,'angle')*Math.PI/180;
  if(!Number.isInteger(n)||n<3||n>64)fail('Polygon sides must be an integer from 3 to 64.');
  return {closed:true,segments:Array.from({length:n},(_,i)=>anchor([x+r*Math.cos(angle+2*Math.PI*i/n),y+r*Math.sin(angle+2*Math.PI*i/n)]))};
 }
 if(type==='line'||type==='polyline'){
  if(!Array.isArray(shape.points)||shape.points.length<2||(type==='line'&&shape.points.length!==2)||shape.points.length>LIMITS.segments||!shape.points.every(p=>tuple(p,2)))fail(`${type} points must contain ${type==='line'?'two':'at least two'} [x,y] pairs in mm.`);
  return {closed:false,segments:shape.points.map(anchor)};
 }
 if(typeof shape.closed!=='boolean'||!Array.isArray(shape.segments)||shape.segments.length>LIMITS.segments||!shape.segments.every(s=>tuple(s,6)))fail('A path requires closed: boolean and six-number native segments.');
 return {closed:shape.closed,segments:structuredClone(shape.segments)};
}

/** Build a deliberately small authoring recipe into native Vectora v1 JSON. */
export function buildDesign(recipe){
 keys(recipe,['format','version','units','layers','objects','activeLayerId','canvasSize','grid','view'],'recipe');
 if(recipe.format!=='vectora-design'||recipe.version!==1||recipe.units!=='mm')fail('Recipe requires format: vectora-design, version: 1 and units: mm.');
 if(!Array.isArray(recipe.objects)||recipe.objects.length>LIMITS.objects)fail('Recipe objects must be an array of at most 20000 shapes.');
 const definitions=recipe.layers??ROLES.map((role,i)=>({id:role,name:LAYER_NAMES[i],role}));
 if(!Array.isArray(definitions)||!definitions.length||definitions.length>LIMITS.layers)fail('Provide between 1 and 1000 layers.');
 const layers=definitions.map(l=>{keys(l,['id','name','role','visible','locked','colour'],'layer');return {id:l.id,name:l.name,role:l.role,visible:l.visible??true,locked:l.locked??false,...(l.colour!==undefined?{colour:l.colour}:{}),objects:[]};});
 const byId=new Map(layers.map(l=>[l.id,l]));let count=0,contours=0,segments=0;
 for(const shape of recipe.objects){
  if(!isRecord(shape)||!geometryKeys[shape.type]&&!helperKeys[shape.type])fail(`Unknown shape type: ${String(shape?.type)}.`);
  keys(shape,[...objectKeys,...(geometryKeys[shape.type]??helperKeys[shape.type])],'shape');
  const layer=byId.get(shape.layer??'artwork');if(!layer)fail(`Unknown layer: ${shape.layer??'artwork'}.`);
  const uid=shape.id??`object-${++count}`;if(!identifier(uid))fail('Object IDs must match [A-Za-z0-9_-]{1,100}.');
  const data={uid,role:layer.role,name:shape.name??shape.type[0].toUpperCase()+shape.type.slice(1)};
  if(shape.type==='polygon')data.sides=shape.sides;
  let paths;
  if(helperKeys[shape.type]){
   if(shape.type==='text'){number(shape.x,'Text x');number(shape.y,'Text y');}
   if(shape.type==='dimension'&&layer.role!=='artwork')fail('Dimensions and leader annotations must be in an Artwork layer.');
   const generated=shape.type==='text'?buildText(shape,{contours:LIMITS.contours-contours,segments:LIMITS.segments-segments}):shape.type==='arrow'?buildArrow(shape):buildDimension(shape);
   paths=generated.paths;Object.assign(data,generated.data);
  }else if(shape.type==='compound'){
   if(!Array.isArray(shape.contours)||!shape.contours.length||shape.contours.length>LIMITS.contours)fail('Compound contours must be a non-empty array of primitive/path definitions.');
   paths=shape.contours.map(c=>contour(c,true));
  }else paths=[contour(shape)];
  contours+=paths.length;segments+=paths.reduce((n,c)=>n+c.segments.length,0);
  if(contours>LIMITS.contours||segments>LIMITS.segments)fail('Design exceeds the document contour or segment budget.');
  const ink=layer.colour??INKS[layer.role];
  const style={fill:null,stroke:ink,width:layer.role==='artwork'?1:1.5,scaling:false,fillRule:'evenodd',cap:'round',join:'round',miter:10,dash:[],offset:0,opacity:1};
  if(shape.type==='text'){style.fill=ink;style.stroke=null;style.fillRule='nonzero';}
  if(shape.style!==undefined){keys(shape.style,Object.keys(style),'style');Object.assign(style,shape.style);}
  if(shape.type==='text'&&(style.fill===null||style.stroke!==null))fail('Editable text needs a fill and no stroke; convert to paths for outline lettering.');
  if(['dimension','arrow'].includes(shape.type)&&style.fill!==null)fail('Dimensions and arrows must be unfilled.');
  if(typeof style.stroke==='string'&&style.stroke!==ink)data.customColour=style.stroke;
  if(style.fill!==null&&layer.role==='artwork'&&shape.type!=='text')data.regionFill=true;
  layer.objects.push({kind:shape.type==='compound'||helperKeys[shape.type]?'compound':'path',contours:paths,data,visible:shape.visible??true,locked:shape.locked??false,style});
 }
 const bounds=layers.flatMap(l=>l.objects).flatMap(o=>o.contours).reduce((b,c)=>unionBounds(b,contourBounds(c)),null);
 const doc={format:'vectora',version:1,units:'mm',rasterLayerInitialized:true,grid:recipe.grid??{type:'square',spacing:10,angle:15},canvasSize:recipe.canvasSize??{kind:'infinite'},activeLayerId:recipe.activeLayerId??layers.find(l=>l.role==='artwork')?.id??layers[0].id,layers,view:recipe.view??{zoom:96/25.4,center:bounds?[(bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2]:[100,70]}};
 const result=lintDocument(doc);if(!result.ok)fail(result.issues.filter(i=>i.severity==='error').map(i=>`${i.path}: ${i.message}`).join('\n'));
 return doc;
}
