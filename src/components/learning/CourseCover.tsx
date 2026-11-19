import Image from 'next/image';
import {courseArt} from '@/lib/course-art';
export function CourseCover({title,school,className='h-44'}:{title:string;school?:string;className?:string}){
 const art=courseArt(title,school);
 return <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
  <Image src="/course-art/course-atlas.webp" alt={art.alt} width={1536} height={1024} sizes="(max-width: 768px) 1600px, 1400px" className="absolute top-1/2 h-auto w-[400%] max-w-none" style={{left:`-${art.column*100}%`,transform:`translateY(-${(art.row+.5)*100/3}%)`}}/>
 </div>;
}
