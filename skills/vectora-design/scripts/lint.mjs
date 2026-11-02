import {finite,identifier,isRecord,tuple,ROLES,INKS,FONT_IDS,LIMITS,MAX_COORDINATE,contourBounds,unionBounds} from './geometry.mjs';

/** Read-only native-v1 validation plus advisory design checks. No repair or flattening. */
export function lintDocument(file){
 const issues=[],summary={layers:0,objects:0,contours:0,segments:0,bounds:null};
 let errors=0,warnings=0,truncated=false;
 const add=(severity,code,path,message)=>{if(severity==='error')errors++;else warnings++;if(issues.length<1000)issues.push({severity,code,path,message});else truncated=true;};
 const error=(code,path,message)=>add('error',code,path,message),warn=(code,path,message)=>add('warning',code,path,message);
 const result=()=>({ok:errors===0,errors,warnings,truncated,issues,summary});
 const num=(value,path,min=-MAX_COORDINATE,max=MAX_COORDINATE)=>{if(!finite(value,Math.max(Math.abs(min),Math.abs(max)))||value<min||value>max){error('NUMBER',path,`Expected a finite number from ${min} to ${max}.`);return false;}return true;};
 const boolean=(value,path)=>{if(typeof value!=='boolean')error('BOOLEAN',path,'Expected true or false.');};
 const text=(value,path,max=500)=>{if(typeof value!=='string'||value.length>max)error('STRING',path,`Expected a string of at most ${max} characters.`);};
 const point=(value,path,n=2)=>{if(!tuple(value,n))error('TUPLE',path,`Expected ${n} finite numbers within ±1000000.`);};
 const choice=(value,values,path)=>{if(!values.includes(value))error('ENUM',path,`Expected one of: ${values.join(', ')}.`);};
 const unknown=(value,allowed,path)=>{for(const key of Object.keys(value))if(!allowed.includes(key))warn('UNKNOWN_FIELD',`${path}.${key}`,'This field is not part of the documented v1 format and may be discarded on import.');};
 function colour(v,p){
  if(v===null||typeof v==='string'&&/^(#[\da-f]{3,8}|rgba?\([\d.,\s]+\))$/i.test(v))return;
  if(!isRecord(v)||v.type!=='gradient'){error('COLOUR',p,'Expected null, a supported hex/rgb colour, or a native gradient.');return;}
  boolean(v.radial,`${p}.radial`);point(v.origin,`${p}.origin`);point(v.destination,`${p}.destination`);if(v.highlight!==null)point(v.highlight,`${p}.highlight`);
  if(!Array.isArray(v.stops)||v.stops.length<2||v.stops.length>8){error('GRADIENT',`${p}.stops`,'A gradient needs 2–8 stops.');return;}
  v.stops.forEach((s,i)=>{const q=`${p}.stops[${i}]`;if(!isRecord(s)){error('GRADIENT',q,'Expected a stop object.');return;}if(typeof s.colour!=='string')error('COLOUR',`${q}.colour`,'Expected a solid colour.');else colour(s.colour,`${q}.colour`);num(s.offset,`${q}.offset`,0,1);num(s.opacity,`${q}.opacity`,0,1);});
 }
 function fillPaint(v,p){
  if(!isRecord(v)){error('FILL_PAINT',p,'Expected fill appearance metadata.');return;}
  const hex=(c,q)=>{if(typeof c!=='string'||!/^#[\da-f]{6}$/i.test(c))error('COLOUR',q,'Expected a six-digit hex colour.');};
  num(v.opacity,`${p}.opacity`,0,1);
  if(v.kind==='colour')hex(v.colour,`${p}.colour`);
  else if(v.kind==='gradient'){
   choice(v.type,['linear','radial'],`${p}.type`);num(v.angle,`${p}.angle`,-360,360);
   if(!Array.isArray(v.stops)||v.stops.length<2||v.stops.length>8)error('GRADIENT',`${p}.stops`,'Expected 2–8 stops.');
   else v.stops.forEach((s,i)=>{if(!isRecord(s)){error('GRADIENT',p,'Expected stop objects.');return;}hex(s.colour,`${p}.stops[${i}].colour`);num(s.offset,`${p}.stops[${i}].offset`,0,1);num(s.opacity,`${p}.stops[${i}].opacity`,0,1);});
  }else if(v.kind==='pattern'){
   choice(v.type,['stripes','crosshatch','dots','checkerboard'],`${p}.type`);hex(v.foreground,`${p}.foreground`);hex(v.background,`${p}.background`);boolean(v.transparent,`${p}.transparent`);num(v.size,`${p}.size`,.5,100);num(v.angle,`${p}.angle`,-360,360);num(v.detail,`${p}.detail`,5,90);
  }else error('FILL_PAINT',`${p}.kind`,'Expected colour, gradient or pattern.');
 }
 function metadata(d,p,role,ids,o){
  if(!isRecord(d)){error('METADATA',p,'Expected data with a unique uid, name and layer role.');return;}
  if(!identifier(d.uid)||ids.has(d.uid))error('OBJECT_ID',`${p}.uid`,'Use a globally unique ID matching [A-Za-z0-9_-]{1,100}.');else ids.add(d.uid);
  if(d.role!==role)error('ROLE_MISMATCH',`${p}.role`,'Object role must match its containing layer; the importer otherwise overwrites it.');
  if(d.name!==undefined)text(d.name,`${p}.name`);
  if(d.rotationDegrees!==undefined)num(d.rotationDegrees,`${p}.rotationDegrees`,-1e12,1e12);
  for(const key of ['joined','regionFill','customStroke'])if(d[key]!==undefined)boolean(d[key],`${p}.${key}`);
  if(d.sides!==undefined&&(!Number.isInteger(d.sides)||d.sides<3||d.sides>64))error('POLYGON',`${p}.sides`,'Expected an integer from 3 to 64.');
  for(const key of ['customColour','regionFillColor'])if(d[key]!==undefined){if(d[key]!==null&&typeof d[key]!=='string')error('COLOUR',`${p}.${key}`,'Expected a solid colour or null.');else colour(d[key],`${p}.${key}`);}
  if(d.fillPaint!==undefined){fillPaint(d.fillPaint,`${p}.fillPaint`);if(role==='artwork'&&d.fillPaint?.kind!=='colour'&&(!isRecord(o.style?.fill)||o.style.fill.type!=='gradient'||d.fillPaint?.kind==='pattern'&&o.style.fill.highlight==null))error('FILL_PAINT',p,'Gradient/pattern metadata requires its matching native gradient style (patterns need highlight).');}
  if(d.arc!==undefined){
   const a=d.arc,q=`${p}.arc`;if(!isRecord(a)){error('ARC',q,'Expected circular arc metadata.');}
   else {
    num(a.cx,`${q}.cx`);num(a.cy,`${q}.cy`);num(a.radius,`${q}.radius`,.001);num(a.start,`${q}.start`,-1e12,1e12);num(a.sweep,`${q}.sweep`,-359,359);if(Math.abs(a.sweep)<1)error('ARC',q,'Signed sweep magnitude must be 1–359 degrees.');
    const c=o.contours?.[0],s=c?.segments,spans=s?.length-1,step=a.sweep/spans;
    if(o.kind!=='path'||c?.closed||d.text||d.dimension||!Array.isArray(s)||spans<1||spans>4||Math.abs(step)>90+1e-5)error('ARC',q,'Arc metadata needs an open path with 1–4 matching tangent-cubic spans.');
    else if([a.cx,a.cy,a.radius,a.start,a.sweep].every(Number.isFinite)&&s.every(v=>tuple(v,6))){
     const normalized=v=>((v%360)+360)%360,k=4/3*Math.tan(step*Math.PI/720)*a.radius,budget=4e-12+64*Number.EPSILON*Math.max(1,Math.abs(a.cx),Math.abs(a.cy),a.radius);
     const matches=s.every((v,i)=>{const angle=normalized(normalized(a.start)+i*step)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),tx=-sin*k,ty=cos*k;return [a.cx+a.radius*cos,a.cy+a.radius*sin,i?-tx:0,i?-ty:0,i<spans?tx:0,i<spans?ty:0].every((n,j)=>Math.abs(n-v[j])<=budget);});
     if(!matches)error('ARC_IDENTITY',q,'Arc parameters disagree with the actual anchors/relative handles. Remove stale metadata or rebuild the intended arc; do not change curves merely to pass lint.');
    }
   }
  }
  if(d.text!==undefined){
   const t=d.text,q=`${p}.text`;if(!isRecord(t))error('TEXT',q,'Expected editable text metadata and stored glyph outlines.');
   else {text(t.content,`${q}.content`,500);if(typeof t.content==='string'&&!t.content.trim())error('TEXT',q,'Text content cannot be blank.');choice(t.fontId??'lato',FONT_IDS,`${q}.fontId`);num(t.sizeMM,`${q}.sizeMM`,.1,1000);point(t.transform,`${q}.transform`,6);
    if(!Array.isArray(t.glyphContours)||!Array.isArray(t.glyphLabels)||t.glyphContours.length>500||t.glyphContours.length!==t.glyphLabels.length)error('TEXT',q,'Expected equal glyphContours/glyphLabels arrays of at most 500 entries.');
    else {t.glyphContours.forEach((n,i)=>{if(!Number.isInteger(n)||n<0||n>2000)error('TEXT',`${q}.glyphContours[${i}]`,'Expected an integer from 0 to 2000.');});t.glyphLabels.forEach((s,i)=>text(s,`${q}.glyphLabels[${i}]`,20));}
    warn('EDITABLE_METADATA',q,'Font outlines, glyph mapping and transform consistency require an in-app edit/round-trip check; lint does not reconstruct fonts.');
   }
  }
  if(d.dimension!==undefined){
   const dmn=d.dimension,q=`${p}.dimension`;if(!isRecord(dmn))error('DIMENSION',q,'Expected annotation metadata.');
   else {choice(dmn.kind,['dimension-aligned','dimension-linear','dimension-radial','dimension-diameter','leader'],`${q}.kind`);if(!Array.isArray(dmn.points)||dmn.points.length!==3)error('DIMENSION',`${q}.points`,'Expected three reference points.');else dmn.points.forEach((v,i)=>point(v,`${q}.points[${i}]`));point(dmn.transform,`${q}.transform`,6);if(dmn.axis!==undefined)choice(dmn.axis,['x','y'],`${q}.axis`);if(dmn.text!==undefined)text(dmn.text,`${q}.text`,5000);warn('EDITABLE_METADATA',q,'Verify annotation labels and their represented geometry in-app; lint does not regenerate dimensions.');}
  }
  if(d.rasterTrace!==undefined){
   const t=d.rasterTrace,q=`${p}.rasterTrace`;if(!isRecord(t))error('TRACE',q,'Expected trace provenance.');
   else {choice(t.mode,['outline','centerline','fill','colour'],`${q}.mode`);if(t.sourceName!==undefined)text(t.sourceName,`${q}.sourceName`,1000);
    if(t.settings!==undefined){if(!isRecord(t.settings))error('TRACE',`${q}.settings`,'Expected trace settings.');else {boolean(t.settings.invert,`${q}.settings.invert`);for(const k of ['threshold','brightness','contrast','despeckleSize','simplifyTolerance','curveFitting','cornerSensitivity'])num(t.settings[k],`${q}.settings.${k}`,-10000,10000);if(t.mode==='colour'){for(const [k,min,max] of [['colourCount',2,32],['colourSmoothing',0,2]])if(!Number.isInteger(t.settings[k])||t.settings[k]<min||t.settings[k]>max)error('TRACE',`${q}.settings.${k}`,`Expected an integer from ${min} to ${max}.`);}}}
   }
  }
  unknown(d,['uid','role','name','rotationDegrees','joined','sides','regionFill','fillPaint','customColour','customStroke','regionFillColor','rasterTrace','arc','text','dimension'],p);
 }
 if(!isRecord(file)){error('DOCUMENT','$','Expected a native Vectora JSON object.');return result();}
 if(file.format!=='vectora')error('FORMAT','$.format','Expected vectora (a recipe must be built first).');
 if(file.version!==1)error('VERSION','$.version','Only native document version 1 is supported.');
 if(file.units!=='mm')error('UNITS','$.units','Geometry must be in millimetres. Convert coordinates before writing.');
 if(file.rasterLayerInitialized!==undefined)boolean(file.rasterLayerInitialized,'$.rasterLayerInitialized');
 else warn('LEGACY_DEFAULT_LAYER','$.rasterLayerInitialized','Omitting this marker can add a Raster Engrave layer on import. Set true when intentional layer membership should be preserved.');
 const canvas=file.canvasSize;
 if(canvas!==undefined&&(!isRecord(canvas)||!['infinite','fixed'].includes(canvas.kind)||canvas.kind==='fixed'&&(!['mm','cm','in'].includes(canvas.unit)||!finite(canvas.width,10000)||canvas.width<.1||!finite(canvas.height,10000)||canvas.height<.1)))error('CANVAS','$.canvasSize','Use infinite, or fixed with width/height 0.1–10000 mm and unit mm/cm/in (display only).');
 const grid=file.grid;
 if(grid!==undefined&&(!isRecord(grid)||!['square','isometric','polar','hexagonal','triangular','dot','none'].includes(grid.type)||!finite(grid.spacing,1000)||grid.spacing<.1||![5,10,15,20,30,45,60,90].includes(grid.angle)))error('GRID','$.grid','Expected a known grid type, spacing 0.1–1000 mm, and an allowed radial angle.');
 const view=file.view;
 if(!isRecord(view)||!finite(view.zoom,100)||view.zoom<.1||!tuple(view.center,2))warn('VIEW','$.view','Missing/invalid camera will reset to 100% at [100,70]; geometry stays unchanged.');
 if(!Array.isArray(file.layers)||file.layers.length>LIMITS.layers){error('LAYERS','$.layers','Expected at most 1000 layers.');return result();}
 summary.layers=file.layers.length;
 // Preflight allocation budgets before examining geometry or calculating bounds.
 for(const l of file.layers)if(Array.isArray(l?.objects))for(const o of l.objects){summary.objects++;if(Array.isArray(o?.contours)){summary.contours+=o.contours.length;for(const c of o.contours)if(Array.isArray(c?.segments))summary.segments+=c.segments.length;}}
 if(summary.objects>LIMITS.objects||summary.contours>LIMITS.contours||summary.segments>LIMITS.segments){error('BUDGET','$.layers','Exceeded 20000 objects, 50000 contours or 500000 segments.');return result();}
 const layerIds=new Set(),objectIds=new Set(),duplicates=new Map();
 file.layers.forEach((l,li)=>{
  const p=`$.layers[${li}]`;if(!isRecord(l)){error('LAYER',p,'Expected a layer object.');return;}
  if(!identifier(l.id)||layerIds.has(l.id))error('LAYER_ID',`${p}.id`,'Expected a unique layer ID matching [A-Za-z0-9_-]{1,100}.');else layerIds.add(l.id);
  text(l.name,`${p}.name`,200);if(typeof l.name==='string'&&!l.name.trim())error('LAYER',`${p}.name`,'Layer names cannot be blank.');choice(l.role,ROLES,`${p}.role`);boolean(l.visible,`${p}.visible`);boolean(l.locked,`${p}.locked`);
  if(['artwork','cutline'].includes(l.id)&&l.role!==l.id)error('LAYER',`${p}.role`,'Reserved artwork/cutline IDs must use their matching role.');
  if(l.colour!==undefined&&(ROLES.includes(l.id)||typeof l.colour!=='string'||!/^#[\da-f]{6}$/i.test(l.colour)))error('LAYER_COLOUR',`${p}.colour`,'Only custom layer IDs accept a six-digit colour override.');
  if(!Array.isArray(l.objects)){error('OBJECTS',`${p}.objects`,'Expected an array of native objects.');return;}
  l.objects.forEach((o,oi)=>{
   const q=`${p}.objects[${oi}]`;if(!isRecord(o)){error('OBJECT',q,'Expected a path or compound.');return;}
   if(!['path','compound'].includes(o.kind))error('KIND',`${q}.kind`,'Only path and compound are native object kinds; bake primitive geometry into contours.');
   boolean(o.visible,`${q}.visible`);boolean(o.locked,`${q}.locked`);metadata(o.data,`${q}.data`,l.role,objectIds,o);
   const s=o.style;
   if(!isRecord(s))error('STYLE',`${q}.style`,'Expected all native style fields.');
   else {colour(s.fill,`${q}.style.fill`);colour(s.stroke,`${q}.style.stroke`);num(s.width,`${q}.style.width`,0,10000);boolean(s.scaling,`${q}.style.scaling`);choice(s.fillRule,['nonzero','evenodd'],`${q}.style.fillRule`);choice(s.cap,['butt','round','square'],`${q}.style.cap`);choice(s.join,['miter','round','bevel'],`${q}.style.join`);num(s.miter,`${q}.style.miter`,-10000,10000);num(s.offset,`${q}.style.offset`);num(s.opacity,`${q}.style.opacity`,0,1);
    if(!Array.isArray(s.dash)||s.dash.length>1000)error('DASH',`${q}.style.dash`,'Expected at most 1000 dash lengths.');else s.dash.forEach((n,i)=>num(n,`${q}.style.dash[${i}]`,0,10000));
    if(s.opacity===0||s.fill===null&&(s.stroke===null||s.width===0))warn('INVISIBLE',q,'This object has no visible paint.');
    if(['cutline','engrave','construction'].includes(l.role)&&typeof s.stroke==='string'&&s.stroke.toUpperCase()!==(l.colour??INKS[l.role]).toUpperCase())warn('OPERATION_COLOUR',`${q}.style.stroke`,'Use the layer operation colour; role, not colour, determines export.');
   }
   if(!Array.isArray(o.contours)||!o.contours.length||o.kind==='path'&&o.contours.length!==1){error('CONTOURS',`${q}.contours`,'A path needs one contour; a compound needs one or more.');return;}
   let bounds=null,valid=true;
   o.contours.forEach((c,ci)=>{
    const r=`${q}.contours[${ci}]`;if(!isRecord(c)||!Array.isArray(c.segments)){error('CONTOUR',r,'Expected closed and segments.');valid=false;return;}
    boolean(c.closed,`${r}.closed`);let good=true;
    c.segments.forEach((seg,si)=>{if(!Array.isArray(seg)||seg.length!==6){error('SEGMENT',`${r}.segments[${si}]`,'Expected [x,y,handleInX,handleInY,handleOutX,handleOutY].');good=false;}else seg.forEach((n,j)=>{if(!num(n,`${r}.segments[${si}][${j}]`))good=false;});});
    if(!good){valid=false;return;}
    const b=contourBounds(c);bounds=unionBounds(bounds,b);
    if(c.segments.length<2)warn('EMPTY_CONTOUR',r,'Fewer than two anchors cannot describe a useful path.');
    if(b&&b.left===b.right&&b.top===b.bottom)warn('ZERO_LENGTH',r,'This contour collapses to a single point.');
    if(l.role==='cutline'&&!c.closed)warn('OPEN_CUT',r,'Open cut: intentional slits are valid, but this cannot define a closed 3D outline.');
   });
   if(bounds){summary.bounds=unionBounds(summary.bounds,bounds);if(Object.values(bounds).some(n=>!Number.isFinite(n)||Math.abs(n)>MAX_COORDINATE))error('BOUNDS',q,'Actual cubic bounds exceed ±1000000 mm, including curve extrema.');
    if(canvas?.kind==='fixed'&&(bounds.left<0||bounds.top<0||bounds.right>canvas.width||bounds.bottom>canvas.height))warn('OUTSIDE_CANVAS',q,'Geometry extends outside the fixed canvas. The canvas is a guide and does not clip exports.');}
   if(!l.visible||!o.visible)warn('HIDDEN',q,'Hidden geometry is omitted by SVG/3D; DXF process layers can still export it.');
   if(valid&&l.visible&&o.visible&&['cutline','engrave'].includes(l.role)){
    const key=JSON.stringify([l.role,o.contours.map(c=>({closed:c.closed,segments:c.segments}))]);
    if(duplicates.has(key))warn('DUPLICATE_GEOMETRY',q,`Identical ordered geometry also exists at ${duplicates.get(key)}; this can create duplicate tool passes.`);else duplicates.set(key,q);
   }
   unknown(o,['kind','contours','data','visible','locked','style'],q);
  });
  unknown(l,['id','name','role','visible','locked','colour','objects'],p);
 });
 if(file.activeLayerId!==undefined&&(!identifier(file.activeLayerId)||!layerIds.has(file.activeLayerId)))error('ACTIVE_LAYER','$.activeLayerId','Choose an existing layer ID.');
 if(!summary.objects)warn('EMPTY_DESIGN','$.layers','The document contains no design objects.');
 unknown(file,['format','version','units','rasterLayerInitialized','grid','canvasSize','activeLayerId','layers','view'],'$');
 return result();
}
