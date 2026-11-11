import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { LANGUAGES, languageLabel, type LanguageCode } from "@/lib/languages";
import { TryIt } from "@/components/TryIt";
import { getI18n } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

/** Turn raw goal tags like "daily_life" into "daily life". */
function humanizeTag(tag: string) {
  return tag.replace(/[_-]+/g, " ").trim();
}

export default async function Home() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { t } = await getI18n();
    return <LoggedOutLanding t={t} />;
  }

  // First check onboarding — if no target language yet, push to /onboarding.
  const { data: target } = await supabase
    .from("target_languages")
    .select("language")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!target) redirect("/onboarding");

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    undefined;
  return <Dashboard userId={user.id} primaryLang={target.language} metaName={metaName} />;
}

async function Dashboard({ userId, primaryLang, metaName }: { userId: string; primaryLang: string; metaName?: string }) {
  const supabase = await supabaseServer();
  const nowIso = new Date().toISOString();
  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString();

  // 1. Due SRS reviews + unread notifications + gamification + continue-learning.
  const [
    { count: dueReviews },
    { count: unreadNotifs },
    { data: profile },
    { data: stats },
    { data: lastProgress },
  ] = await Promise.all([
    supabase
      .from("srs_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_at", nowIso),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
    supabase.from("profiles").select("display_name").eq("id", userId).single(),
    supabase.from("user_stats").select("streak_days,daily_goal_xp,xp,last_activity_date").eq("user_id", userId).maybeSingle(),
    supabase
      .from("lesson_progress")
      .select("completed_at,lesson:lessons(id,course_id,title)")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Recommended: published courses in my language I'm not enrolled in yet.
  const { data: myEnrollments } = await supabase
    .from("enrollments").select("course_id").eq("user_id", userId);
  const enrolledSet = new Set((myEnrollments ?? []).map((e) => e.course_id));
  const { data: recPool } = await supabase
    .from("courses")
    .select("id,title,cefr_level,goal_tag")
    .eq("language", primaryLang)
    .eq("published", true)
    .order("position")
    .limit(12);
  const recommended = (recPool ?? []).filter((c) => !enrolledSet.has(c.id)).slice(0, 3);

  // Continue-learning: latest course, its completion percentage, and the next
  // lesson to do — that lesson becomes today's mission.
  let resume: { courseId: string; title: string; pct: number; cefr: string | null } | null = null;
  let mission: {
    courseId: string;
    courseTitle: string;
    lessonId: string | null;
    lessonTitle: string | null;
    minutes: number;
  } | null = null;
  const lastCourseId = (lastProgress as any)?.lesson?.course_id;
  if (lastCourseId) {
    const [{ data: course }, { data: courseLessons }, { data: doneRows }] = await Promise.all([
      supabase.from("courses").select("id,title,cefr_level").eq("id", lastCourseId).single(),
      supabase
        .from("lessons")
        .select("id,title,estimated_minutes")
        .eq("course_id", lastCourseId)
        .order("position"),
      supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("user_id", userId)
        .not("completed_at", "is", null),
    ]);
    if (course && courseLessons && courseLessons.length > 0) {
      const idsInCourse = new Set(courseLessons.map((l) => l.id));
      const doneIds = new Set(
        (doneRows ?? []).filter((r) => idsInCourse.has(r.lesson_id)).map((r) => r.lesson_id),
      );
      resume = {
        courseId: course.id,
        title: course.title,
        cefr: course.cefr_level,
        pct: Math.round((doneIds.size / courseLessons.length) * 100),
      };
      const nextLesson = courseLessons.find((l) => !doneIds.has(l.id));
      if (nextLesson) {
        mission = {
          courseId: course.id,
          courseTitle: course.title,
          lessonId: nextLesson.id,
          lessonTitle: nextLesson.title,
          minutes: nextLesson.estimated_minutes ?? 10,
        };
      }
    }
  }

  // No in-progress lesson → the mission is the first lesson of a recommended course.
  if (!mission && recommended.length > 0) {
    const rec = recommended[0];
    const { data: firstLesson } = await supabase
      .from("lessons")
      .select("id,title,estimated_minutes")
      .eq("course_id", rec.id)
      .order("position")
      .limit(1)
      .maybeSingle();
    mission = {
      courseId: rec.id,
      courseTitle: rec.title,
      lessonId: firstLesson?.id ?? null,
      lessonTitle: firstLesson?.title ?? null,
      minutes: firstLesson?.estimated_minutes ?? 10,
    };
  }

  // Prefer a real name: a display_name that is just the email local-part
  // (set by early signups) loses to the identity provider's name.
  const looksLikeEmailPrefix = !!profile?.display_name && !profile.display_name.includes(" ") && /\d/.test(profile.display_name);
  const bestName =
    (!looksLikeEmailPrefix && profile?.display_name) || metaName || profile?.display_name || "there";
  const firstName = bestName.split(" ")[0];
  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const streak = stats?.streak_days ?? 0;
  const activeToday = stats?.last_activity_date === new Date().toISOString().slice(0, 10);
  const goalXp = stats?.daily_goal_xp ?? 50;

  // XP earned since UTC midnight — the daily goal is measured, not guessed.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayEvents } = await supabase
    .from("xp_events")
    .select("amount")
    .eq("user_id", userId)
    .gte("created_at", todayStart.toISOString());
  const todayXp = (todayEvents ?? []).reduce((a, e) => a + e.amount, 0);
  const goalPct = Math.min(100, Math.round((todayXp / Math.max(1, goalXp)) * 100));

  // Mastery snapshot from the mastery engine (best-effort; empty until migrated).
  let masteredSkills = 0;
  let developingSkills = 0;
  let reviewSkills = 0;
  try {
    const { data: sks } = await supabase
      .from("skill_states").select("status").eq("user_id", userId);
    for (const s of sks ?? []) {
      if (s.status === "mastered") masteredSkills++;
      else if (s.status === "proficient" || s.status === "developing" || s.status === "fragile") developingSkills++;
      else if (s.status === "needs_remediation" || s.status === "decaying") reviewSkills++;
    }
  } catch {
    // mastery tables not migrated yet — hide the card.
  }
  const hasMastery = masteredSkills + developingSkills + reviewSkills > 0;

  // 2. Classrooms I'm in → upcoming meetings + recent announcements.
  const { data: classroomLinks } = await supabase
    .from("classroom_members")
    .select("classroom_id,classroom:classrooms(id,name,org_id)")
    .eq("user_id", userId);
  const classroomIds = (classroomLinks ?? []).map((c: any) => c.classroom_id);
  const classroomById = new Map(
    (classroomLinks ?? []).map((c: any) => [c.classroom_id, c.classroom]),
  );

  const [{ data: upcoming }, { data: announcements }] = await Promise.all([
    classroomIds.length === 0
      ? Promise.resolve({ data: [] as any[] })
      : supabase
          .from("class_meetings")
          .select("id,title,scheduled_at,duration_minutes,classroom_id")
          .in("classroom_id", classroomIds)
          .gte("scheduled_at", nowIso)
          .order("scheduled_at", { ascending: true })
          .limit(3),
    classroomIds.length === 0
      ? Promise.resolve({ data: [] as any[] })
      : supabase
          .from("announcements")
          .select("id,body,pinned,created_at,classroom_id")
          .in("classroom_id", classroomIds)
          .order("created_at", { ascending: false })
          .limit(3),
  ]);

  // 3. Open assignments across enrolled courses.
  const { data: enrollments } = await supabase
    .from("enrollments").select("course_id").eq("user_id", userId);
  const enrolledIds = (enrollments ?? []).map((e) => e.course_id);

  const { data: openAssignments } = enrolledIds.length === 0
    ? { data: [] as any[] }
    : await supabase
        .from("assignments")
        .select(`
          id,title,due_at,
          course:courses(title),
          submissions!left(status,student_id)
        `)
        .in("course_id", enrolledIds)
        .eq("published", true)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(30);
  const openRows = (openAssignments ?? [])
    .map((a: any) => {
      const mine = (a.submissions ?? []).find((s: any) => s.student_id === userId);
      return { ...a, status: mine?.status as string | undefined };
    })
    .filter((a) => a.status !== "returned")
    .slice(0, 4);

  // 4. Recent grades returned to me.
  const { data: returned } = await supabase
    .from("teacher_reviews")
    .select(`
      final_score,reviewed_at,
      submission:submissions!inner(
        student_id,
        assignment:assignments(title,max_score)
      )
    `)
    .eq("submission.student_id", userId)
    .gte("reviewed_at", since14)
    .order("reviewed_at", { ascending: false })
    .limit(3);

  const langInfo = LANGUAGES[primaryLang as LanguageCode];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-sm text-ink-500">
          {langInfo
            ? `Learning ${langInfo.flag} ${langInfo.label}`
            : `Learning ${languageLabel(primaryLang)}`}
        </p>
      </header>

      {/* Today's mission */}
      {mission ? (
        <div
          className="card space-y-3 border-brand-500/20 bg-gradient-to-br from-brand-50 to-white dark:from-white/[0.08] dark:to-white/[0.02]"
          data-testid="todays-mission"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            🎯 Today's mission
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">
                {langInfo?.flag} {mission.lessonTitle ?? mission.courseTitle}
              </p>
              <p className="text-xs text-ink-500">
                {mission.lessonTitle ? <>{mission.courseTitle} · </> : null}
                <span className="font-semibold text-brand-600">+25 XP</span>
                {" · ⏱ ~"}{mission.minutes} min
              </p>
            </div>
            <Link
              href={mission.lessonId ? `/learn/${mission.courseId}/${mission.lessonId}` : `/learn/${mission.courseId}`}
              className="btn-primary px-5 py-2 text-sm"
            >
              Start now
            </Link>
          </div>
          {resume && resume.courseId === mission.courseId && (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-700"
                  style={{ width: `${resume.pct}%` }}
                />
              </div>
              <p className="text-xs text-ink-500">
                {resume.pct}% through {resume.title}
                {resume.cefr ? ` · ${resume.cefr}` : ""}
              </p>
            </>
          )}
          <p className="text-xs text-ink-500">
            You're {todayXp} / {goalXp} XP today
          </p>
        </div>
      ) : (
        <Link href="/learn" className="card block text-center" data-testid="todays-mission">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            🎯 Today's mission
          </p>
          <p className="mt-1 font-semibold">Pick your first course</p>
          <p className="text-xs text-ink-500">Ten minutes a day is all it takes.</p>
        </Link>
      )}

      {/* Today's goal + streak */}
      <section className="grid grid-cols-2 gap-2">
        <div className="card" data-testid="daily-goal">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Today's goal</p>
          <p className="mt-1 text-xl font-bold">
            {todayXp} <span className="text-sm font-medium text-ink-500">/ {goalXp} XP</span>
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-700 ${goalPct >= 100 ? "bg-green-500" : "bg-brand-500"}`}
              style={{ width: `${goalPct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {goalPct >= 100 ? "✓ goal met — great work" : `${goalPct}% there`}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Streak</p>
          <p className="mt-1 text-xl font-bold">🔥 {streak} day{streak === 1 ? "" : "s"}</p>
          <p className="text-xs text-ink-500">{activeToday ? "kept alive — nice" : "practice to keep it"}</p>
        </div>
      </section>

      {/* Mastery snapshot — evidence-based, not just "completed" */}
      {hasMastery && (
        <section className="card" data-testid="mastery-snapshot">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Skills mastery</p>
            <Link href="/profile" className="text-xs font-semibold text-brand-600 hover:text-brand-700">Details ›</Link>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-green-600">{masteredSkills}</p>
              <p className="text-[11px] text-ink-500">mastered</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600">{developingSkills}</p>
              <p className="text-[11px] text-ink-500">developing</p>
            </div>
            <div>
              <p className={"text-xl font-bold " + (reviewSkills > 0 ? "text-red-600" : "text-ink-400")}>{reviewSkills}</p>
              <p className="text-[11px] text-ink-500">to review</p>
            </div>
          </div>
          {reviewSkills > 0 && (
            <Link href="/review" className="mt-2 block text-center text-xs font-semibold text-red-600 hover:text-red-700">
              {reviewSkills} skill{reviewSkills === 1 ? "" : "s"} need review → practice now
            </Link>
          )}
        </section>
      )}

      {/* Weekly challenge */}
      <WeeklyChallenge userId={userId} />

      {/* Diagnostic entry — find your level */}
      {!hasMastery && (
        <Link href="/diagnostic" className="card card-hover flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-xl dark:bg-emerald-500/20">🎯</span>
            <div>
              <p className="font-semibold">Find your level</p>
              <p className="text-xs text-ink-500">A 5-minute check-up personalizes your path</p>
            </div>
          </div>
          <span className="text-ink-500">›</span>
        </Link>
      )}

      {/* Coach entry */}
      <Link
        href="/coach"
        className="card card-hover flex items-center justify-between"
        data-testid="coach-entry"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-xl dark:bg-violet-500/20">🎯</span>
          <div>
            <p className="font-semibold">Coach</p>
            <p className="text-xs text-ink-500">Ask anything…</p>
          </div>
        </div>
        <span className="text-ink-500">›</span>
      </Link>

      {recommended.length > 0 && (
        <section className="space-y-2" data-testid="recommended">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Recommended for you
          </h2>
          <div className="grid gap-2">
            {recommended.map((c) => (
              <Link key={c.id} href={`/learn/${c.id}`} className="card card-hover flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-ink-500">
                    {c.cefr_level ?? ""}{c.goal_tag ? ` · ${humanizeTag(c.goal_tag)}` : ""}
                  </p>
                </div>
                <span className="text-xs font-medium text-brand-600">Explore →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Link href="/review" className="card card-hover flex flex-col items-start">
          <p className="text-2xl font-bold">{dueReviews ?? 0}</p>
          <p className="text-xs text-ink-500">Reviews due</p>
        </Link>
        <Link href="/assignments" className="card card-hover flex flex-col items-start">
          <p className="text-2xl font-bold">{openRows.length}</p>
          <p className="text-xs text-ink-500">Open tasks</p>
        </Link>
        <Link href="/inbox" className="card card-hover flex flex-col items-start">
          <p className={"text-2xl font-bold " + ((unreadNotifs ?? 0) > 0 ? "text-brand-600" : "")}>
            {unreadNotifs ?? 0}
          </p>
          <p className="text-xs text-ink-500">Unread</p>
        </Link>
      </section>

      {openRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Up next
          </h2>
          <ul className="space-y-2">
            {openRows.map((a: any) => (
              <li key={a.id}>
                <Link
                  href={a.status ? `/assignments/${a.id}/result` : `/assignments/${a.id}`}
                  className="card flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-ink-500">
                      {a.course?.title}
                      {a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-ink-500">{a.status ?? "not started"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(upcoming ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Upcoming classes
          </h2>
          <ul className="space-y-2">
            {(upcoming ?? []).map((m: any) => {
              const c = classroomById.get(m.classroom_id);
              return (
                <li key={m.id}>
                  <Link
                    href={`/school/${c?.org_id}/classrooms/${m.classroom_id}/meetings/${m.id}`}
                    className="card flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{m.title ?? c?.name ?? "Class"}</p>
                      <p className="text-xs text-ink-500">
                        {new Date(m.scheduled_at).toLocaleString()} · {m.duration_minutes} min
                      </p>
                    </div>
                    <span className="text-ink-500">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(announcements ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Announcements
          </h2>
          <ul className="space-y-2">
            {(announcements ?? []).map((a: any) => {
              const c = classroomById.get(a.classroom_id);
              return (
                <li key={a.id} className="card space-y-1">
                  <p className="text-xs text-ink-500">
                    {a.pinned && <span className="mr-1 text-brand-500">📌</span>}
                    {c?.name ?? "Classroom"} · {new Date(a.created_at).toLocaleDateString()}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{a.body}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(returned ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Recently graded
          </h2>
          <ul className="space-y-2">
            {(returned ?? []).map((r: any, i: number) => (
              <li key={i} className="card flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{r.submission?.assignment?.title}</p>
                  <p className="text-xs text-ink-500">
                    {new Date(r.reviewed_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-sm font-semibold">
                  {r.final_score}/{r.submission?.assignment?.max_score ?? 100}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2">
        <Link href="/plan" className="card card-hover flex items-center gap-2">
          <span>🗺️</span><span className="text-sm font-medium">Today's plan</span>
        </Link>
        <Link href="/learn" className="card card-hover flex items-center gap-2">
          <span>📚</span><span className="text-sm font-medium">Lessons</span>
        </Link>
        <Link href="/practice" className="card card-hover flex items-center gap-2">
          <span>💬</span><span className="text-sm font-medium">System roleplay</span>
        </Link>
        <Link href="/translate" className="card card-hover flex items-center gap-2">
          <span>🌐</span><span className="text-sm font-medium">Translate</span>
        </Link>
        <Link href="/tutors" className="card card-hover flex items-center gap-2">
          <span>🧑‍🏫</span><span className="text-sm font-medium">Live tutors</span>
        </Link>
        <Link href="/projects" className="card card-hover flex items-center gap-2">
          <span>🛠️</span><span className="text-sm font-medium">Projects</span>
        </Link>
        <Link href="/portfolio" className="card card-hover flex items-center gap-2">
          <span>📂</span><span className="text-sm font-medium">Portfolio</span>
        </Link>
        <Link href="/playground" className="card card-hover flex items-center gap-2">
          <span>⌨️</span><span className="text-sm font-medium">Code lab</span>
        </Link>
        <Link href="/study" className="card card-hover flex items-center gap-2">
          <span>🃏</span><span className="text-sm font-medium">Study tools</span>
        </Link>
      </section>
    </div>
  );
}

// A curated, honest sample of courses that actually exist in the catalog —
// shown in the scrolling ticker to convey breadth across all five schools.
const MARQUEE = [
  { e: "🗣️", t: "Spanish A1" },
  { e: "🇫🇷", t: "French for Business" },
  { e: "🇩🇪", t: "German B2" },
  { e: "➗", t: "Calculus I" },
  { e: "📐", t: "Linear Algebra" },
  { e: "🧮", t: "Differential Equations" },
  { e: "🔬", t: "Organic Chemistry" },
  { e: "🧠", t: "Neuroscience" },
  { e: "💻", t: "Python Foundations" },
  { e: "🐳", t: "Docker & Containers" },
  { e: "🏗️", t: "System Design" },
  { e: "🔐", t: "Cybersecurity" },
  { e: "📊", t: "Business Analytics" },
  { e: "💰", t: "Corporate Finance" },
  { e: "⚖️", t: "Business Law & Ethics" },
  { e: "🎨", t: "UX/UI Design" },
];

// Genuine, cited provenance — these are the sources actually recorded in the
// curriculum graph (curriculum_sources). Course *structure* is adapted from
// their openly-licensed materials; we never copy their text.
const SOURCES_ADAPTED = [
  { name: "MIT OpenCourseWare", emoji: "🏛️" },
  { name: "Harvard CS50", emoji: "🎓" },
  { name: "Stanford Online", emoji: "🌲" },
  { name: "University of Cambridge", emoji: "⚛️" },
  { name: "Open Yale Courses", emoji: "📜" },
  { name: "Johns Hopkins", emoji: "🏥" },
  { name: "Carnegie Mellon", emoji: "🧩" },
  { name: "University of Michigan", emoji: "🔷" },
  { name: "Caltech", emoji: "🚀" },
  { name: "TU Delft", emoji: "⚙️" },
  { name: "University of Edinburgh", emoji: "🔭" },
  { name: "The Open University", emoji: "📡" },
];
// Open textbooks & libraries — shown as a smaller secondary row.
const SOURCES_LIBRARIES = [
  { name: "OpenStax · Rice University", emoji: "📖" },
  { name: "CK-12 Foundation", emoji: "🔬" },
  { name: "OER Commons", emoji: "🌐" },
];
const SOURCES_ALIGNED = [
  { name: "CEFR · Council of Europe", emoji: "🇪🇺" },
  { name: "Common Core", emoji: "➗" },
  { name: "Google Career Certificates", emoji: "💼" },
  { name: "CompTIA", emoji: "🔐" },
  { name: "AWS", emoji: "☁️" },
  { name: "PMI", emoji: "📋" },
];

function LoggedOutLanding({ t }: { t: Dictionary }) {
  const schoolCards = [
    { emoji: "🗣️", title: t.schools.languagesTitle, body: t.schools.languagesBody, bg: "bg-brand-100 dark:bg-brand-500/20" },
    { emoji: "➗", title: t.schools.mathTitle, body: t.schools.mathBody, bg: "bg-violet-100 dark:bg-violet-500/20" },
    { emoji: "🔬", title: t.schools.scienceTitle, body: t.schools.scienceBody, bg: "bg-emerald-100 dark:bg-emerald-500/20" },
    { emoji: "💻", title: t.schools.technologyTitle, body: t.schools.technologyBody, bg: "bg-sky-100 dark:bg-sky-500/20" },
    { emoji: "📈", title: t.schools.businessTitle, body: t.schools.businessBody, bg: "bg-amber-100 dark:bg-amber-500/20" },
    { emoji: "🏛️", title: t.schools.humanitiesTitle, body: t.schools.humanitiesBody, bg: "bg-rose-100 dark:bg-rose-500/20" },
    { emoji: "🎨", title: t.schools.artsTitle, body: t.schools.artsBody, bg: "bg-fuchsia-100 dark:bg-fuchsia-500/20" },
  ];
  return (
    <div className="space-y-16 pb-8 pt-4 sm:space-y-24 sm:pt-8">
      {/* Hero: copy left, live demo right on desktop */}
      <header className="hero-bg relative -mx-4 overflow-hidden rounded-b-[2.5rem] px-4 py-12 sm:-mx-6 sm:rounded-[2.5rem] sm:px-10 sm:py-16 lg:px-14">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <p className="animate-fade-up inline-block rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-700 backdrop-blur dark:bg-white/10 dark:text-brand-100">
              {t.hero.eyebrow}
            </p>
            <h1 className="animate-fade-up mt-5 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl [animation-delay:60ms]">
              {t.hero.titleLine1}
              <br />
              <span className="text-gradient-animate">
                {t.hero.titleLine2}
              </span>
            </h1>
            <p className="animate-fade-up mx-auto mt-5 max-w-md text-lg text-ink-500 dark:text-white/70 lg:mx-0 [animation-delay:120ms]">
              {t.hero.subtitle}
            </p>
            <div className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start [animation-delay:180ms]">
              <Link href="/sign-in" className="btn-gradient w-full px-8 py-3.5 text-lg sm:w-auto">
                {t.hero.ctaPrimary}
              </Link>
              <a href="#how" className="btn-ghost w-full px-8 py-3.5 sm:w-auto">
                {t.hero.ctaSecondary}
              </a>
            </div>
            {/* Honest trust row — no fabricated numbers, just what's true today. */}
            <div className="animate-fade-up mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-ink-500 dark:text-white/60 lg:justify-start [animation-delay:210ms]">
              <span className="inline-flex items-center gap-1.5"><span className="text-green-500">✓</span> {t.trust.free}</span>
              <span className="inline-flex items-center gap-1.5"><span className="text-green-500">✓</span> {t.trust.noCard}</span>
              <span className="inline-flex items-center gap-1.5"><span className="text-green-500">✓</span> {t.trust.anyPhone}</span>
            </div>
            <div className="animate-fade-up mt-6 flex flex-wrap items-center justify-center gap-2 lg:justify-start [animation-delay:240ms]">
              {t.hero.pills.map((label, i) => (
                <span
                  key={label}
                  className="rounded-full border border-black/5 bg-white/70 px-3 py-1 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10"
                >
                  <span aria-hidden>{["💬", "💻", "➗", "🔬", "📈", "🏛️", "🎨"][i] ?? "•"}</span> {label}
                </span>
              ))}
            </div>
          </div>

          <div className="animate-fade-up mx-auto w-full max-w-md [animation-delay:300ms]">
            <TryIt />
          </div>
        </div>
      </header>

      {/* Honest proof points */}
      <section className="mx-auto grid max-w-3xl grid-cols-3 gap-3 text-center">
        <div className="card py-5">
          <p className="text-3xl font-extrabold text-brand-600">{t.stats.courses}</p>
          <p className="mt-1 text-xs text-ink-500">{t.stats.coursesLabel}</p>
        </div>
        <div className="card py-5">
          <p className="text-3xl font-extrabold text-brand-600">{t.stats.languages}</p>
          <p className="mt-1 text-xs text-ink-500">{t.stats.languagesLabel}</p>
        </div>
        <div className="card py-5">
          <p className="text-3xl font-extrabold text-brand-600">{t.stats.schools}</p>
          <p className="mt-1 text-xs text-ink-500">{t.stats.schoolsLabel}</p>
        </div>
      </section>

      {/* Live marquee of real courses — shows breadth at a glance */}
      <section className="-mx-4 space-y-3 sm:-mx-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-ink-500">
          {t.marquee.eyebrow}
        </p>
        <div className="marquee-mask overflow-hidden">
          <div className="marquee gap-3 py-1">
            {[...MARQUEE, ...MARQUEE].map((c, i) => (
              <span
                key={i}
                className="whitespace-nowrap rounded-full border border-black/5 bg-white px-4 py-2 text-sm font-medium shadow-sm dark:border-white/10 dark:bg-white/5"
              >
                <span aria-hidden className="mr-1.5">{c.e}</span>{c.t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Academic credibility — genuine, cited sources */}
      <section className="mx-auto max-w-4xl">
        <div className="card border-brand-500/10 bg-gradient-to-b from-brand-50/60 to-white p-6 dark:from-white/[0.06] dark:to-transparent sm:p-8">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">{t.sources.title}</h2>
          <div className="mt-6">
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-ink-500">
              {t.sources.adaptedLabel}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
              {SOURCES_ADAPTED.map((s) => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white px-4 py-2 text-sm font-semibold shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <span aria-hidden>{s.emoji}</span> {s.name}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {SOURCES_LIBRARIES.map((s) => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.03] px-3 py-1.5 text-xs font-medium text-ink-500 dark:bg-white/5 dark:text-white/70"
                >
                  <span aria-hidden>{s.emoji}</span> {s.name}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-ink-500">
              {t.sources.alignedLabel}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {SOURCES_ALIGNED.map((s) => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.03] px-3 py-1.5 text-xs font-medium text-ink-500 dark:bg-white/5 dark:text-white/70"
                >
                  <span aria-hidden>{s.emoji}</span> {s.name}
                </span>
              ))}
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-xs text-ink-500">{t.sources.note}</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-5xl space-y-8">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">{t.how.title}</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          <li className="card card-hover space-y-2 p-6">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-lg font-extrabold text-brand-600 dark:bg-white/10">1</span>
            <p className="text-lg font-semibold">{t.how.step1Title}</p>
            <p className="text-sm text-ink-500">{t.how.step1Body}</p>
          </li>
          <li className="card card-hover space-y-2 p-6">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-lg font-extrabold text-brand-600 dark:bg-white/10">2</span>
            <p className="text-lg font-semibold">{t.how.step2Title}</p>
            <p className="text-sm text-ink-500">{t.how.step2Body}</p>
          </li>
          <li className="card card-hover space-y-2 p-6">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-lg font-extrabold text-brand-600 dark:bg-white/10">3</span>
            <p className="text-lg font-semibold">{t.how.step3Title}</p>
            <p className="text-sm text-ink-500">{t.how.step3Body}</p>
          </li>
        </ol>
      </section>

      {/* Five schools */}
      <section className="mx-auto max-w-5xl space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">{t.schools.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-500 dark:text-white/70">{t.schools.subtitle}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schoolCards.map((s) => (
            <div key={s.title} className="card card-hover p-6">
              <span className={`grid h-11 w-11 place-items-center rounded-xl text-2xl ${s.bg}`}>{s.emoji}</span>
              <p className="mt-3 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-ink-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-5xl space-y-8">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">{t.features.title}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="card card-hover p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-2xl dark:bg-amber-500/20">📚</span>
            <p className="mt-3 font-semibold">{t.features.selfStudy}</p>
            <p className="mt-1 text-sm text-ink-500">{t.features.selfStudyBody}</p>
          </div>
          <div className="card card-hover p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-100 text-2xl dark:bg-rose-500/20">🗣️</span>
            <p className="mt-3 font-semibold">{t.features.speak}</p>
            <p className="mt-1 text-sm text-ink-500">{t.features.speakBody}</p>
          </div>
          <div className="card card-hover p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-2xl dark:bg-violet-500/20">🎓</span>
            <p className="mt-3 font-semibold">{t.features.academic}</p>
            <p className="mt-1 text-sm text-ink-500">{t.features.academicBody}</p>
          </div>
          <div className="card card-hover p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-2xl dark:bg-emerald-500/20">🧑‍🏫</span>
            <p className="mt-3 font-semibold">{t.features.instructor}</p>
            <p className="mt-1 text-sm text-ink-500">{t.features.instructorBody}</p>
          </div>
          <div className="card card-hover p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100 text-2xl dark:bg-sky-500/20">🌐</span>
            <p className="mt-3 font-semibold">{t.features.translate}</p>
            <p className="mt-1 text-sm text-ink-500">{t.features.translateBody}</p>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-5xl space-y-8">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">{t.audience.title}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card card-hover p-6 text-center">
            <span className="text-4xl">🎧</span>
            <p className="mt-2 text-lg font-semibold">{t.audience.selfTitle}</p>
            <p className="mt-1 text-sm text-ink-500">{t.audience.selfBody}</p>
          </div>
          <div className="card card-hover p-6 text-center">
            <span className="text-4xl">🏫</span>
            <p className="mt-2 text-lg font-semibold">{t.audience.classTitle}</p>
            <p className="mt-1 text-sm text-ink-500">{t.audience.classBody}</p>
          </div>
          <div className="card card-hover p-6 text-center">
            <span className="text-4xl">👨‍👩‍👧</span>
            <p className="mt-2 text-lg font-semibold">{t.audience.familyTitle}</p>
            <p className="mt-1 text-sm text-ink-500">{t.audience.familyBody}</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="hero-bg -mx-4 rounded-t-[2.5rem] px-4 py-14 text-center sm:-mx-6 sm:rounded-[2.5rem]">
        <h2 className="text-3xl font-extrabold sm:text-4xl">{t.cta.title}</h2>
        <p className="mx-auto mt-3 max-w-sm text-ink-500 dark:text-white/70">{t.cta.subtitle}</p>
        <Link
          href="/sign-in"
          className="btn-gradient mt-7 inline-block px-12 py-3.5 text-lg"
        >
          {t.cta.button}
        </Link>
        <p className="mt-6 text-xs text-ink-500">
          {/* Pricing is web-only: the native app must not surface purchase entry
              points (App Store guideline 3.1.1). Privacy/Terms stay visible. */}
          <span className="web-only">
            <Link href="/pricing" className="underline underline-offset-2">{t.cta.pricing}</Link>
            {" · "}
          </span>
          <Link href="/legal/privacy" className="underline underline-offset-2">{t.cta.privacy}</Link>
          {" · "}
          <Link href="/legal/terms" className="underline underline-offset-2">{t.cta.terms}</Link>
        </p>
        {/* Build stamp — lets us confirm at a glance which deploy is live. */}
        <p className="mt-3 text-[10px] tracking-wide text-ink-500/60">
          build {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"}
        </p>
      </section>
    </div>
  );
}

async function WeeklyChallenge({ userId }: { userId: string }) {
  const supabase = await supabaseServer();
  const TARGET = 300;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("xp_events")
    .select("amount")
    .eq("user_id", userId)
    .gte("created_at", since);
  const earned = (data ?? []).reduce((a, e) => a + e.amount, 0);
  const pct = Math.min(100, Math.round((earned / TARGET) * 100));
  return (
    <div className="card" data-testid="weekly-challenge">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Weekly challenge
        </p>
        <span className="text-xs text-ink-500">{earned} / {TARGET} XP</span>
      </div>
      <p className="mt-1 text-sm font-medium">
        {pct >= 100 ? "🏅 Challenge complete — legend." : `Earn ${TARGET} XP this week`}
      </p>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? "bg-amber-500" : "bg-violet-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
