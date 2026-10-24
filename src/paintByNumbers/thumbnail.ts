import type {Smoothing} from './types';

/** A small, premultiplied-alpha Gaussian for the bounded input thumbnail.
 * Canvas filter blur is ignored by some software Canvas2D renderers. Do this
 * after resampling so smoothing has the same visible size on every backend.
 * This never changes the source pixels used for tracing or the vector output.
 */
export function smoothThumbnail(source:ImageData,strength:Smoothing):ImageData {
 if(strength==='off')return source;
 const sigma=strength==='heavy'?.7:.3,radius=Math.ceil(3*sigma),kernel:number[]=[];
 let total=0;
 for(let d=-radius;d<=radius;d++){const weight=Math.exp(-d*d/(2*sigma*sigma));kernel.push(weight);total+=weight;}
 for(let i=0;i<kernel.length;i++)kernel[i]/=total;
 const {width,height,data}=source,intermediate=new Float32Array(data.length),result=new Uint8ClampedArray(data.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const dest=(y*width+x)*4;
  for(let d=-radius;d<=radius;d++){
   const sx=x+d;if(sx<0||sx>=width)continue;
   const index=(y*width+sx)*4,weight=kernel[d+radius],alpha=data[index+3]/255;
   for(let c=0;c<3;c++)intermediate[dest+c]+=data[index+c]*alpha*weight;
   intermediate[dest+3]+=alpha*weight;
  }
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const dest=(y*width+x)*4,channels=[0,0,0,0];
  for(let d=-radius;d<=radius;d++){
   const sy=y+d;if(sy<0||sy>=height)continue;
   const index=(sy*width+x)*4,weight=kernel[d+radius];
   for(let c=0;c<4;c++)channels[c]+=intermediate[index+c]*weight;
  }
  const alpha=channels[3];
  if(alpha>0){for(let c=0;c<3;c++)result[dest+c]=channels[c]/alpha;result[dest+3]=alpha*255;}
 }
 return new ImageData(result,width,height);
}
