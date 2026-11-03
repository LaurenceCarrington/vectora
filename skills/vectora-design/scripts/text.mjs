import {readFileSync} from 'node:fs';
import {LIMITS} from './geometry.mjs';

let font;
function lato(){return font??=JSON.parse(readFileSync(new URL('../assets/Lato-Regular.glyphs.json',import.meta.url),'utf8'));}

/** Convert original font commands to native relative cubic handles without flattening. */
export function fontContours(commands){
 const contours=[];let segments=[];
 const finish=()=>{
  if(segments.length>1){
   const first=segments[0],last=segments.at(-1);
   if(first[0]===last[0]&&first[1]===last[1]){first[2]=last[2];first[3]=last[3];segments.pop();}
   contours.push({closed:true,segments});
  }
  segments=[];
 };
 for(const c of commands){
  if(c.type==='M'){finish();segments.push([c.x,c.y,0,0,0,0]);}
  else if(c.type==='L')segments.push([c.x,c.y,0,0,0,0]);
  else if(c.type==='C'||c.type==='Q'){
   const previous=segments.at(-1),quadratic=c.type==='Q';
   previous[4]=(c.x1-previous[0])*(quadratic?2/3:1);previous[5]=(c.y1-previous[1])*(quadratic?2/3:1);
   segments.push([c.x,c.y,(quadratic?c.x1-c.x:c.x2-c.x)*(quadratic?2/3:1),(quadratic?c.y1-c.y:c.y2-c.y)*(quadratic?2/3:1),0,0]);
  }else if(c.type==='Z')finish();else throw new Error(`Unsupported font command: ${c.type}.`);
 }
 finish();return contours;
}

export function buildText(shape,budget=LIMITS){
 const {content}=shape,size=shape.size??3.2,align=shape.align??'left',angle=shape.angle??0;
 if(typeof content!=='string'||!content.trim()||content.length>500)throw new Error('Text needs 1–500 characters including visible glyphs.');
 if((shape.fontId??'lato')!=='lato')throw new Error('The offline text helper supports fontId: lato.');
 if(!Number.isFinite(size)||size<.1||size>1000)throw new Error('Text size must be 0.1–1000 mm.');
 if(!['left','center','right'].includes(align))throw new Error('Text align must be left, center or right.');
 if(!Number.isFinite(angle)||Math.abs(angle)>1e12)throw new Error('Text angle must be finite and within ±1e12 degrees.');
 const f=lato(),scale=size/f.unitsPerEm,lines=content.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n'),layouts=[];
 let width=0,contours=0,segments=0;
 for(let i=0;i<lines.length;i++){
  let x=0;const characters=Array.from(lines[i]);
  for(let j=0;j<characters.length;j++){
   const char=characters[j],index=f.characters[char.codePointAt(0)],glyph=f.glyphs[index];
   if(!index||!glyph)throw new Error(`Lato does not include “${char}”. Choose another character.`);
   contours+=glyph.contours.length;segments+=glyph.contours.reduce((n,c)=>n+c.segments.length,0);
   if(contours>budget.contours||segments>budget.segments)throw new Error('Text exceeds the document contour or segment budget.');
   layouts.push({glyph,char,x,y:(f.ascender+i*1.2*f.unitsPerEm)*scale});
   x+=(glyph.advance+(f.kerning[`${index},${f.characters[characters[j+1]?.codePointAt(0)]}`]??0))*scale;
  }
  width=Math.max(width,x);
 }
 if(!contours)throw new Error('Text must include visible glyphs.');
 const shift=width*(align==='center'?.5:align==='right'?1:0),r=(angle%360)*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r);
 const transform=[cos,sin,-sin||0,cos,shape.x-cos*shift,shape.y-sin*shift],paths=[],glyphContours=[],glyphLabels=[];
 for(const {glyph,char,x,y} of layouts){
  if(!glyph.contours.length)continue;
  glyphContours.push(glyph.contours.length);glyphLabels.push(char);
  for(const c of glyph.contours)paths.push({closed:true,segments:c.segments.map(s=>{
   const px=s[0]*scale+x,py=s[1]*scale+y;
   return [cos*px-sin*py+transform[4],sin*px+cos*py+transform[5],(cos*s[2]-sin*s[3])*scale,(sin*s[2]+cos*s[3])*scale,(cos*s[4]-sin*s[5])*scale,(sin*s[4]+cos*s[5])*scale];
  })});
 }
 return {paths,data:{text:{content,fontId:'lato',sizeMM:size,transform,glyphContours,glyphLabels},...(angle?{rotationDegrees:angle}:{})}};
}
