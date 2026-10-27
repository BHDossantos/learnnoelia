import { Fragment } from "react";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOnboardedUser } from "@/lib/auth";
import { EnrollButton } from "@/components/EnrollButton";
import { postDiscussion, deleteDiscussion } from "@/app/learn/[courseId]/discussion-actions";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = {
  vocab: "🧠",
  grammar: "📝",
  listening: "👂",
  reading: "📖",
  speaking: "🎙️",
  roleplay: "🎭",
  writing: "✍️",
};

// "3h 24m" style duration; zero minutes renders as an em dash.
function formatMinutes(mins: number): string {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Course dashboard: hero row + stat row + tabbed overview panels, with the
// curriculum rendered as a table so the learner can scan the whole path.
export default async function CoursePage(props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const user = await requireOnboardedUser();
  const supabase = await supabaseServer();
  const [{ data: course }, { data: lessons }, { data: enrollment }, { data: progress }, { data: posts }] =
    await Promise.all([
      supabase.from("courses").select("*").eq("id", params.courseId).single(),
      supabase
        .from("lessons")
        .select("id,position,title,kind,estimated_minutes")
        .eq("course_id", params.courseId)
        .order("position"),
      supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", user.id)
        .eq("course_id", params.courseId)
        .maybeSingle(),
      supabase
        .from("lesson_progress")
        .select("lesson_id,score,completed_at")
        .eq("user_id", user.id)
        .not("completed_at", "is", null),
      supabase
        .from("discussions")
        .select("id,user_id,parent_id,body,created_at,author:profiles(display_name)")
        .eq("course_id", params.courseId)
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

  if (!course) return <p>Course not found.</p>;
  const enrolled = !!enrollment;

  // Standards alignment (Curriculum Engine). Separate + null-safe so a
  // database without the graph tables just renders no chips.
  let alignedChips: string[] = [];
  try {
    const { data: aligned } = await supabase
      .from("course_standards")
      .select("descriptor:standard_descriptors(code, standard:standards(framework))")
      .eq("course_id", params.courseId)
      .limit(4);
    alignedChips = (aligned ?? [])
      .map((r: any) => {
        const fw = r.descriptor?.standard?.framework?.split(" ")[0] ?? "";
        const code = r.descriptor?.code ?? "";
        return fw && code ? `${fw} · ${code}` : code;
      })
      .filter(Boolean);
  } catch {
    // graph tables not migrated yet — no chips
  }

  const doneIds = new Set((progress ?? []).map((p) => p.lesson_id));
  const scoreById = new Map((progress ?? []).map((p) => [p.lesson_id, p.score as number | null]));
  const list = lessons ?? [];

  // Evidence-based mastery from the mastery engine (skill_states), when the
  // tables are migrated. Falls back to the score-derived label otherwise.
  const skillStatusById = new Map<string, string>();
  try {
    const ids = list.map((l) => l.id);
    if (ids.length) {
      const { data: states } = await supabase
        .from("skill_states")
        .select("skill_id,status")
        .eq("user_id", user.id)
        .eq("skill_kind", "lesson")
        .in("skill_id", ids);
      for (const s of states ?? []) skillStatusById.set(s.skill_id as string, s.status as string);
    }
  } catch {
    // mastery tables not migrated yet — silently fall back.
  }
  const doneCount = list.filter((l) => doneIds.has(l.id)).length;
  const pct = list.length ? Math.round((doneCount / list.length) * 100) : 0;
  // The "next" lesson is the first incomplete one.
  const nextId = list.find((l) => !doneIds.has(l.id))?.id ?? null;

  // Prerequisites (recommendation, not a hard lock): which are finished?
  const prereqIds: string[] = (course as any).prerequisite_ids ?? [];
  let prereqs: { id: string; title: string; done: boolean }[] = [];
  const prereqLessonsByCourse = new Map<string, string[]>();
  if (prereqIds.length > 0) {
    const [{ data: pcs }, { data: plessons }] = await Promise.all([
      supabase.from("courses").select("id,title").in("id", prereqIds),
      supabase.from("lessons").select("id,course_id").in("course_id", prereqIds),
    ]);
    for (const l of plessons ?? []) {
      const arr = prereqLessonsByCourse.get(l.course_id) ?? [];
      arr.push(l.id);
      prereqLessonsByCourse.set(l.course_id, arr);
    }
    prereqs = (pcs ?? []).map((c) => {
      const ids = prereqLessonsByCourse.get(c.id) ?? [];
      return { id: c.id, title: c.title, done: ids.length > 0 && ids.every((id) => doneIds.has(id)) };
    });
  }
  const missingPrereqs = prereqs.filter((p) => !p.done);

  const nextLesson = list.find((l) => l.id === nextId) ?? null;
  // Time spent: total estimated minutes of the lessons the learner has finished.
  const minutesSpent = list
    .filter((l) => doneIds.has(l.id))
    .reduce((s, l) => s + (l.estimated_minutes ?? 8), 0);

  // Score curve data: this course's completed lessons in completion order.
  const courseLessonIds = new Set(list.map((l) => l.id));
  const curvePoints = (progress ?? [])
    .filter((p) => courseLessonIds.has(p.lesson_id) && p.completed_at)
    .sort(
      (a, b) =>
        new Date(a.completed_at as string).getTime() - new Date(b.completed_at as string).getTime(),
    )
    .map((p) => (typeof p.score === "number" ? p.score : 70));

  // Module grouping: every quiz lesson is a checkpoint that ENDS a module.
  // A diagnostic quiz sitting at the very start of the course forms its own
  // "Diagnostic" module; remaining segments are numbered Module 1, 2, …
  type LessonRow = (typeof list)[number];
  const modules: { label: string; num: number; lessons: LessonRow[] }[] = [];
  {
    let current: LessonRow[] = [];
    let moduleNum = 0;
    for (const l of list) {
      current.push(l);
      if (l.kind === "quiz") {
        const isDiagnostic = modules.length === 0 && current.length === 1;
        modules.push({
          label: isDiagnostic ? "Diagnostic" : `Module ${++moduleNum}`,
          num: isDiagnostic ? 0 : moduleNum,
          lessons: current,
        });
        current = [];
      }
    }
    if (current.length > 0) {
      modules.push({ label: `Module ${++moduleNum}`, num: moduleNum, lessons: current });
    }
  }
  // The last quiz in the whole path is the final checkpoint.
  const finalQuizId = [...list].reverse().find((l) => l.kind === "quiz")?.id ?? null;

  // Evidence-based mastery labels (skill_states) with a score-derived fallback.
  const STATE_LABEL: Record<string, { label: string; cls: string }> = {
    mastered: { label: "Mastered", cls: "bg-green-100 text-green-700" },
    proficient: { label: "Proficient", cls: "bg-green-50 text-green-700" },
    developing: { label: "Developing", cls: "bg-amber-50 text-amber-700" },
    fragile: { label: "Fragile", cls: "bg-amber-50 text-amber-700" },
    introduced: { label: "Introduced", cls: "bg-black/5 text-ink-500" },
    decaying: { label: "Review needed", cls: "bg-red-50 text-red-700" },
    needs_remediation: { label: "Review needed", cls: "bg-red-50 text-red-700" },
  };
  const masteryOf = (id: string): { label: string; cls: string } | null => {
    const st = skillStatusById.get(id);
    if (st && STATE_LABEL[st]) return STATE_LABEL[st];
    if (!doneIds.has(id)) return null;
    const score = scoreById.get(id);
    if (score == null) return { label: "Completed", cls: "bg-brand-50 text-brand-700" };
    if (score >= 90) return { label: "Mastered", cls: "bg-green-100 text-green-700" };
    if (score >= 80) return { label: "Proficient", cls: "bg-green-50 text-green-700" };
    if (score >= 60) return { label: "Developing", cls: "bg-amber-50 text-amber-700" };
    return { label: "Review needed", cls: "bg-red-50 text-red-700" };
  };

  // Course-level mastery summary for the header (counts across all lessons).
  const masterySummary = { mastered: 0, proficient: 0, developing: 0, review: 0 };
  for (const l of list) {
    const m = masteryOf(l.id);
    if (!m) continue;
    if (m.label === "Mastered") masterySummary.mastered++;
    else if (m.label === "Proficient") masterySummary.proficient++;
    else if (m.label === "Developing" || m.label === "Fragile") masterySummary.developing++;
    else if (m.label === "Review needed") masterySummary.review++;
  }
  const masteredPct = list.length ? Math.round((masterySummary.mastered / list.length) * 100) : 0;

  // Prerequisite BACK-ROUTING (spec §6): if the learner is struggling here AND a
  // prerequisite course is itself weakly mastered, the real gap is likely earlier
  // — recommend reviewing the prerequisite instead of grinding this course.
  let backRoute: { id: string; title: string; masteredPct: number } | null = null;
  if (masterySummary.review > 0 && prereqs.length > 0) {
    try {
      const allPrereqLessonIds = prereqs.flatMap((p) => prereqLessonsByCourse.get(p.id) ?? []);
      if (allPrereqLessonIds.length) {
        const { data: pstates } = await supabase
          .from("skill_states").select("skill_id,status").eq("user_id", user.id).in("skill_id", allPrereqLessonIds);
        const masteredSet = new Set((pstates ?? []).filter((s: any) => s.status === "mastered").map((s: any) => s.skill_id));
        let weakest: { id: string; title: string; masteredPct: number } | null = null;
        for (const p of prereqs) {
          const ids = prereqLessonsByCourse.get(p.id) ?? [];
          if (!ids.length) continue;
          const pct = Math.round((ids.filter((id) => masteredSet.has(id)).length / ids.length) * 100);
          if (pct < 60 && (!weakest || pct < weakest.masteredPct)) weakest = { id: p.id, title: p.title, masteredPct: pct };
        }
        backRoute = weakest;
      }
    } catch {
      // mastery tables not migrated — skip back-routing.
    }
  }

  // Inline score curve chart (no dependencies) for the "My Progress" panel.
  const W = 300;
  const H = 130;
  const LEFT = 34;
  const RIGHT = 8;
  const TOP = 8;
  const BOTTOM = 20;
  const xAt = (i: number) =>
    curvePoints.length > 1 ? LEFT + (i * (W - LEFT - RIGHT)) / (curvePoints.length - 1) : LEFT;
  const yAt = (score: number) => TOP + (1 - Math.min(100, Math.max(0, score)) / 100) * (H - TOP - BOTTOM);
  const linePts = curvePoints.map((s, i) => `${xAt(i).toFixed(1)},${yAt(s).toFixed(1)}`).join(" ");
  const areaPts =
    curvePoints.length >= 2
      ? `${xAt(0).toFixed(1)},${H - BOTTOM} ${linePts} ${xAt(curvePoints.length - 1).toFixed(1)},${H - BOTTOM}`
      : "";

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="text-xs text-ink-500">
        <Link href="/learn" className="hover:text-brand-600">My Learning</Link>
        <span className="mx-1.5">›</span>
        <span className="text-ink-900">{course.title}</span>
      </nav>

      {/* HERO ROW: gradient tile · title/description/progress · certificate card */}
      <header className="flex items-start gap-4">
        <div className="hidden h-24 w-24 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white sm:flex">
          <span className="text-xl font-extrabold leading-none">
            {course.cefr_level ?? "101"}
          </span>
          <span className="mt-1 px-1 text-center text-[10px] font-medium leading-tight opacity-90">
            {course.title.split("—")[0].trim().split(" ").slice(0, 2).join(" ")}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold">{course.title}</h1>
            <EnrollButton courseId={course.id} enrolled={enrolled} />
          </div>
          <p className="truncate text-sm text-ink-500">{course.description}</p>
          {alignedChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Aligned to</span>
              {alignedChips.map((c) => (
                <span key={c} className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-ink-700">
                  {c}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3" data-testid="course-progress">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="shrink-0 text-xs font-semibold text-brand-600">{pct}% Complete</p>
            {pct > 0 && pct < 100 && (
              <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                On Track
              </span>
            )}
            {pct === 100 && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                🎓 Complete
              </span>
            )}
          </div>
        </div>
        {/* Certificate card (desktop): promoted out of the rail per the dashboard mock */}
        <div className="card hidden w-56 shrink-0 lg:block">
          <p className="text-sm font-semibold">🎓 Certificate</p>
          <p className="mt-0.5 truncate text-xs text-ink-500">{course.title}</p>
          {pct === 100 ? (
            <Link
              href={`/certificates/${course.id}`}
              className="mt-1.5 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              View certificate ›
            </Link>
          ) : (
            <a
              href="#curriculum"
              className="mt-1.5 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              View requirements ›
            </a>
          )}
        </div>
      </header>

      {/* STAT ROW: four tiles + Continue Learning */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-black/[0.03] p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-500">Level</p>
            <p className="text-sm font-semibold">{course.cefr_level ?? "Foundations"}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-500">Lessons</p>
            <p className="text-sm font-semibold">{doneCount} of {list.length}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-500">Time spent</p>
            <p className="text-sm font-semibold">{formatMinutes(minutesSpent)}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-ink-500">Next lesson</p>
            <p className="truncate text-sm font-semibold">{nextLesson?.title ?? "All done!"}</p>
          </div>
        </div>
        {nextLesson && (
          <Link
            href={`/learn/${course.id}/${nextLesson.id}`}
            className="btn-primary shrink-0 text-center sm:ml-auto"
          >
            Continue Learning
          </Link>
        )}
        {!nextLesson && pct === 100 && (
          <Link
            href={`/certificates/${course.id}`}
            className="btn-primary shrink-0 text-center sm:ml-auto"
          >
            🎓 View your certificate
          </Link>
        )}
      </div>

      {/* Tabs (per the product design) */}
      <div className="flex gap-5 overflow-x-auto border-b border-black/5 text-sm">
        <span className="border-b-2 border-brand-500 pb-2 font-semibold text-brand-700">Overview</span>
        <a href="#curriculum" className="pb-2 text-ink-500 hover:text-ink-900">Curriculum</a>
        <Link href="/practice" className="pb-2 text-ink-500 hover:text-ink-900">Practice</Link>
        <Link href="/profile" className="pb-2 text-ink-500 hover:text-ink-900">Progress</Link>
        <Link href="/notes" className="pb-2 text-ink-500 hover:text-ink-900">Notes</Link>
        <Link href="/coach" className="pb-2 text-ink-500 hover:text-ink-900">Tutor</Link>
      </div>

      {backRoute && (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="font-semibold">💡 The gap might be earlier</p>
          <p className="mt-1">
            You&apos;re hitting friction here, and you&apos;ve mastered only{" "}
            <span className="font-semibold">{backRoute.masteredPct}%</span> of{" "}
            <span className="font-semibold">{backRoute.title}</span> — a prerequisite. Shoring
            that up first is usually faster than grinding this course.
          </p>
          <Link href={`/learn/${backRoute.id}`} className="mt-2 inline-block font-semibold underline">
            Review {backRoute.title} →
          </Link>
        </div>
      )}

      {missingPrereqs.length > 0 && doneCount === 0 && (
        <div className="card border-amber-200 bg-amber-50 text-sm text-amber-800">
          <p className="font-medium">Recommended before this course:</p>
          <ul className="mt-1 space-y-0.5">
            {missingPrereqs.map((p) => (
              <li key={p.id}>
                <Link href={`/learn/${p.id}`} className="underline">→ {p.title}</Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            You can still start here — or take the diagnostic in lesson 1 to check you&apos;re ready.
          </p>
        </div>
      )}

      {/* OVERVIEW: Up Next · My Progress curve · Skills Mastery */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Up next (compact) */}
        {nextLesson ? (
          <Link
            href={`/learn/${course.id}/${nextLesson.id}`}
            className="card flex items-center gap-3 border-brand-500/30 hover:shadow-md"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xl">
              {KIND_ICON[nextLesson.kind] ?? "📘"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Up next</p>
              <p className="truncate font-semibold">{nextLesson.title}</p>
              <p className="text-xs text-ink-500">⏱ {nextLesson.estimated_minutes ?? 10} min</p>
            </div>
            <span className="btn-primary px-4 py-1.5 text-xs">Continue</span>
          </Link>
        ) : (
          <div className="card flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xl">🎓</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Up next</p>
              <p className="font-semibold">All lessons complete</p>
              <p className="text-xs text-ink-500">Keep it fresh in Review.</p>
            </div>
          </div>
        )}

        {/* My Progress: score curve over completed lessons */}
        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">My Progress</p>
          {curvePoints.length >= 2 ? (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full"
              role="img"
              aria-label={`Score curve across ${curvePoints.length} completed lessons`}
            >
              <defs>
                <linearGradient id="progress-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b6cf6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3b6cf6" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line
                    x1={LEFT}
                    y1={yAt(v)}
                    x2={W - RIGHT}
                    y2={yAt(v)}
                    stroke="rgba(0,0,0,0.06)"
                    strokeWidth="1"
                  />
                  <text x={LEFT - 5} y={yAt(v) + 3} textAnchor="end" fontSize="8" fill="#5a6178">
                    {v}%
                  </text>
                </g>
              ))}
              <polygon points={areaPts} fill="url(#progress-area)" />
              <polyline
                points={linePts}
                fill="none"
                stroke="#3b6cf6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={xAt(curvePoints.length - 1)}
                cy={yAt(curvePoints[curvePoints.length - 1])}
                r="3"
                fill="#3b6cf6"
              />
              <text x={W - RIGHT} y={H - 6} textAnchor="end" fontSize="8" fill="#5a6178">
                Today
              </text>
            </svg>
          ) : (
            <p className="py-6 text-center text-sm text-ink-500">
              Complete lessons to see your curve
            </p>
          )}
        </div>

        {/* Skills Mastery (top 5) */}
        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Skills Mastery</p>
          {/* Evidence-based breakdown across the whole course */}
          <div className="mb-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold">{masteredPct}% mastered</span>
              <span className="text-ink-500">{list.length} skills</span>
            </div>
            <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              {masterySummary.mastered > 0 && (
                <div className="h-full bg-green-500" style={{ width: `${(masterySummary.mastered / list.length) * 100}%` }} />
              )}
              {masterySummary.proficient > 0 && (
                <div className="h-full bg-green-300" style={{ width: `${(masterySummary.proficient / list.length) * 100}%` }} />
              )}
              {masterySummary.developing > 0 && (
                <div className="h-full bg-amber-400" style={{ width: `${(masterySummary.developing / list.length) * 100}%` }} />
              )}
              {masterySummary.review > 0 && (
                <div className="h-full bg-red-400" style={{ width: `${(masterySummary.review / list.length) * 100}%` }} />
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-500">
              <span>🟢 {masterySummary.mastered} mastered</span>
              <span>🟩 {masterySummary.proficient} proficient</span>
              <span>🟡 {masterySummary.developing} developing</span>
              {masterySummary.review > 0 && <span>🔴 {masterySummary.review} to review</span>}
            </div>
          </div>
          <ul className="space-y-1.5">
            {list.slice(0, 5).map((l) => {
              const m = masteryOf(l.id);
              return (
                <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{l.title}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m ? m.cls : "bg-black/5 text-ink-500"}`}>
                    {m?.label ?? "Not started"}
                  </span>
                </li>
              );
            })}
          </ul>
          <a
            href="#curriculum"
            className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            View all skills ›
          </a>
        </div>
      </div>

      {/* Course description + resources */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
            Course Description
          </p>
          <p className="text-sm text-ink-700">{course.description}</p>
        </div>
        <div className="card">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">Resources</p>
          <ul className="space-y-1 text-sm">
            <li>
              <a href="#curriculum" className="text-brand-600 hover:text-brand-700">
                📘 Course guide (in-app)
              </a>
            </li>
            <li>
              <a href="#curriculum" className="text-brand-600 hover:text-brand-700">
                🧠 Vocabulary list (in-app)
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-6">
      <div id="curriculum">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-500">Curriculum</h2>
      {/* Table header */}
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_4.5rem_3.5rem]">
        <span>Nr</span>
        <span>Topic</span>
        <span className="hidden sm:block">Type</span>
        <span className="hidden sm:block">Time</span>
        <span className="text-right">Status</span>
      </div>
      {/* Curriculum table, grouped by module */}
      <ol className="relative space-y-0" data-testid="learning-path">
        {modules.map((mod, mi) => {
          const modDone = mod.lessons.filter((l) => doneIds.has(l.id)).length;
          return (
            <Fragment key={mod.label}>
              {/* Module header row */}
              <li className={`pb-2 ${mi > 0 ? "pt-3" : ""}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  {mod.label === "Diagnostic"
                    ? "Diagnostic"
                    : `${mod.label} — ${modDone} of ${mod.lessons.length} done`}
                </p>
              </li>
              {mod.lessons.map((l, j) => {
                const done = doneIds.has(l.id);
                const isNext = l.id === nextId;
                // Content is freely browsable — every lesson is openable. Checkpoint
                // quizzes still require a passing score to count, but nothing is hidden.
                const locked = false;
                const score = scoreById.get(l.id);
                const isQuiz = l.kind === "quiz";
                const inner = (
                  <>
                    <span className="text-xs font-semibold text-ink-500">
                      {mod.num}.{j + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{l.title}</span>
                      <span className="block text-[11px] capitalize text-ink-500 sm:hidden">
                        {l.kind} · ~{l.estimated_minutes ?? 10} min
                      </span>
                      {done && typeof score === "number" && (
                        <span className="block text-[11px] text-ink-500">
                          Scored {Math.round(score)}
                        </span>
                      )}
                      {locked && (
                        <span className="block text-[11px] text-ink-500">Finish the lesson before this one</span>
                      )}
                    </span>
                    <span className="hidden text-xs capitalize text-ink-500 sm:block">
                      {KIND_ICON[l.kind] ?? (isQuiz ? "★" : "📘")} {l.kind}
                    </span>
                    <span className="hidden text-xs text-ink-500 sm:block">
                      ~{l.estimated_minutes ?? 10} min
                    </span>
                    <span className="text-right text-sm" aria-hidden>
                      {done ? "✅" : isNext ? "▶" : "○"}
                      {isQuiz ? (l.id === finalQuizId ? " 🏆" : " ⭐") : ""}
                    </span>
                  </>
                );
                const gridCls = "card grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 py-2.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_4.5rem_3.5rem]";
                return (
                  <li key={l.id} className="pb-1.5">
                    {locked ? (
                      <div
                        className={`${gridCls} cursor-not-allowed opacity-50`}
                        aria-disabled="true"
                        title="Finish the lesson you're on first"
                      >
                        {inner}
                      </div>
                    ) : (
                      <Link
                        href={`/learn/${course.id}/${l.id}`}
                        className={`${gridCls} ${isNext ? "border-brand-500/40 shadow-md" : done ? "opacity-90" : ""}`}
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </Fragment>
          );
        })}
        {/* Terminal node: the course certificate at the end of the path */}
        {list.length > 0 && (
          <li className="pt-3">
            {pct === 100 ? (
              <Link
                href={`/certificates/${course.id}`}
                className="card flex items-center gap-3 border-brand-500/40 bg-brand-50"
              >
                <span className="text-2xl">🎓</span>
                <div className="flex-1">
                  <div className="font-medium">🎓 Certificate</div>
                  <div className="text-xs text-ink-500">Course complete — view your certificate</div>
                </div>
                <span className="text-ink-500">›</span>
              </Link>
            ) : (
              <div className="card flex items-center gap-3 opacity-60">
                <span className="text-2xl grayscale">🎓</span>
                <div className="flex-1">
                  <div className="font-medium text-ink-500">🎓 Certificate</div>
                  <div className="text-xs text-ink-500">Complete all lessons</div>
                </div>
              </div>
            )}
          </li>
        )}
      </ol>
      </div>

      {/* Desktop right rail: skill-dimension progress + full skills mastery */}
      <aside className="hidden space-y-4 lg:block">
        {/* Skill dimensions: progress per skill type, not one flat percent */}
        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">My progress</p>
          <ul className="space-y-2">
            {Object.entries(
              list.reduce<Record<string, { done: number; total: number; scoreSum: number; scored: number }>>((acc, l) => {
                const k = l.kind === "quiz" ? "checkpoints" : l.kind;
                acc[k] ??= { done: 0, total: 0, scoreSum: 0, scored: 0 };
                acc[k].total++;
                if (doneIds.has(l.id)) {
                  acc[k].done++;
                  const s = scoreById.get(l.id);
                  if (typeof s === "number") { acc[k].scoreSum += s; acc[k].scored++; }
                }
                return acc;
              }, {}),
            ).map(([kind, v]) => {
              const pctK = v.scored > 0
                ? Math.round((v.scoreSum / v.scored) * (v.done / v.total))
                : Math.round((v.done / v.total) * 100);
              return (
                <li key={kind}>
                  <div className="mb-0.5 flex justify-between text-[11px]">
                    <span className="capitalize">{kind}</span>
                    <span className="text-ink-500">{pctK}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pctK}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Skills mastery</p>
          <ul className="space-y-1.5">
            {list.map((l) => {
              const m = masteryOf(l.id);
              return (
                <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{l.title}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m ? m.cls : "bg-black/5 text-ink-500"}`}>
                    {m?.label ?? "Not started"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
      </div>

      {/* Discussion */}
      <section className="space-y-2" data-testid="discussion">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          Discussion ({(posts ?? []).length})
        </h2>
        {(posts ?? []).filter((p: any) => !p.parent_id).map((p: any) => (
          <div key={p.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">{p.author?.display_name ?? "Learner"}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{p.body}</p>
              </div>
              {p.user_id === user.id && (
                <form action={deleteDiscussion}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="courseId" value={course.id} />
                  <button type="submit" className="text-xs text-ink-500 hover:text-red-600">✕</button>
                </form>
              )}
            </div>
            {(posts ?? []).filter((r: any) => r.parent_id === p.id).map((r: any) => (
              <div key={r.id} className="ml-4 border-l-2 border-black/5 pl-3 dark:border-white/10">
                <p className="text-xs font-semibold">{r.author?.display_name ?? "Learner"}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{r.body}</p>
              </div>
            ))}
            <form action={postDiscussion} className="flex gap-2">
              <input type="hidden" name="courseId" value={course.id} />
              <input type="hidden" name="parentId" value={p.id} />
              <input
                name="body"
                required
                minLength={2}
                placeholder="Reply…"
                className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm dark:bg-white/5"
              />
              <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">Reply</button>
            </form>
          </div>
        ))}
        <form action={postDiscussion} className="card flex gap-2">
          <input type="hidden" name="courseId" value={course.id} />
          <input
            name="body"
            required
            minLength={2}
            placeholder="Ask a question or start a discussion…"
            data-testid="discussion-input"
            className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:bg-white/5"
          />
          <button type="submit" className="btn-primary text-sm">Post</button>
        </form>
      </section>

      {list.length > 0 && doneCount === list.length && (
        <div className="card border-green-300 bg-green-50 text-center dark:border-green-500/30 dark:bg-green-500/10">
          <p className="text-lg font-bold">Course complete 🎓</p>
          <p className="text-sm text-ink-500">Every lesson done — keep it fresh in Review.</p>
          <div className="mt-2 flex justify-center gap-2">
            <Link href={`/certificates/${course.id}`} className="btn-primary">View certificate</Link>
            <Link href="/review" className="btn-ghost">Review now</Link>
          </div>
        </div>
      )}
    </div>
  );
}
