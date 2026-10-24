import {readFileSync} from 'node:fs';
import ts from 'typescript';
export async function routeCurveBaseline(page:import('@playwright/test').Page){
 for(const [route,file]of [['/__v005a_geometry.js','./fixtures/curve-v005a.fixture.ts'],['/__v005a_safety.js','./fixtures/curve-safety-v005a.fixture.ts']]){
  let source=readFileSync(new URL(file,import.meta.url),'utf8').replace("import paper from 'paper';","const paper=(window as any).__paper;");
  if(route==='/__v005a_geometry.js')source=source.replace('if(++work>maxWork)','(window as any).__curveBaselineNodes=((window as any).__curveBaselineNodes??0)+1; if(++work>maxWork)');
  source=source.replace(/from '\.\/([^']+)'/g,(_,p)=>`from '${p==='curveApproximationSafety'?'/__v005a_safety.js':'/src/'+p+'.ts'}'`);
  await page.route('**'+route,r=>r.fulfill({contentType:'text/javascript',body:ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText}));
 }
}

/** A test-only lower depth profile exercises actual budget rejection in real UI
 * consumers. No production hook/global or artificial bad geometry is added. */
export async function forceCurveDepth(page:import('@playwright/test').Page,depth=8){
 await page.route('**/src/geometryCore/flattenCertified.ts',async route=>{
  const response=await route.fetch(),body=await response.text(),needle='const MAX_CURVE_DEPTH = 32;';
  if(!body.includes(needle))throw new Error('Depth-budget test injection no longer matches the production module');
  await route.fulfill({response,body:body.replace(needle,`const MAX_CURVE_DEPTH = ${depth};`)});
 });
}
