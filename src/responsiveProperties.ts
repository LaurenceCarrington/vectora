/** Keeps the narrow Properties tray within the visible canvas, including above a software keyboard. */
export class ResponsiveProperties {
 private readonly narrow=window.matchMedia('(max-width:700px)');
 private readonly body:HTMLElement;
 private readonly toggle:HTMLButtonElement;
 private collapsed=false;
 constructor(private panel:HTMLElement,private changed:()=>void=()=>{}){
  this.body=panel.querySelector<HTMLElement>('[data-properties-body]')!;
  this.toggle=panel.querySelector<HTMLButtonElement>('[data-properties-collapse]')!;
  this.toggle.onclick=()=>{this.collapsed=!this.collapsed;this.sync();};
  this.toggle.addEventListener('keydown',event=>event.stopPropagation());
  this.narrow.addEventListener('change',()=>this.sync());
  window.addEventListener('resize',()=>this.sync());
  window.addEventListener('scroll',()=>this.sync(),{passive:true});
  window.visualViewport?.addEventListener('resize',()=>this.sync());
  window.visualViewport?.addEventListener('scroll',()=>this.sync());
  new ResizeObserver(()=>this.sync()).observe(panel.parentElement!);
  this.sync(false);
 }
 open():void {this.collapsed=false;this.sync();}
 private sync(notify=true):void {
  const narrow=this.narrow.matches,collapsed=narrow&&this.collapsed;
  this.panel.dataset.panelLayout=narrow?'bottom':'dock';
  this.panel.dataset.panelCollapsed=String(collapsed);
  if(collapsed&&this.body.contains(document.activeElement))this.toggle.focus({preventScroll:true});
  this.body.hidden=collapsed;this.body.inert=collapsed;
  this.toggle.hidden=!narrow;
  this.toggle.setAttribute('aria-expanded',String(!collapsed));
  this.toggle.setAttribute('aria-label',collapsed?'Expand properties':'Collapse properties');
  const stage=this.panel.parentElement!,rect=stage.getBoundingClientRect(),viewport=window.visualViewport;
  const tokens=getComputedStyle(stage),footer=parseFloat(tokens.getPropertyValue('--workspace-footer-height'))||28;
  const canvasTop=stage.querySelector('.document-tabs')?.getBoundingClientRect().bottom??rect.top+72;
  const visibleBottom=Math.min(rect.bottom,viewport?viewport.offsetTop+viewport.height:innerHeight);
  const bottom=Math.max(footer,rect.bottom-visibleBottom),available=Math.max(0,rect.height-bottom-Math.max(canvasTop-rect.top,(viewport?.offsetTop??0)-rect.top));
  this.panel.style.setProperty('--properties-bottom',`${bottom}px`);
  this.panel.style.setProperty('--properties-height',`${Math.min(available,380,Math.max(144,available/2))}px`);
  if(notify)this.changed();
 }
}
