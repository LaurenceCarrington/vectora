#!/usr/bin/env node
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {buildDesign} from './build.mjs';
import {lintDocument} from './lint.mjs';
import {LIMITS} from './geometry.mjs';
const HELP=`Offline Vectora design toolkit (Node 18+, no packages required)

  node vectora.mjs build recipe.json --out design.vectora [--force] [--strict] [--json]
  node vectora.mjs lint design.vectora [more.vectora ...] [--strict] [--json]

build validates before writing; existing output requires --force.
lint is read-only. --strict makes advisory warnings fail the command.
Exit codes: 0 = passed, 1 = design/JSON failure, 2 = usage or filesystem failure.
`;
async function read(path){const size=(await stat(path)).size;if(size>LIMITS.bytes){const e=new Error('Document exceeds 50 MiB.');e.design=true;throw e;}const text=await readFile(path,'utf8');if(Buffer.byteLength(text)>LIMITS.bytes){const e=new Error('Document exceeds 50 MiB.');e.design=true;throw e;}try{return JSON.parse(text);}catch{const e=new Error('Invalid JSON.');e.design=true;throw e;}}
function print(reports,json){
 if(json){console.log(JSON.stringify({files:reports},null,2));return;}
 for(const r of reports){
  console.log(`${r.file}: ${r.ok?'PASS':'FAIL'} · ${r.summary?.objects??0} objects · ${r.errors??0} errors · ${r.warnings??0} warnings`);
  for(const i of r.issues)console.log(`  ${i.severity.toUpperCase()} ${i.code} ${i.path}: ${i.message}`);
  if(r.summary?.bounds)console.log(`  Bounds (mm): ${JSON.stringify(r.summary.bounds)}`);
  if(r.truncated)console.log('  Diagnostics truncated at 1000 entries; fix the reported issues and run again.');
 }
}
async function main(){
 const args=process.argv.slice(2),command=args.shift();
 if(!command||command==='--help'||command==='help'){console.log(HELP);return;}
 const paths=[];let out,json=false,strict=false,force=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--json')json=true;
  else if(args[i]==='--strict')strict=true;
  else if(args[i]==='--force')force=true;
  else if(args[i]==='--out'){out=args[++i];if(!out||out.startsWith('--'))throw new Error('--out requires a file path.');}
  else if(args[i].startsWith('--'))throw new Error(`Unknown option: ${args[i]}`);
  else paths.push(args[i]);
 }
 if(!['lint','build'].includes(command)||!paths.length||command==='build'&&(paths.length!==1||!out)||command==='lint'&&(out||force))throw new Error(HELP);
 if(command==='build'&&(extname(out).toLowerCase()!=='.vectora'||resolve(out)===resolve(paths[0])))throw new Error('Choose a separate output file ending in .vectora.');
 const reports=[];let exit=0;
 for(const path of paths){
  try {
   let file=await read(path);
   if(command==='build'){try{file=buildDesign(file);}catch(e){e.design=true;throw e;}}
   const report=lintDocument(file);report.file=command==='build'?out:path;
   report.ok=report.ok&&(!strict||report.warnings===0);
   const contents=command==='build'?JSON.stringify(file,null,2)+'\n':null;
   if(contents&&Buffer.byteLength(contents)>LIMITS.bytes){report.ok=false;report.errors++;report.issues.push({severity:'error',code:'FILE_SIZE',path:'$',message:'Generated document exceeds 50 MiB.'});}
   if(!report.ok){reports.push(report);exit=Math.max(exit,1);continue;}
   if(command==='build')await writeFile(out,contents,{flag:force?'w':'wx'});
   reports.push(report);
  }catch(e){const design=!!e.design;exit=Math.max(exit,design?1:2);reports.push({file:path,ok:false,errors:1,warnings:0,truncated:false,issues:[{severity:'error',code:design?'INPUT':'IO',path:'$',message:e.code==='EEXIST'?'Output already exists; choose a new name or explicitly pass --force.':e.message}]});}
 }
 print(reports,json);process.exitCode=exit;
}
main().catch(error=>{console.error(error.message);process.exitCode=2;});
