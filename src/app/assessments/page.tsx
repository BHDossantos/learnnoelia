import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exams" };

type Row = {
  id: string;
  title: string;
  kind: string | null;
  position: number | null;
  total_points: number;
  time_limit_minutes: number | null;
  course_id: string | null;
  course: { title: string } | { title: string }[] | null;
  assessment_attempts: { status: string; score: number; max_score: number; published: boolean }[] | { status: string; score: number; max_score: number; published: boolean } | null;
};

export default async function StudentAssessmentsPage() {
  const user = await requireOnboardedUser();
  const supabase = await supabaseServer();

  // Every published course now has exams, so we can't list them all. Scope to the
  // courses this learner is actually studying: enrolled in, or has opened a lesson
  // in. Classroom assessments (course_id null) always show via RLS.
  const [{ data: enrolled }, { data: progressed }] = await Promise.all([
    supabase.from("enrollments").select("course_id").eq("user_id", user.id),
    supabase.from("lesson_progress").select("lesson:lessons(course_id)").eq("user_id", user.id).limit(500),
  ]);
  const activeCourseIds = Array.from(new Set([
    ...((enrolled ?? []).map((e: any) => e.course_id)),
    ...((progressed ?? []).map((p: any) => (Array.isArray(p.lesson) ? p.lesson[0]?.course_id : p.lesson?.course_id))),
  ].filter(Boolean)));

  // RLS returns published assessments in the student's classrooms AND all
  // published course-level exams; we additionally filter course ones to the
  // learner's active courses so the page stays focused.
  let query = supabase
    .from("assessments")
    .select("id,title,kind,position,total_points,time_limit_minutes,course_id,course:courses(title),assessment_attempts(status,score,max_score,published)")
    .eq("status", "published")
    .order("position", { ascending: true });
  if (activeCourseIds.length > 0) {
    query = query.or(`course_id.is.null,course_id.in.(${activeCourseIds.join(",")})`);
  } else {
    query = query.is("course_id", null);
  }
  const { data } = await query;

  const rows = (data ?? []) as Row[];

  function attemptOf(a: Row) {
    return Array.isArray(a.assessment_attempts) ? a.assessment_attempts[0] : a.assessment_attempts;
  }
  function statusChip(a: Row) {
    const at = attemptOf(a);
    if (!at) return { label: "Start", cls: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" };
    if (at.status === "in_progress") return { label: "Resume", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };
    if (at.status === "submitted") return { label: "Under review", cls: "bg-black/5 text-ink-600 dark:bg-white/10" };
    if ((at.status === "graded") && at.published) {
      const pct = Math.round((at.score / Math.max(1, at.max_score)) * 100);
      const good = pct >= 80, ok = pct >= 60;
      return { label: `${pct}%`, cls: good ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : ok ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" };
    }
    return { label: "Graded", cls: "bg-green-50 text-green-700" };
  }
  const courseTitle = (a: Row) => (Array.isArray(a.course) ? a.course[0]?.title : a.course?.title) ?? null;

  // Group by course (self-paced exams); classroom assessments (no course) go in
  // their own "Assigned by your teacher" group.
  const groups = new Map<string, { title: string; rows: Row[] }>();
  for (const a of rows) {
    const key = a.course_id ?? "__classroom__";
    const title = a.course_id ? (courseTitle(a) ?? "Course") : "Assigned by your teacher";
    if (!groups.has(key)) groups.set(key, { title, rows: [] });
    groups.get(key)!.rows.push(a);
  }
  const grouped = [...groups.values()];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Exams &amp; quizzes</h1>
        <p className="text-sm text-ink-500">Timed exams and quick quizzes. Auto-graded the moment you submit.</p>
      </header>

      {rows.length === 0 ? (
        <p className="card text-sm text-ink-500">
          No exams yet. Open a course from <Link href="/learn" className="text-brand-600">My Learning</Link> — its quizzes and exams show up here.
        </p>
      ) : (
        grouped.map((g) => {
          const quizzes = g.rows.filter((r) => r.kind !== "exam").sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          const exams = g.rows.filter((r) => r.kind === "exam").sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          return (
            <section key={g.title} className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">{g.title}</h2>

              {exams.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink-400">Exams</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {exams.map((a) => <AssessmentCard key={a.id} a={a} chip={statusChip(a)} accent="exam" />)}
                  </ul>
                </div>
              )}

              {quizzes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink-400">Quizzes</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {quizzes.map((a) => <AssessmentCard key={a.id} a={a} chip={statusChip(a)} accent="quiz" />)}
                  </ul>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function AssessmentCard({ a, chip, accent }: { a: Row; chip: { label: string; cls: string }; accent: "exam" | "quiz" }) {
  const rail = accent === "exam" ? "border-l-violet-400/70" : "border-l-sky-400/70";
  const icon = accent === "exam" ? "📝" : "✅";
  return (
    <li>
      <Link
        href={`/assessments/${a.id}`}
        className={`card flex items-center justify-between gap-3 border-l-4 transition hover:-translate-y-0.5 hover:shadow-md ${rail}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="text-xl">{icon}</span>
          <div className="min-w-0">
            <p className="truncate font-medium">{a.title}</p>
            <p className="text-xs text-ink-500">
              {a.total_points} pts · {a.time_limit_minutes ? `${a.time_limit_minutes} min` : "untimed"}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${chip.cls}`}>{chip.label}</span>
      </Link>
    </li>
  );
}
