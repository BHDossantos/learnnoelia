import Link from 'next/link';
import {notFound} from 'next/navigation';
import {studyCourse} from '@/lib/study-course-server';
import {CourseCover} from '@/components/learning/CourseCover';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{courseId:string}>}){
 const {courseId}=await params;const data=await studyCourse(courseId);if(!data)notFound();
 const {course,bank,exams,quizzes}=data;
 return <div className="space-y-6"><Link href="/assessments" className="text-sm text-brand-600">← Exams and quizzes</Link>
 <div className="overflow-hidden rounded-3xl border border-black/10 bg-white dark:bg-white/5"><CourseCover title={course.title} school={course.school} className="h-48"/><div className="p-6"><p className="text-xs font-bold uppercase tracking-widest text-brand-600">Course practice assessments</p><h1 className="mt-2 text-2xl font-bold">{course.title}</h1><p className="mt-3 text-sm leading-6 text-ink-500">{exams.filter(a=>a.ready).length} of 4 exams available · {quizzes.filter(a=>a.ready).length} of 12 quizzes available · {bank.length} distinct authored questions.</p><p className="mt-2 text-sm text-ink-500">Untimed self-study. Multiple-choice answers are checked; written responses use model explanations for self-review. These do not award course credit or replace teacher-assigned exams. Questions can recur across quizzes and exams for retrieval practice.</p></div></div>
 {[['Exams',exams],['Short quizzes',quizzes]].map(([label,list])=><section key={label as string}><h2 className="mb-3 text-xl font-bold">{label as string}</h2><div className="grid gap-3 sm:grid-cols-2">{(list as typeof exams).map(a=><div key={a.key} className="card flex flex-col"><h3 className="font-semibold">{a.title}</h3><p className="mt-2 line-clamp-3 text-sm text-ink-500">{a.description}</p><p className="mt-3 text-xs text-ink-500">{a.questions.length} questions · {new Set(a.questions.map(q=>q.lessonId)).size} source lessons</p>{a.ready?<Link href={`/assessments/course/${courseId}/${a.key}`} className="btn-primary mt-4 text-center">Start {a.key.startsWith('exam')?'exam':'quiz'}</Link>:<p className="mt-4 text-sm text-amber-700">Needs more course questions before release</p>}</div>)}</div></section>)}
 <Link href={`/learn/${courseId}`} className="btn-ghost">Return to course lessons</Link></div>;
}
