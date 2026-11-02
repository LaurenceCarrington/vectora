/** Native coordinates are mm; handles are vectors relative to their anchor. */
export const MAX_COORDINATE=1_000_000;
export const ROLES=['artwork','cutline','engrave','construction','raster'];
export const INKS={artwork:'#383838',cutline:'#FF0000',engrave:'#0000FF',construction:'#FF00FF',raster:'#383838'};
export const LAYER_NAMES=['Artwork','Cut Path','Engrave Path','Construction Path','Raster Engrave'];
export const LIMITS={bytes:50*1024*1024,layers:1000,objects:20000,contours:50000,segments:500000};
export const FONT_IDS=['lato','pt-serif','space-mono','hershey','relief-single-line','free-mono','inter','jetbrains-mono','oswald','montserrat','bebas-neue','allerta-stencil','saira-stencil-one'];
export const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const finite=(n,limit=MAX_COORDINATE)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=limit;
export const tuple=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>finite(x));
export const identifier=v=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v);
function extrema(p0,p1,p2,p3){
 const a=-p0+3*p1-3*p2+p3,b=2*(p0-2*p1+p2),c=p1-p0;
 let roots=[];
 if(a===0){if(b!==0)roots=[-c/b];}
 else {const d=b*b-4*a*c;if(d>=0){const q=-.5*(b+(b<0?-1:1)*Math.sqrt(d));roots=q===0?[-b/(2*a)]:[q/a,c/q];}}
 const at=t=>((1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3);
 return [p0,p3,...roots.filter(t=>t>0&&t<1).map(at)];
}
export function contourBounds(contour){
 const s=contour.segments;if(!s.length)return null;
 let left=s[0][0],right=left,top=s[0][1],bottom=top;
 const include=(xs,ys)=>{left=Math.min(left,...xs);right=Math.max(right,...xs);top=Math.min(top,...ys);bottom=Math.max(bottom,...ys);};
 for(let i=0;i<s.length-(contour.closed?0:1);i++){
  const a=s[i],b=s[(i+1)%s.length];
  include(extrema(a[0],a[0]+a[4],b[0]+b[2],b[0]),extrema(a[1],a[1]+a[5],b[1]+b[3],b[1]));
 }
 return {left,top,right,bottom};
}
export function unionBounds(a,b){if(!a)return b;if(!b)return a;return {left:Math.min(a.left,b.left),top:Math.min(a.top,b.top),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom)};}
