// Maintenance only: uses the repository's existing opentype.js dependency.
// Building/linting copied kits reads the prepared data using only Node's standard library.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import opentype from 'opentype.js';
import {fontContours} from './text.mjs';

const bytes=readFileSync(new URL('../../../public/fonts/Lato-Regular.ttf',import.meta.url));
const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const characters=font.tables.cmap.glyphIndexMap,glyphs={},kerning={};
const indices=[...new Set(Object.values(characters))].filter(Boolean);
for(const index of indices){
 const glyph=font.glyphs.get(index);
 glyphs[index]={advance:glyph.advanceWidth??0,contours:fontContours(glyph.getPath(0,0,font.unitsPerEm,undefined,font).commands)};
}
for(const a of indices)for(const b of indices){const n=font.getKerningValue(a,b);if(n)kerning[`${a},${b}`]=n;}
const data={format:'vectora-font-outlines',version:1,fontId:'lato',source:'public/fonts/Lato-Regular.ttf',sha256:createHash('sha256').update(bytes).digest('hex'),unitsPerEm:font.unitsPerEm,ascender:font.ascender,characters,glyphs,kerning};
const output=new URL('../assets/Lato-Regular.glyphs.json',import.meta.url),json=JSON.stringify(data)+'\n';
if(process.argv.includes('--check')){
 if(readFileSync(output,'utf8')!==json)throw new Error('Prepared Lato data is stale. Run node skills/vectora-design/scripts/prepare-font.mjs.');
 console.log('Prepared Lato data matches the bundled font.');
}else{writeFileSync(output,json);console.log(`Prepared ${indices.length} Lato glyphs (${json.length} bytes).`);}
