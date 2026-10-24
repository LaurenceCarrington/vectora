import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const DEV='http://127.0.0.1:5174';
async function workspace(page:any){await page.goto(DEV);await page.locator('[data-canvas-preset="infinite"]').click();await page.locator('[data-setup-create]').click();await expect(page.locator('#workspace')).not.toHaveAttribute('inert','');await page.evaluate(()=>document.fonts.ready);}

test('new sessions start in Light and all saved Appearance choices are honoured',async({page})=>{
 await workspace(page);await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 for(const theme of ['dark','high-contrast','light']){
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Appearance',exact:true}).click();
  await page.locator(`[name="appearance-theme"][value="${theme}"]`).check();await page.keyboard.press('Escape');await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 }
});

test('redesigned chrome retains existing positions and theme changes preserve document geometry and history',async({page})=>{
 await workspace(page);
 const expected={'.application-header':[0,0,1440,48],'.top-toolbar':[0,48,1440,40],'.left-toolbar':[0,88,44,844],'.right-toolbar':[1396,88,44,844],'.document-tabs':[44,88,1352,32],'.workspace-footer':[0,932,1440,28]};
 await page.setViewportSize({width:1440,height:960});
 for(const [selector,rect] of Object.entries(expected)){const r=(await page.locator(selector).boundingBox())!;expect([r.x,r.y,r.width,r.height],selector).toEqual(rect);}
 const state=()=>page.evaluate(()=>{const e=(window as any).__vectora;return {snapshot:JSON.stringify(e.snapshot()),undo:e.canUndo,redo:e.canRedo};});
 await page.evaluate(()=>{const p=(window as any).__paper,e=(window as any).__vectora;e.addShape(new p.Path.Rectangle({rectangle:[20,30,80,50],insert:false}),'Panel');});
 const before=await state();
 for(const theme of ['dark','high-contrast','light']){await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Appearance',exact:true}).click();await page.locator(`[name="appearance-theme"][value="${theme}"]`).check();await page.keyboard.press('Escape');expect(await state()).toEqual(before);}
 await page.getByRole('button',{name:'Layers',exact:true}).click();const dock=(await page.locator('#primary-layers-panel').boundingBox())!;expect([dock.x,dock.y,dock.width,dock.height]).toEqual([1096,88,300,844]);
});

test('shared reference styles and renewed icons remain synchronized with the application',async({page})=>{
 const reference=readFileSync('reference/design-system.html','utf8');
 expect(reference.match(/<style>\s*([\s\S]*?)<\/style>/)![1].trim()).toBe(readFileSync('src/design-system.css','utf8').trim());
 await workspace(page);const icons=()=>page.locator('symbol[data-vectora-icon]').evaluateAll(els=>els.map(el=>({id:el.id,svg:el.innerHTML})));const editor=await icons();expect(editor.length).toBeGreaterThanOrEqual(50);
 await page.goto(DEV+'/reference/design-system.html');expect(await icons()).toEqual(editor);
});
