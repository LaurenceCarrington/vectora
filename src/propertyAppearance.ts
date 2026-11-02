import type paper from 'paper';
import type {Shape} from './types';
import {paintPreview,type FillPaint} from './fillPaint';

type Channel='stroke'|'fill';
interface Ink {label:string;paint?:FillPaint;key:string}
const titleCase=(value:string)=>value[0].toUpperCase()+value.slice(1);
const hex=(colour:paper.Color)=>'#'+[colour.red,colour.green,colour.blue].map(n=>Math.round(n*255).toString(16).padStart(2,'0')).join('').toUpperCase();

/** Paths and CompoundPaths paint as units; contour children do not own compound ink. */
function appearance(items:readonly Shape[],channel:Channel):Ink {
 const inks:Ink[]=[];
 for(const item of items){
   if(!item.visible)continue;
   const colour=channel==='stroke'&&item.strokeWidth===0?null:channel==='stroke'?item.strokeColor:item.fillColor;
   if(!colour){inks.push({label:channel==='stroke'?'No stroke':'No fill',key:'none'});continue;}
   const opacity=Number((item.opacity*colour.alpha).toFixed(4));
   let paint:FillPaint;
   if(channel==='fill'&&item.data.role==='artwork'&&colour.type==='gradient'&&item.data.fillPaint)paint={...item.data.fillPaint,opacity};
   else if(colour.gradient)paint={kind:'gradient',type:colour.gradient.radial?'radial':'linear',angle:0,opacity,stops:colour.gradient.stops.map(stop=>({colour:hex(stop.color),offset:stop.offset,opacity:stop.color.alpha}))};
   else paint={kind:'colour',colour:hex(colour),opacity};
   const label=paint.kind==='colour'?paint.colour:paint.kind==='gradient'?`${titleCase(paint.type)} gradient`:`${titleCase(paint.type)} pattern`;
   inks.push({label:label+(opacity<1?` · ${Math.round(opacity*100)}%`:''),paint,key:JSON.stringify(paint)});
 }
 const first=inks[0]??{label:channel==='stroke'?'No stroke':'No fill',key:'none'};
 return inks.every(ink=>ink.key===first.key)?first:{label:'Mixed',key:'mixed'};
}

export class PropertyAppearance {
 private readonly states=new Map<Channel,Ink>();
 constructor(private root:HTMLElement,open:(channel:Channel,paint?:FillPaint)=>void){
  for(const channel of ['stroke','fill'] as const){
   const button=root.querySelector<HTMLButtonElement>(`[data-property-paint="${channel}"]`)!;
   button.onclick=()=>{if(!button.disabled)open(channel,this.states.get(channel)?.paint);};
  }
 }
 render(items:readonly Shape[],editable:boolean):void {
  const available=editable&&items.some(item=>item.data.role==='artwork');
  for(const channel of ['stroke','fill'] as const){
   const state=appearance(items,channel),previous=this.states.get(channel);
   this.states.set(channel,state);
   const button=this.root.querySelector<HTMLButtonElement>(`[data-property-paint="${channel}"]`)!;
   button.disabled=!available||state.key==='none';
   button.title=state.key==='none'?`${state.label}.${channel==='fill'?' Use Colour fill to paint an enclosed area.':''}`:available?`${titleCase(channel)}: ${state.label} · Open shared Fill & appearance controls`:`${titleCase(channel)}: ${state.label} · ${items.some(item=>item.data.role==='artwork')?'Finish the current edit and unlock the selection to change colours.':'Colour is controlled by the layer.'}`;
   if(previous?.key===state.key)continue;
   button.querySelector('[data-property-value]')!.textContent=state.label;
   const swatch=button.querySelector<HTMLElement>('.property-paint-swatch')!;
   swatch.dataset.state=state.key==='none'||state.key==='mixed'?state.key:'paint';
   swatch.replaceChildren();
   if(state.paint?.kind==='colour'){
    const ink=document.createElement('span');ink.style.background=state.paint.colour;ink.style.opacity=String(state.paint.opacity);swatch.append(ink);
   }else if(state.paint)swatch.innerHTML=paintPreview(state.paint).replaceAll('paint-preview-',`${this.root.id}-${channel}-preview-`);
  }
 }
}
