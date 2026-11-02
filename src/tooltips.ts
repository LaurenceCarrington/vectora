interface Hint {shortcut?:string;description?:string}
const hints:Record<string,Hint>={
 'select':{shortcut:'V'},'node editing':{shortcut:'N',description:'Edit path anchors and Bézier handles.'},
 'rectangle':{shortcut:'R'},'circle':{shortcut:'C'},'ellipse':{shortcut:'E'},'polygon':{shortcut:'Y'},'star':{shortcut:'Shift+Y'},
 'line':{shortcut:'L'},'polyline':{shortcut:'P'},'freehand':{shortcut:'F'},'text':{shortcut:'T'},
 'centre arc':{shortcut:'A',description:'Drag from the centre to create a semicircle.'},
 'three-point arc':{shortcut:'Shift+A',description:'Pick the start, a point on the curve, then the end.'},
 'start–end arc':{description:'Pick both endpoints, then bend the arc.'},
 'aligned dimension':{shortcut:'D'},'colour fill':{shortcut:'B',description:'Paint an enclosed region with the chosen appearance.'},
 'snapping':{shortcut:'S',description:'Pause or resume the configured grid and object snaps.'},
 'dissect delete':{shortcut:'K',description:'Remove the section between path points or intersections.'},
 'line delete':{shortcut:'Shift+K',description:'Remove the entire clicked object.'},
 'delete tools':{description:'Choose section deletion or whole-object deletion.'},
 'explode':{description:'Separate joined shapes into independent contour paths.'},
 'join':{description:'Combine objects without connecting their contours.'},
 'close path':{description:'Connect the nearest open endpoints with straight segments.'},
 'weld':{description:'Merge the selected closed areas.'},'subtract':{description:'Remove upper shapes from the bottom shape.'},
 'intersect':{description:'Keep the area shared by the selected shapes.'},
 'offset path':{description:'Create an inward or outward contour.'},
 'fillet':{description:'Round a corner with a circular arc.'},'chamfer':{description:'Replace a corner with a straight bevel.'},
 'split path':{description:'Open a closed contour or split an open path at the active node.'},
 'pattern':{description:'Create rectangular or circular repeats of the selection.'},
 'preview':{description:'View cut parts and engraving in 3D.'},
 'convert to path':{description:'Turn editable text into separate letter contours.'},
 'raster to vector':{description:'Trace an image into editable vector paths.'},
 'undo':{shortcut:'Mod+Z'},'redo':{shortcut:'Mod+Shift+Z'},'copy':{shortcut:'Mod+C'},'paste':{shortcut:'Mod+V'},
 'new document':{shortcut:'Mod+N'},'new document tab':{shortcut:'Mod+N'},'open':{shortcut:'Mod+O'},'open file':{shortcut:'Mod+O'},
 'save':{shortcut:'Mod+S'},'save as':{shortcut:'Mod+Shift+S'},'export':{shortcut:'Mod+E'},
 'export svg':{shortcut:'Mod+E'},'export dxf':{shortcut:'Mod+Shift+E'},'help':{shortcut:'F1'},'delete selection':{shortcut:'Delete'},
};
const triggers='[data-tooltip],[title],button,a[href],[role="button"],input:not([type="hidden"],[type="file"]),select,textarea';
const normal=(value:string)=>value.trim().replace(/[.…]+$/,'').toLocaleLowerCase();
const keyPattern=/^(?:[a-z+−-]|F\d{1,2}|Esc(?:ape)?|Enter|Tab|Delete|Backspace|Space|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|(?:(?:ctrl|cmd|control|command|mod|shift|alt|⇧|⌘)[\s+/]*)+[a-z])$/i;

