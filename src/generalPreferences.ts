import {canvasPresets} from './canvasSize';
import type {CanvasUnit} from './canvasSize';
export interface GeneralSettings {canvasPreset:string;units:CanvasUnit;decimals:number|'auto';startup:'restore'|'new';backupInterval:number}
export const GENERAL_KEY='vectora.general';
export const BACKUP_INTERVALS=[250,1000,5000,15000,30000,60000];
const defaults:GeneralSettings={canvasPreset:'infinite',units:'mm',decimals:'auto',startup:'restore',backupInterval:250};
function validate(value:unknown):GeneralSettings {
 const data=value&&typeof value==='object'?value as Partial<GeneralSettings>:{};
 return {canvasPreset:canvasPresets.some(p=>p.id===data.canvasPreset&&p.id!=='custom')?data.canvasPreset!:defaults.canvasPreset,units:['mm','cm','in'].includes(data.units??'')?data.units!:defaults.units,decimals:typeof data.decimals==='number'&&Number.isInteger(data.decimals)&&data.decimals>=0&&data.decimals<=6?data.decimals:defaults.decimals,startup:data.startup==='new'?'new':'restore',backupInterval:BACKUP_INTERVALS.includes(data.backupInterval!)?data.backupInterval!:defaults.backupInterval};
}
function read():GeneralSettings {try{return validate(JSON.parse(localStorage.getItem(GENERAL_KEY)??'null'));}catch{return {...defaults};}}
export const generalPreferences={value:read(),set(patch:Partial<GeneralSettings>):boolean {
 this.value=validate({...this.value,...patch});let saved=true;
 try{localStorage.setItem(GENERAL_KEY,JSON.stringify(this.value));}catch{saved=false;}
 window.dispatchEvent(new Event('vectora-general-change'));return saved;
}};
export const UNIT_NAMES={mm:'millimetres',cm:'centimetres',in:'inches'};
export const generalMarkup=`<div class="prefs-content-heading"><h3>General</h3></div>
<label class="prefs-setting general-setting"><span class="prefs-setting-copy"><span class="prefs-setting-title">Default canvas</span><span class="prefs-setting-help" id="pref-general-canvas-help">Preset for new documents.</span></span><select class="number-input" aria-label="Default canvas" data-general="canvasPreset" aria-describedby="pref-general-canvas-help"><option value="infinite">Infinite canvas</option>${['machine','sticker'].map(group=>`<optgroup label="${group==='machine'?'Machine beds':'Sticker sheets'}">${canvasPresets.filter(p=>p.group===group).map(p=>`<option value="${p.id}">${p.label} · ${p.detail}</option>`).join('')}</optgroup>`).join('')}</select></label>
<fieldset class="prefs-setting general-setting"><legend class="prefs-setting-title">Measurement display</legend><div class="general-fields"><label>Units<select class="number-input" aria-label="Measurement units" data-general="units" aria-describedby="pref-general-units-help"><option value="mm">Millimetres (mm)</option><option value="cm">Centimetres (cm)</option><option value="in">Inches (in)</option></select><span class="prefs-setting-help" id="pref-general-units-help">Units for displayed measurements.</span></label><label>Decimal places<select class="number-input" aria-label="Decimal places" data-general="decimals" aria-describedby="pref-general-decimals-help"><option value="auto">Automatic</option>${Array.from({length:7},(_,i)=>`<option value="${i}">${i}</option>`).join('')}</select><span class="prefs-setting-help" id="pref-general-decimals-help">Precision of displayed values.</span></label></div></fieldset>
<label class="prefs-setting general-setting"><span class="prefs-setting-copy"><span class="prefs-setting-title">Startup</span><span class="prefs-setting-help" id="pref-general-startup-help">Choose what opens at launch.</span></span><select class="number-input" aria-label="On startup" data-general="startup" aria-describedby="pref-general-startup-help"><option value="restore">Restore previous tabs</option><option value="new">Show New document</option></select></label>
<div class="prefs-setting general-setting"><label class="prefs-setting-title" for="pref-backup-interval">Recovery</label><label>Backup interval<select id="pref-backup-interval" class="number-input" aria-label="Backup interval" data-general="backupInterval" aria-describedby="pref-general-backup-help">${BACKUP_INTERVALS.map(n=>`<option value="${n}">${n===250?'Immediately (250 ms)':n<60000?`${n/1000} seconds`:'1 minute'}</option>`).join('')}</select></label><p class="prefs-setting-help" id="pref-general-backup-help">How often browser recovery updates.</p><p class="prefs-setting-help" data-recovery-usage aria-live="polite">Browser recovery: checking storage…</p></div>`;
export function initializeGeneralPreferences(host:HTMLElement,usage:()=>number|null=()=>null):void {
 host.innerHTML=generalMarkup;
 let estimate:StorageEstimate|undefined;
 const size=(bytes:number)=>bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':bytes<1024**3?(bytes/1024**2).toFixed(2)+' MB':(bytes/1024**3).toFixed(2)+' GB';
 const controls=[...host.querySelectorAll<HTMLSelectElement>('[data-general]')];
 const render=()=>{for(const input of controls)input.value=String(generalPreferences.value[input.dataset.general as keyof GeneralSettings]);const bytes=usage();host.querySelector('[data-recovery-usage]')!.textContent=bytes===null?'Browser recovery: no editor backup in this reference.':`Recovery copy: ${size(bytes)}. ${estimate?.usage!==undefined&&estimate?.quota!==undefined?`Estimated site storage: ${size(estimate.usage)} used of ${size(estimate.quota)} quota.`:'Browser storage estimate unavailable.'}`;};
 for(const input of controls)input.onchange=()=>{const key=input.dataset.general as keyof GeneralSettings;const saved=generalPreferences.set({[key]:['decimals','backupInterval'].includes(key)&&input.value!=='auto'?Number(input.value):input.value});if(!saved){const status=host.closest('.preferences-shell')?.querySelector('#preferences-status');if(status)status.textContent='Applied for this session. Browser storage is unavailable.';}};
 const storage=async()=>{try{estimate=await navigator.storage?.estimate();}catch{/* Disabled storage leaves the backup size available. */}render();};
 const dialog=host.closest('dialog');if(dialog)new MutationObserver(()=>{if(dialog.open)void storage();}).observe(dialog,{attributes:true,attributeFilter:['open']});
 window.addEventListener('vectora-general-change',render);window.addEventListener('vectora-recovery-change',render);render();
}
