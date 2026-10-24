export type Point=[number,number];
/** Fixed 2^-1074 integer representation: exact host-side oracle independent of
 * production rational arithmetic, Paper/Clipper areas and containment. */
export function integer(x:number):bigint {const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,x);const b=d.getBigUint64(0),e=Number(b>>52n&2047n),m=b&((1n<<52n)-1n);return(b>>63n?-1n:1n)*(e?((1n<<52n)|m)<<BigInt(e-1):m);}
export function area2(loops:Point[][]):bigint {return loops.reduce((sum,loop)=>sum+loop.reduce((n,p,i)=>{const b=loop[(i+1)%loop.length];return n+integer(p[0])*integer(b[1])-integer(p[1])*integer(b[0]);},0n),0n);}
export function inside(loops:Point[][],p:Point,evenOdd=true):boolean {let wind=0;const [x,y]=p.map(integer);for(const loop of loops)for(let i=0;i<loop.length;i++){const[a,b]=[loop[i],loop[(i+1)%loop.length]].map(p=>p.map(integer)),cross=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);if(a[1]<=y&&b[1]>y&&cross>0n)wind++;else if(b[1]<=y&&a[1]>y&&cross<0n)wind--;}return evenOdd?wind%2!==0:wind!==0;}
export function svgLoops(text:string):Point[][] {
 const loops:Point[][]=[];
 for(const m of text.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)){
  const t=m[1].match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)??[];let i=0,command='',x=0,y=0,start:Point=[0,0],loop:Point[]=[];
  while(i<t.length){if(/^[a-zA-Z]$/.test(t[i]))command=t[i++];const op=command.toUpperCase(),rel=command!==op;if(op==='Z'){if(loop.length)loops.push(loop);loop=[];[x,y]=start;command='';continue;}if(!['M','L','H','V'].includes(op))throw new Error('Expected straight SVG output');if(op==='M'||op==='L'){x=Number(t[i++])+(rel?x:0);y=Number(t[i++])+(rel?y:0);if(op==='M'){start=[x,y];command=rel?'l':'L';}}else if(op==='H')x=Number(t[i++])+(rel?x:0);else y=Number(t[i++])+(rel?y:0);loop.push([x,y]);}
  if(loop.length)loops.push(loop);
 }return loops;
}
export function dxfEdges(text:string):{edges:[Point,Point][];loops:Point[][]}{
 const tags=text.trim().split(/\r?\n/),entities:{kind:string;tags:[number,string][]}[]=[];let item:typeof entities[number]|null=null;
 for(let i=0;i<tags.length;i+=2){const code=Number(tags[i]),v=tags[i+1];if(code===0){if(item)entities.push(item);item={kind:v,tags:[]};}else item?.tags.push([code,v]);}if(item)entities.push(item);
 const loops:Point[][]=[],edges:[Point,Point][]=[];
 for(const e of entities){if(e.kind==='LWPOLYLINE'){const loop:Point[]=[];let x=0;for(const [code,v]of e.tags){if(code===10)x=Number(v);if(code===20)loop.push([x,-Number(v)]);}if(!e.tags.some(([c,v])=>c===70&&(Number(v)&1)))throw new Error('Open Boolean DXF contour');loops.push(loop);for(let i=0;i<loop.length;i++)edges.push([loop[i],loop[(i+1)%loop.length]]);}else if(e.kind==='LINE'){const value=(n:number)=>Number(e.tags.find(([c])=>c===n)![1]);edges.push([[value(10),-value(20)],[value(11),-value(21)]]);}}
 return{edges,loops};
}
export function edgeInside(edges:[Point,Point][],p:Point):boolean {let parity=false;const [x,y]=p.map(integer);for(const [first,second]of edges){const a=first.map(integer),b=second.map(integer),c=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);if(a[1]<=y&&b[1]>y&&c>0n||b[1]<=y&&a[1]>y&&c<0n)parity=!parity;}return parity;}
