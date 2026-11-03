import {tuple,finite,LIMITS} from './geometry.mjs';

const fail=message=>{throw new Error(message);};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],mul=(a,k)=>[a[0]*k,a[1]*k];
const length=a=>Math.sqrt(a[0]*a[0]+a[1]*a[1]),normal=a=>[a[0]*Math.cos(Math.PI/2)-a[1],a[0]+a[1]*Math.cos(Math.PI/2)],unit=(a,size=1)=>mul(a,size/length(a));
const contour=points=>({closed:false,segments:points.map(p=>[...p,0,0,0,0])});
function positive(n,name){if(!finite(n)||n<.001)fail(`${name} must be 0.001–1000000 mm.`);return n;}
function points(value,min=2){if(!Array.isArray(value)||value.length<min||value.length>LIMITS.segments||!value.every(p=>tuple(p,2)))fail('Expected finite [x,y] points in mm within the segment budget.');return value;}
function head(tip,toward,size=2.2,width=1.4){const u=unit(sub(toward,tip),size),n=unit(normal(u),width/2);return [add(add(tip,u),n),tip,sub(add(tip,u),n)];}

export function buildArrow(shape){
 const ps=points(shape.points),ends=shape.ends??'end',size=positive(shape.headLength??2.2,'Arrow headLength'),width=positive(shape.headWidth??1.4,'Arrow headWidth');
 if(!['start','end','both'].includes(ends))fail('Arrow ends must be start, end or both.');
 if(ps.some((p,i)=>i&&length(sub(p,ps[i-1]))<.001))fail('Consecutive arrow points must be at least 0.001 mm apart.');
 const paths=[contour(ps)];
 if(ends==='start'||ends==='both')paths.push(contour(head(ps[0],ps[1],size,width)));
 if(ends==='end'||ends==='both')paths.push(contour(head(ps.at(-1),ps.at(-2),size,width)));
 return {paths,data:{}};
}

/** Mirror src/dimensions.ts. The app renders annotation labels from this metadata. */
export function buildDimension(shape){
 const kind=shape.kind??'aligned',size=shape.size??3.2;
 if(!['aligned','linear','radial','diameter','leader'].includes(kind))fail('Dimension kind must be aligned, linear, radial, diameter or leader.');
 if(!Number.isFinite(size)||size<.1||size>1000)fail('Dimension size must be 0.1–1000 mm.');
 const references=points(shape.points);if(references.length!==2||!tuple(shape.position,2))fail('A dimension needs two reference points and a position.');
 if(length(sub(references[1],references[0]))<.001)fail('Dimension references must be at least 0.001 mm apart.');
 if(shape.axis!==undefined&&(kind!=='linear'||!['x','y'].includes(shape.axis)))fail('Only linear dimensions accept axis: x or y.');
 if(kind==='leader'){
  if(typeof shape.text!=='string'||!shape.text.trim()||shape.text.length>5000)fail('A leader needs 1–5000 characters of text.');
 }else if(shape.text!==undefined)fail('Only leader dimensions accept custom text; measurements are calculated.');
 const scale=size/3.2,[a,b,c]=[...references,shape.position].map(p=>mul(p,1/scale)),lines=[];
 const line=(...ps)=>lines.push(contour(ps)),arrow=(tip,toward)=>line(...head(tip,toward));
 let axis=shape.axis;
 if(kind==='leader'){line(a,b,c);arrow(a,b);}
 else if(kind==='radial'||kind==='diameter'){
  if(length(sub(shape.position,references[0]))<.001)fail('A radial/diameter label position must differ from its centre.');
  const u=unit(sub(c,a),length(sub(b,a))),edge=add(a,u),far=sub(a,u);
  if(kind==='diameter'){line(far,edge,c);arrow(far,edge);arrow(edge,far);}else{line(a,edge,c);arrow(edge,a);}
 }else{
  let p,q,n;
  if(kind==='linear'){
   axis??=Math.abs(c[1]-(a[1]+b[1])/2)>=Math.abs(c[0]-(a[0]+b[0])/2)?'x':'y';
   if(Math.abs(references[1][axis==='x'?0:1]-references[0][axis==='x'?0:1])<.001)fail('Linear reference coordinates must differ on the measured axis.');
   p=axis==='x'?[a[0],c[1]]:[c[0],a[1]];q=axis==='x'?[b[0],c[1]]:[c[0],b[1]];n=axis==='x'?[0,1]:[1,0];
  }else{n=normal(unit(sub(b,a)));const ac=sub(c,a),offset=ac[0]*n[0]+ac[1]*n[1];p=add(a,mul(n,offset));q=add(b,mul(n,offset));}
  for(const [anchor,end] of [[a,p],[b,q]]){const delta=sub(end,anchor),direction=length(delta)?unit(delta):n;line(add(anchor,direction),add(end,mul(direction,2)));}
  // Match native rounding after transforming each endpoint, including at x.xx5 boundaries.
  const u=unit(sub(q,p)),middle=mul(add(p,q),.5),measured=length(sub(mul(q,scale),mul(p,scale))),label=`${Number(measured.toFixed(2))} mm`,gap=Math.min(length(sub(q,p))*.35,label.length*.9+1);
  // The application's native minimum is evaluated in annotation-local coordinates.
  if(length(sub(q,p))>.001){line(p,sub(middle,mul(u,gap)));line(add(middle,mul(u,gap)),q);arrow(p,q);arrow(q,p);}
 }
 const transform=[scale,0,0,scale,0,0],data={dimension:{kind:kind==='leader'?'leader':`dimension-${kind}`,points:[a,b,c],transform,...(axis?{axis}:{}),...(kind==='leader'?{text:shape.text}:{})}};
 return {paths:lines.map(path=>({...path,segments:path.segments.map(s=>[s[0]*scale,s[1]*scale,0,0,0,0])})),data};
}
