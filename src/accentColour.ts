/** Browser-level chrome colours; document colours and geometry are independent. */
export const DEFAULT_ACCENT='#245BDB';
export const ACCENT_STORAGE_KEY='vectora.accent';
const valid=(value:string|null):value is string=>/^#[0-9a-f]{6}$/i.test(value??'');
const channels=(hex:string)=>hex.slice(1).match(/../g)!.map(value=>parseInt(value,16));
const luminance=(hex:string)=>channels(hex).map(value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const mix=(a:string,b:string,amount:number)=>'#'+channels(a).map((value,i)=>Math.round(value+(channels(b)[i]-value)*amount).toString(16).padStart(2,'0')).join('').toUpperCase();
function visibleAccent(accent:string,surface:string):string {
 if(!valid(surface)||contrast(accent,surface)>=3)return accent;
 const target=luminance(surface)>.179?'#000000':'#FFFFFF';
 for(let step=1;step<=20;step++){const colour=mix(accent,target,step/20);if(contrast(colour,surface)>=3)return colour;}
 return target;
}
const properties=['--chrome-accent','--chrome-selected','--control-selected-background','--control-selected-foreground','--control-selected-hover','--primary-background','--primary-foreground','--primary-hover','--menu-selected','--menu-selected-foreground','--menu-button-hover','--color-selection','--color-object-snap','--color-selection-area','--text-highlight'];
export function initializeAccentControls(onChange:()=>void):()=>void {
 const root=document.documentElement,picker=document.querySelector<HTMLInputElement>('[data-accent-colour]'),hex=document.querySelector<HTMLInputElement>('[data-accent-hex]'),reset=document.querySelector<HTMLButtonElement>('[data-accent-reset]'),error=document.querySelector<HTMLElement>('[data-accent-error]');
 let accent:string|null=null;
 try{const saved=localStorage.getItem(ACCENT_STORAGE_KEY);if(valid(saved)&&saved.toUpperCase()!==DEFAULT_ACCENT)accent=saved.toUpperCase();}catch{/* Session controls remain available without storage. */}
 const apply=()=>{
  properties.forEach(property=>root.style.removeProperty(property));
  if(!accent)return;
  const tokens=getComputedStyle(root),surface=tokens.getPropertyValue('--menu-background').trim(),canvas=tokens.getPropertyValue('--color-grid-background').trim();
  const foreground=contrast(accent,'#FFFFFF')>=contrast(accent,'#000000')?'#FFFFFF':'#000000',hover=mix(accent,foreground==='#FFFFFF'?'#000000':'#FFFFFF',.14),focus=visibleAccent(accent,surface),selection=visibleAccent(accent,canvas);
  const values:Record<string,string>={'--chrome-accent':focus,'--chrome-selected':accent+'20','--control-selected-background':accent,'--control-selected-foreground':foreground,'--control-selected-hover':hover,'--primary-background':accent,'--primary-foreground':foreground,'--primary-hover':hover,'--menu-selected':accent+'20','--menu-selected-foreground':focus,'--menu-button-hover':accent+'30','--color-selection':selection,'--color-object-snap':selection,'--color-selection-area':accent+'18','--text-highlight':accent+'26'};
  Object.entries(values).forEach(([property,value])=>root.style.setProperty(property,value));
 };
 const sync=()=>{if(picker)picker.value=accent??DEFAULT_ACCENT;if(hex){hex.value=accent??DEFAULT_ACCENT;hex.setAttribute('aria-invalid','false');}if(error)error.hidden=true;if(reset)reset.disabled=accent===null;};
 const choose=(value:string)=>{
  const next=value.toUpperCase();if(!valid(next))return;
  const previous=accent;accent=next===DEFAULT_ACCENT?null:next;sync();if(previous===accent)return;
  try{if(accent)localStorage.setItem(ACCENT_STORAGE_KEY,accent);else localStorage.removeItem(ACCENT_STORAGE_KEY);}catch{/* Keep the session preference. */}
  apply();onChange();
 };
 picker?.addEventListener('input',()=>choose(picker.value));picker?.addEventListener('change',()=>choose(picker.value));
 hex?.addEventListener('input',()=>{if(valid(hex.value))choose(hex.value);});
 const validate=()=>{if(!hex)return;const value=hex.value.trim();if(valid(value))choose(value);else{hex.setAttribute('aria-invalid','true');if(error)error.hidden=false;}};
 hex?.addEventListener('change',validate);hex?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();validate();}});
 reset?.addEventListener('click',()=>choose(DEFAULT_ACCENT));sync();return apply;
}