/** One delegated tooltip surface also covers controls created by lazy-loaded dialogs. */
export class Tooltips {
 private readonly tip=document.createElement('div');
 private readonly action=document.createElement('strong');
 private readonly shortcut=document.createElement('kbd');
 private readonly detail=document.createElement('p');
 private readonly shortcuts=new Map<string,string>();
 private readonly sources=new WeakMap<Element,string>();
 private readonly generatedNames=new WeakMap<Element,string>();
 private active:HTMLElement|null=null;
 private hovered:HTMLElement|null=null;
 private focused:HTMLElement|null=null;
 private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(){
  this.tip.id='vectora-tooltip';this.tip.className='vectora-tooltip';this.tip.setAttribute('role','tooltip');this.tip.setAttribute('popover','manual');this.tip.hidden=true;
  const header=document.createElement('div');header.className='tooltip-heading';this.action.className='tooltip-action';this.detail.className='tooltip-description';header.append(this.action,this.shortcut);this.tip.append(header,this.detail);document.body.append(this.tip);
  this.upgrade(document);
  new MutationObserver(records=>{
   let refresh=false;
   for(const record of records){
    if(record.type==='attributes'){
     if(record.attributeName==='title')this.migrate(record.target as HTMLElement);
     if(record.target===this.active)refresh=true;
    }else for(const node of record.addedNodes)if(node instanceof Element&&!this.tip.contains(node))this.upgrade(node);
   }
   if(this.active){if(!this.usable(this.active))this.hide();else if(refresh)this.render();}
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title','data-tooltip','aria-label','disabled','hidden','open']});
  document.addEventListener('pointerover',event=>{
   if(event.pointerType==='touch'||this.tip.contains(event.target as Node))return;
   if(this.withinTip(event)){this.clearTimer();return;}
   const target=this.target(event.target);if(target===this.hovered)return;
   this.hovered=target;this.hide();if(target)this.schedule(target,400);
  },true);
  document.addEventListener('pointerout',event=>{
   const next=event.relatedTarget instanceof Node?event.relatedTarget:null;
   if(this.hovered&&(!next||!this.hovered.contains(next))){this.hovered=null;if(this.withinTip(event))this.clearTimer();else if(!next||!this.tip.contains(next))this.scheduleHide();}
  },true);
  // A hoverable help region must not block clicks on the editor underneath it.
  document.addEventListener('pointermove',event=>{
   if(this.withinTip(event))this.clearTimer();
   else if(this.active&&!this.hovered&&this.focused!==this.active&&this.timer===undefined)this.scheduleHide();
  },true);
  document.addEventListener('focusin',event=>{
   const target=this.target(event.target);this.focused=target;
   if(target?.matches(':focus-visible')){this.hide();this.show(target);}
  },true);
  document.addEventListener('focusout',event=>{if(event.target===this.focused){this.focused=null;this.hide();}},true);
  document.addEventListener('pointerdown',()=>this.hide(),true);
  document.addEventListener('pointercancel',()=>this.hide(),true);
  document.addEventListener('input',()=>this.hide(),true);
  document.addEventListener('keydown',event=>{if(!['Tab','Shift','Control','Meta','Alt'].includes(event.key))this.hide();},true);
  document.addEventListener('scroll',()=>this.hide(),true);
  document.addEventListener('wheel',()=>this.hide(),{capture:true,passive:true});
  window.addEventListener('resize',()=>this.hide());window.addEventListener('blur',()=>this.hide());
 }
 register(actions:readonly {label:string;shortcut?:string}[]):void {
  for(const action of actions)if(action.shortcut)this.shortcuts.set(normal(action.label),action.shortcut);
 }
 private migrate(element:HTMLElement):void {
  const title=element.getAttribute('title');if(title===null)return;
  const previous=this.sources.get(element);
  if(title.trim()){
   if(element.matches('button,a[href],input,select,textarea,[role="button"]')&&(!this.name(element,'')||element.getAttribute('aria-label')===this.generatedNames.get(element))){
    const name=title.split(' · ')[0].replace(/\(([^()]+)\)/g,(whole,key:string)=>keyPattern.test(key)?'':whole).trim();
    element.setAttribute('aria-label',name);this.generatedNames.set(element,name);
   }
   const described=(element.getAttribute('aria-describedby')??'').split(/\s+/).filter(id=>id&&id!==this.tip.id);
   if(!described.length&&(!element.hasAttribute('aria-description')||element.getAttribute('aria-description')===previous))element.setAttribute('aria-description',title);
   this.sources.set(element,title);
   if(element.getAttribute('data-tooltip')!==title)element.setAttribute('data-tooltip',title);
  }else if(this.sources.has(element)){element.removeAttribute('data-tooltip');if(element.getAttribute('aria-description')===previous)element.removeAttribute('aria-description');this.sources.delete(element);}
  element.removeAttribute('title');
 }
 private upgrade(root:ParentNode):void {
  if(root instanceof HTMLElement&&root.hasAttribute('title'))this.migrate(root);
  for(const element of root.querySelectorAll<HTMLElement>('[title]'))this.migrate(element);
 }
 private target(node:EventTarget|null):HTMLElement|null {
  if(!(node instanceof Element)||this.tip.contains(node))return null;
  const target=node.closest<HTMLElement>(triggers)??node.closest('label')?.control;
  return target&&target.id!=='inline-text'&&target.id!=='cad-canvas'&&this.usable(target)?target:null;
 }
 private usable(target:HTMLElement):boolean {return target.isConnected&&!target.closest('[hidden],[inert]')&&!!target.getClientRects().length;}
 private name(target:HTMLElement,raw:string):string {
  if(target.dataset.tooltipAction)return target.dataset.tooltipAction;
  if(target.getAttribute('role')==='tab'&&target.classList.contains('document-tab'))return raw.split(' · ')[0];
  const label=target.getAttribute('aria-label');if(label)return label.trim();
  const labelled=(target.getAttribute('aria-labelledby')??'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent?.trim()??'').join(' ').trim();if(labelled)return labelled;
  const searchName=target.querySelector('.tool-search-label strong')?.textContent?.trim();if(searchName)return searchName;
  if(target instanceof HTMLInputElement||target instanceof HTMLSelectElement||target instanceof HTMLTextAreaElement){
   const label=target.labels?.[0];
   if(label){
    const heading=label.querySelector('strong,.prefs-setting-title,.creation-label')?.textContent?.trim();if(heading)return heading;
    const copy=label.cloneNode(true) as HTMLElement;copy.querySelectorAll('input,select,textarea,svg,kbd,.sr-only,small,.prefs-setting-help').forEach(node=>node.remove());const text=copy.textContent?.replace(/\s+/g,' ').trim();if(text)return text;
   }
  }
  const copy=target.cloneNode(true) as HTMLElement;copy.querySelectorAll('svg,kbd,.sr-only').forEach(node=>node.remove());
  const text=copy.querySelector('label,.creation-label')?.textContent??copy.textContent??'';
  return text.replace(/\s+/g,' ').trim()||raw.split(' · ')[0].replace(/\s*\([^()]+\)\s*$/,'').trim();
 }
 private info(target:HTMLElement):{action:string;shortcut:string;description:string} {
  this.migrate(target);
  const described=(target.getAttribute('aria-describedby')??'').split(/\s+/).filter(id=>id&&id!==this.tip.id).map(id=>document.getElementById(id)?.textContent?.trim()??'').filter(Boolean).join(' ');
  const searchReason=target.getAttribute('aria-disabled')==='true'?target.querySelector('.tool-search-label small')?.textContent?.trim():'';
  const label=target instanceof HTMLInputElement?target.labels?.[0]:null;
  const raw=target.getAttribute('data-tooltip')??(searchReason||described||label?.querySelector('small,.prefs-setting-help')?.textContent?.trim()||''),action=this.name(target,raw),navigation=target.getAttribute('role')==='tab',hint=navigation?{}:hints[normal(action)]??{};
  const parenthetical=[...raw.matchAll(/\(([^()]+)\)/g)].map(m=>m[1]).find(value=>keyPattern.test(value));
  const command=!navigation&&target.matches('.tool,.shape-option,.dropdown-option,.tool-search-result');
  let shortcut=target.dataset.shortcut??(command?this.shortcuts.get(normal(action))??hint.shortcut:undefined)??target.querySelector('kbd')?.textContent?.trim()??parenthetical??'';
  if(!shortcut&&target.closest('dialog')&&(/^(Close|Cancel)\b/.test(action)))shortcut='Escape';
  const mac=/Mac|iPhone|iPad/.test(navigator.platform),mod=mac?'⌘':'Ctrl+';
  shortcut=shortcut.replace(/Ctrl\/?Cmd\s*\+\s*|Ctrl\/Cmd\s*|Mod\+|⌘\s*/gi,mod).replace(/⇧\s*/g,'Shift+').replace(/\bshift\b/gi,'Shift').replace(/\besc\b/gi,'Escape').replace(/\s*\+\s*/g,'+').replace(/\b[a-z]\b/g,c=>c.toUpperCase());
  let extra=raw.replace(/\(([^()]+)\)/g,(whole,key:string)=>keyPattern.test(key)?'':whole).trim();
  if(extra.toLocaleLowerCase().startsWith(action.toLocaleLowerCase()))extra=extra.slice(action.length).replace(/^[\s·—:]+/,'');
  if(/^Close\b/.test(action)&&extra==='Close')extra='';
  if(extra===action)extra='';
  const disabled=target.matches(':disabled,[aria-disabled="true"]');
  const description=hint.description?(hint.description+(extra&&(disabled||/^(On\b|Off\b|#|No fill\b|To\b)/i.test(extra))?' '+extra:'')):extra;
  return {action,shortcut,description};
 }
 private clearTimer():void {if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;}
 private withinTip(event:PointerEvent):boolean {if(!this.active||this.tip.hidden)return false;const r=this.tip.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;}
 private schedule(target:HTMLElement,delay:number):void {this.clearTimer();this.timer=setTimeout(()=>{this.timer=undefined;this.show(target);},delay);}
 private scheduleHide():void {this.clearTimer();this.timer=setTimeout(()=>this.hide(),100);}
 private show(target:HTMLElement):void {
  if(!this.usable(target))return;
  this.active=target;this.render();
 }
 private render():void {
  const target=this.active;if(!target)return;
  const info=this.info(target);if(!info.action){this.hide();return;}
  this.action.textContent=info.action;this.shortcut.textContent=info.shortcut;this.shortcut.hidden=!info.shortcut;this.detail.textContent=info.description;this.detail.hidden=!info.description;
  const host=target.closest('dialog[open]')??document.body;
  if(this.tip.parentElement!==host){try{if(this.tip.matches(':popover-open'))this.tip.hidePopover();}catch{/* Older browsers use the fixed-position fallback. */}host.append(this.tip);}
  this.tip.hidden=false;this.tip.style.visibility='hidden';
  try{if(!this.tip.matches(':popover-open'))this.tip.showPopover();}catch{target.closest('dialog[open]')?.append(this.tip);}
  const rect=target.getBoundingClientRect(),label=target instanceof HTMLInputElement?target.labels?.[0]:null;
  const owner=(rect.width<=2||rect.height<=2)&&label?label.getBoundingClientRect():rect,box=this.tip.getBoundingClientRect(),gap=8,width=window.innerWidth,height=window.innerHeight;
  const placement=target.closest('.left-toolbar')?'right':target.closest('.right-toolbar')?'left':owner.bottom+gap+box.height<=height-gap?'bottom':'top';
  let x=placement==='right'?owner.right+gap:placement==='left'?owner.left-gap-box.width:owner.x+(owner.width-box.width)/2;
  let y=placement==='bottom'?owner.bottom+gap:placement==='top'?owner.top-gap-box.height:owner.y+(owner.height-box.height)/2;
  x=Math.max(gap,Math.min(width-gap-box.width,x));y=Math.max(gap,Math.min(height-gap-box.height,y));
  this.tip.style.left=`${x}px`;this.tip.style.top=`${y}px`;this.tip.style.visibility='visible';
  const described=new Set((target.getAttribute('aria-describedby')??'').split(/\s+/).filter(Boolean));described.add(this.tip.id);target.setAttribute('aria-describedby',[...described].join(' '));
 }
 private hide():void {
  this.clearTimer();
  if(this.active){const described=(this.active.getAttribute('aria-describedby')??'').split(/\s+/).filter(id=>id&&id!==this.tip.id);if(described.length)this.active.setAttribute('aria-describedby',described.join(' '));else this.active.removeAttribute('aria-describedby');}
  this.active=null;try{if(this.tip.matches(':popover-open'))this.tip.hidePopover();}catch{/* Fallback surface has no top-layer lifecycle. */}this.tip.hidden=true;
 }
}
let shared:Tooltips|undefined;
export function initializeTooltips():Tooltips {return shared??=new Tooltips();}
