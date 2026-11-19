import Link from 'next/link';
import {notFound} from 'next/navigation';
import {studyCourse} from '@/lib/study-course-server';
import {CourseCover} from '@/components/learning/CourseCover';
import {supabaseServer} from '@/lib/supabase/server';
export const dynamic='force-dynamic';

type RealRow={id:string;title:string;kind:string|null;position:number|null;total_points:number;time_limit_minutes:number|null;assessment_attempts:{status:string;score:number;max_score:number;published:boolean}[]|{status:string;score:number;max_score:number;published:boolean}|null};

function chipFor(a:RealRow){
  const at=Array.isArray(a.assessment_attempts)?a.assessment_attempts[0]:a.assessment_attempts;
  if(!at) return {label:'Start',cls:'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'};
  if(at.status==='in_progress') return {label:'Resume',cls:'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'};
  if(at.status==='submitted') return {label:'Under review',cls:'bg-black/5 text-ink-600 dark:bg-white/10'};
  if(at.status==='graded'&&at.published){
    const pct=Math.round((at.score/Math.max(1,at.max_score))*100);
    return {label:`${pct}%`,cls:pct>=80?'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300':pct>=60?'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300':'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'};
  }
  return {label:'Graded',cls:'bg-green-50 text-green-700'};
}

export default async function Page({params}:{params:Promise<{courseId:string}>}){
  const {courseId}=await params;
  const supabase=await supabaseServer();
  const {data:course}=await supabase.from('courses').select('id,title,school').eq('id',courseId).eq('published',true).maybeSingle();
  if(!course) notFound();

  // Prefer the course's REAL graded assessments (timed, server-graded, counts
  // toward mastery). Language courses and stubs without authored exams fall back
  // to the self-study derived set below.
  const {data:real}=await supabase
    .from('assessments')
    .select('id,title,kind,position,total_points,time_limit_minutes,assessment_attempts(status,score,max_score,published)')
    .eq('course_id',courseId).eq('status','published')
    .order('position');

  if(real && real.length>0){
    const rows=real as RealRow[];
    const exams=rows.filter(a=>a.kind==='exam');
    const quizzes=rows.filter(a=>a.kind!=='exam');
    const card=(a:RealRow,accent:'exam'|'quiz')=>{
      const chip=chipFor(a);
      const rail=accent==='exam'?'border-l-violet-400/70':'border-l-sky-400/70';
      return <Link key={a.id} href={`/assessments/${a.id}`} className={`card flex items-center justify-between gap-3 border-l-4 transition hover:-translate-y-0.5 hover:shadow-md ${rail}`}>
        <div className="flex min-w-0 items-center gap-3"><span aria-hidden className="text-xl">{accent==='exam'?'📝':'✅'}</span>
          <div className="min-w-0"><p className="truncate font-medium">{a.title}</p>
            <p className="text-xs text-ink-500">{a.total_points} pts · {a.time_limit_minutes?`${a.time_limit_minutes} min`:'untimed'}</p></div></div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${chip.cls}`}>{chip.label}</span>
      </Link>;
    };
    return <div className="space-y-6">
      <Link href="/assessments" className="text-sm text-brand-600">← Exams and quizzes</Link>
      <div className="overflow-hidden rounded-3xl border border-black/10 bg-white dark:bg-white/5">
        <CourseCover title={course.title} school={course.school} className="h-48"/>
        <div className="p-6"><p className="text-xs font-bold uppercase tracking-widest text-brand-600">Graded exams &amp; quizzes</p>
          <h1 className="mt-2 text-2xl font-bold">{course.title}</h1>
          <p className="mt-3 text-sm leading-6 text-ink-500">{exams.length} exams · {quizzes.length} quizzes · auto-graded the moment you submit, and they count toward your mastery and progress.</p></div>
      </div>
      {exams.length>0 && <section><h2 className="mb-3 text-xl font-bold">Exams</h2><div className="grid gap-3 sm:grid-cols-2">{exams.map(a=>card(a,'exam'))}</div></section>}
      {quizzes.length>0 && <section><h2 className="mb-3 text-xl font-bold">Quizzes</h2><div className="grid gap-3 sm:grid-cols-2">{quizzes.map(a=>card(a,'quiz'))}</div></section>}
      <Link href={`/learn/${courseId}`} className="btn-ghost">Return to course lessons</Link>
    </div>;
  }

  // Fallback: self-study derived assessments (no authored graded exams yet).
  const data=await studyCourse(courseId);if(!data)notFound();
  const {course:c,bank,exams,quizzes}=data;
  return <div className="space-y-6"><Link href="/assessments" className="text-sm text-brand-600">← Exams and quizzes</Link>
  <div className="overflow-hidden rounded-3xl border border-black/10 bg-white dark:bg-white/5"><CourseCover title={c.title} school={c.school} className="h-48"/><div className="p-6"><p className="text-xs font-bold uppercase tracking-widest text-brand-600">Course practice assessments</p><h1 className="mt-2 text-2xl font-bold">{c.title}</h1><p className="mt-3 text-sm leading-6 text-ink-500">{exams.filter(a=>a.ready).length} of 4 exams available · {quizzes.filter(a=>a.ready).length} of 12 quizzes available · {bank.length} distinct authored questions.</p><p className="mt-2 text-sm text-ink-500">Untimed self-study. Multiple-choice answers are checked; written responses use model explanations for self-review. These do not award course credit or replace teacher-assigned exams. Questions can recur across quizzes and exams for retrieval practice.</p></div></div>
  {[['Exams',exams],['Short quizzes',quizzes]].map(([label,list])=><section key={label as string}><h2 className="mb-3 text-xl font-bold">{label as string}</h2><div className="grid gap-3 sm:grid-cols-2">{(list as typeof exams).map(a=><div key={a.key} className="card flex flex-col"><h3 className="font-semibold">{a.title}</h3><p className="mt-2 line-clamp-3 text-sm text-ink-500">{a.description}</p><p className="mt-3 text-xs text-ink-500">{a.questions.length} questions · {new Set(a.questions.map(q=>q.lessonId)).size} source lessons</p>{a.ready?<Link href={`/assessments/course/${courseId}/${a.key}`} className="btn-primary mt-4 text-center">Start {a.key.startsWith('exam')?'exam':'quiz'}</Link>:<p className="mt-4 text-sm text-amber-700">Needs more course questions before release</p>}</div>)}</div></section>)}
  <Link href={`/learn/${courseId}`} className="btn-ghost">Return to course lessons</Link></div>;
}
