import {test,expect} from './fixtures';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,parse,sep} from 'node:path';
import {createServer,type ViteDevServer} from 'vite';

test('Imported project paths cannot whitelist files outside the allowed Vite root',async()=>{
 // Match physical paths on macOS too: /var and /private/var aliases would
 // otherwise fail to exercise the non-Windows safeModulePaths regression.
 const scratch=await realpath(await mkdtemp(join(tmpdir(),'vectora-dependency-boundary-'))),root=join(scratch,'project'),outside=join(scratch,'outside.js');
 const relative=outside.slice(parse(outside).root.length).split(sep).join('/');let server:ViteDevServer|undefined;
 try{
  await mkdir(dirname(join(root,relative)),{recursive:true});
  await writeFile(join(root,'package.json'),'{"private":true,"type":"module"}');
  await writeFile(outside,'export default "SYNTHETIC_OUTSIDE_SENTINEL";');
  await writeFile(join(root,relative),'export default "SYNTHETIC_PROJECT_DECOY";');
  await writeFile(join(root,'main.js'),`import ${JSON.stringify('./'+relative)};`);
  server=await createServer({root,configFile:false,logLevel:'silent',server:{host:'127.0.0.1',port:0,fs:{allow:[root]}},optimizeDeps:{noDiscovery:true}});await server.listen();
  const address=server.httpServer!.address();if(!address||typeof address==='string')throw new Error('Expected a loopback TCP server.');
  const base=`http://127.0.0.1:${address.port}`,main=await fetch(base+'/main.js');expect(main.status).toBe(200);expect(await main.text()).toContain(relative);
  const decoy=await fetch(base+'/'+relative);expect(decoy.status).toBe(200);expect(await decoy.text()).toContain('SYNTHETIC_PROJECT_DECOY');
  const escaped=await fetch(base+'/@fs/'+outside.split(sep).join('/').replace(/^\/+/,''));
  const body=await escaped.text();expect(escaped.status).toBe(403);expect(body).not.toContain('SYNTHETIC_OUTSIDE_SENTINEL');
 }finally{await server?.close();await rm(scratch,{recursive:true,force:true});}
});

test('Production vector PDF export needs no optional HTML conversion and exposes no test globals',async({page})=>{
 const blocked:string[]=[],requests:string[]=[],errors:string[]=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/assets\/(?:purify\.es-|html2canvas\.esm-)/,route=>{blocked.push(route.request().url());return route.abort();});
 await page.goto('http://127.0.0.1:4173');
 expect(await page.evaluate(()=>({editor:typeof(window as any).__vectora,paper:typeof(window as any).__paper}))).toEqual({editor:'undefined',paper:'undefined'});
 expect(requests.some(url=>url.includes('/exportPDF-'))).toBe(false);
 await page.locator('#cad-canvas').focus();await page.keyboard.press('r');await page.mouse.move(250,230);await page.mouse.down();await page.mouse.move(450,360);await page.mouse.up();
 await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Export…',exact:true}).click();await page.getByRole('tab',{name:'PDF',exact:true}).click();
 const download=page.waitForEvent('download');await page.locator('#export-dialog [data-export-submit]').click();
 const file=await download,data=await readFile((await file.path())!);expect(data.toString('ascii',0,5)).toBe('%PDF-');expect(data.length).toBeGreaterThan(100);expect(data.toString('latin1')).not.toContain('/Subtype /Image');
 expect(requests.some(url=>url.includes('/exportPDF-'))).toBe(true);expect(blocked).toEqual([]);expect(errors).toEqual([]);
});
