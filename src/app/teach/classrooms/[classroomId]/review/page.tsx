import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireOnboardedUser} from '@/lib/auth';
import {supabaseServer} from '@/lib/supabase/server';
import {allRows} from '@/lib/all-rows';
import {teacherWorklist,type ReviewAssignment,type ReviewSubmission} from '@/lib/teacher-worklist';
import {ReviewWorklist} from './ReviewWorklist';
export const dynamic='force-dynamic';
export const metadata={title:'Teacher daily review'};
export default async function Page({params}:{params:Promise<{classroomId:string}>}){
 const {classroomId}=await params;const user=await requireOnboardedUser();const db=await supabaseServer();
 const {data:allowed,error}=await db.rpc('is_classroom_teacher',{p_classroom:classroomId});if(error||!allowed)notFound();
 const {data:classroom}=await db.from('classrooms').select('id,name').eq('id',classroomId).maybeSingle();if(!classroom)notFound();
 const [roster,courses]=await Promise.all([
  allRows((from,to)=>db.from('classroom_members').select('user_id,profiles(display_name)').eq('classroom_id',classroomId).eq('role','student').order('user_id').range(from,to)),
  allRows((from,to)=>db.from('classroom_courses').select('course_id').eq('classroom_id',classroomId).order('course_id').range(from,to)),
 ]);
 const students=roster.map((r:any)=>({id:r.user_id,name:r.profiles?.display_name??'Student'}));
 const courseIds=courses.map(c=>c.course_id);const studentIds=students.map(s=>s.id);
 const assignments:ReviewAssignment[]=[];const lessons:{id:string;course_id:string}[]=[];
 for(let i=0;i<courseIds.length;i+=50){const ids=courseIds.slice(i,i+50);const [a,l]=await Promise.all([
  allRows((from,to)=>db.from('assignments').select('id,course_id,title,max_score,due_at').eq('teacher_id',user.id).eq('published',true).in('course_id',ids).order('id').range(from,to)),
  allRows((from,to)=>db.from('lessons').select('id,course_id').in('course_id',ids).order('id').range(from,to)),
 ]);assignments.push(...a);lessons.push(...l);}
 const enrollments:{user_id:string;course_id:string}[]=[];const progress:{user_id:string;lesson_id:string;completed_at:string|null}[]=[];
 for(let i=0;i<studentIds.length;i+=50){const ids=studentIds.slice(i,i+50);const [e,p]=await Promise.all([
  allRows((from,to)=>db.from('enrollments').select('user_id,course_id').in('user_id',ids).order('user_id').order('course_id').range(from,to)),
  allRows((from,to)=>db.from('lesson_progress').select('user_id,lesson_id,completed_at').in('user_id',ids).order('user_id').order('lesson_id').range(from,to)),
 ]);enrollments.push(...e);progress.push(...p);}
 const submissions:ReviewSubmission[]=[];
 for(let i=0;i<assignments.length;i+=50){const batch=await allRows((from,to)=>db.from('submissions').select('id,assignment_id,student_id,status,text,ai_grades(score,max_score,feedback_md,created_at),teacher_reviews(final_score,reviewed_at)').in('assignment_id',assignments.slice(i,i+50).map(a=>a.id)).order('id').range(from,to));submissions.push(...batch as ReviewSubmission[]);}
 const items=teacherWorklist(students,assignments,submissions,enrollments);
 const completion=students.map(student=>{const enrolled=new Set(enrollments.filter(e=>e.user_id===student.id).map(e=>e.course_id));const assigned=new Set(lessons.filter(l=>enrolled.has(l.course_id)).map(l=>l.id));return {...student,total:assigned.size,done:new Set(progress.filter(p=>p.user_id===student.id&&p.completed_at&&assigned.has(p.lesson_id)).map(p=>p.lesson_id)).size};});
 return <div className="space-y-5"><Link href="/teach" className="text-sm text-brand-600">← Teach</Link><header><p className="text-xs font-bold uppercase tracking-widest text-brand-600">Daily review</p><h1 className="mt-2 text-3xl font-bold">{classroom.name}</h1><p className="mt-3 text-sm text-ink-500">Class lesson completion and your published course assignments, assembled for review. Teacher-approved grades stay separate from AI drafts.</p></header><ReviewWorklist items={items} students={completion}/><div className="card flex flex-wrap gap-4"><Link href={`/teach/classrooms/${classroomId}/assessments`} className="text-brand-600">Classroom tests and results →</Link><Link href={`/teach/classrooms/${classroomId}/gradebook`} className="text-brand-600">Gradebook →</Link><Link href={`/teach/grade?classroomId=${classroomId}`} className="text-brand-600">Scan or upload papers →</Link></div><p className="text-xs text-ink-500">This view covers course assignments you own and students enrolled in the linked courses. Classroom test attempts and uploaded paper results remain in their dedicated review tools. Missing submissions are not zero grades; unfinished lessons are not absences.</p></div>;
}
