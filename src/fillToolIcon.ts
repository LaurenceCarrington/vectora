import type {FillPaint} from './fillPaint';

let nextPaintId=0;
const NS='http://www.w3.org/2000/svg';
const element=(name:string,attributes:Record<string,string|number>):SVGElement=>{
 const node=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
 return node;
};

function paintDefinition(svg:SVGSVGElement,paint:FillPaint,id:string):string {
 const defs=element('defs',{});
 if(paint.kind==='gradient'){
  const angle=paint.angle*Math.PI/180,dx=Math.cos(angle)*7,dy=Math.sin(angle)*7;
  const gradient=paint.type==='linear'
   ?element('linearGradient',{id,x1:10-dx,y1:11-dy,x2:10+dx,y2:11+dy,gradientUnits:'userSpaceOnUse'})
   :element('radialGradient',{id,cx:10,cy:11,r:9,gradientUnits:'userSpaceOnUse'});
  for(const stop of paint.stops)gradient.append(element('stop',{offset:stop.offset,'stop-color':stop.colour,'stop-opacity':stop.opacity}));
  defs.append(gradient);
 }else if(paint.kind==='pattern'){
  const tile=Math.max(4,Math.min(10,Math.round(paint.size*1.2)));
  const pattern=element('pattern',{id,patternUnits:'userSpaceOnUse',width:tile,height:tile,patternTransform:`rotate(${paint.angle} 12 12)`});
  if(!paint.transparent)pattern.append(element('rect',{width:tile,height:tile,fill:paint.background}));
  const detail=paint.detail/100;
  if(paint.type==='stripes')pattern.append(element('rect',{width:tile,height:Math.max(1,tile*detail),fill:paint.foreground}));
  else if(paint.type==='crosshatch')pattern.append(element('path',{d:`M0 0H${tile}M0 0V${tile}`,stroke:paint.foreground,'stroke-width':Math.max(1,tile*detail),fill:'none'}));
  else if(paint.type==='dots')pattern.append(element('circle',{cx:tile/2,cy:tile/2,r:Math.max(.7,tile*detail/2),fill:paint.foreground}));
  else pattern.append(element('rect',{width:tile/2,height:tile/2,fill:paint.foreground}),element('rect',{x:tile/2,y:tile/2,width:tile/2,height:tile/2,fill:paint.foreground}));
  defs.append(pattern);
 }
 svg.append(defs);
 return paint.kind==='colour'?paint.colour:`url(#${id})`;
}

/** Shows the active Fill tool paint in both the bucket and its paint drop. */
export function renderFillToolIcon(button:HTMLButtonElement,paint:FillPaint,noFill=false):void {
 const svg=button.querySelector<SVGSVGElement>('svg');if(!svg)return;
 const key=`${noFill}:${JSON.stringify(paint)}`;if(svg.dataset.paintKey===key)return;
 svg.dataset.paintKey=key;svg.replaceChildren();
 const paintId=`fill-tool-paint-${++nextPaintId}`,paintValue=paintDefinition(svg,paint,paintId),visibleFill=noFill?'none':paintValue,opacity=noFill?1:paint.opacity;
 const drop=element('path',{d:'M20 15s-2 2.6-2 4a2 2 0 0 0 4 0c0-1.4-2-4-2-4Z',fill:visibleFill,'fill-opacity':opacity,stroke:'currentColor','stroke-width':1.6,'stroke-linejoin':'round','data-fill-drop':''});
 const pool=element('path',{d:'M3 11h14l-7 7Z',fill:visibleFill,'fill-opacity':opacity,stroke:'none','data-fill-paint':''});
 const outline=element('path',{d:'M3 11 10 4 17 11 10 18ZM3 11h14M5 9 3 7a2 2 0 0 1 3-3l2 2',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'});
 svg.append(pool,outline,drop);
 const label=paint.kind==='colour'?paint.colour:paint.kind==='gradient'?`${paint.type} gradient`:`${paint.type} pattern`;
 button.title=`Colour fill (B) · ${noFill?'No fill':`${label} · ${Math.round(paint.opacity*100)}% opacity`}`;
}
