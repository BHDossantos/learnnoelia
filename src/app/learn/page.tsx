import { allRows } from "@/lib/all-rows";
import { TopicCatalog } from "@/components/learning/TopicCatalog";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { requireOnboardedUser, getPrimaryTargetLanguage } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Scope = "mine" | "all";
type Subject = "language" | "math" | "technology" | "business" | "science" | "humanities" | "arts";

const SCHOOLS: { id: Subject; icon: string; label: string; blurb: string }[] = [
  { id: "language", icon: "🌍", label: "Languages", blurb: "CEFR-aligned paths from first words to seminar level." },
  { id: "math", icon: "➗", label: "Mathematics", blurb: "Mastery-based progression from arithmetic to algebra." },
  { id: "science", icon: "🔬", label: "Science", blurb: "Evidence-first foundations, structured like the open textbooks." },
  { id: "technology", icon: "💻", label: "Technology", blurb: "Coding you run in the browser — Python, SQL, JavaScript, data." },
  { id: "business", icon: "💼", label: "Business", blurb: "How companies work — from first principles to strategy." },
  { id: "humanities", icon: "🏛️", label: "Humanities", blurb: "History, world cultures, philosophy, literature, Latin & more." },
  { id: "arts", icon: "🎨", label: "Arts", blurb: "Music, theater, film, visual art, architecture & dance." },
];

// Per-subject accent used on the course-card icon tile, so a learner can tell
// courses apart at a glance instead of reading each paragraph.
const SUBJECT_ACCENT: Record<Subject, string> = {
  language: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  math: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  science: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  technology: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  business: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  humanities: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  arts: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
};

export default async function LearnPage(
  props: {
    searchParams: Promise<{ lang?: string; scope?: string; school?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await requireOnboardedUser();
  const supabase = await supabaseServer();
  const primary = await getPrimaryTargetLanguage();
  const lang = (searchParams.lang ?? primary?.language ?? "es") as LanguageCode;
  const scope: Scope = searchParams.scope === "all" ? "all" : "mine";
  // Which school to show. If the URL names one, honor it. Otherwise DON'T blindly
  // default to Languages — default to the subject this student actually studies
  // most, by tallying the schools of their enrolled courses. New learners with no
  // enrollments still fall back to Languages.
  const ALL_SUBJECTS = ["language", "math", "technology", "business", "science", "humanities", "arts"] as const;
  const explicitSchool: Subject | null = (ALL_SUBJECTS as readonly string[]).includes(searchParams.school ?? "")
    ? (searchParams.school as Subject)
    : null;
  let subject: Subject;
  if (explicitSchool) {
    subject = explicitSchool;
  } else {
    const { data: myEnrollments } = await supabase
      .from("enrollments")
      .select("course:courses(school)")
      .eq("user_id", user.id);
    const counts = new Map<string, number>();
    for (const e of (myEnrollments ?? []) as any[]) {
      const sch = e.course?.school as string | undefined;
      if (sch) counts.set(sch, (counts.get(sch) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    subject = ((ALL_SUBJECTS as readonly string[]).includes(top ?? "") ? top : "language") as Subject;
  }
  const school = SCHOOLS.find((s) => s.id === subject)!;

  let query = supabase
    .from("courses")
    .select("id,title,description,cefr_level,goal_tag,language,dialect,org_id,teacher_id")
    .eq("published", true)
    .order("position");

  // The language school filters by target language; other schools filter by
  // subject only (their `language` column is just the instruction language).
  // Every tab filters by school; the language school additionally filters by
  // target language (math/tech/… are taught in English but are not English
  // courses).
  query = query.eq("school", subject);
  if (subject === "language") {
    query = query.eq("language", lang);
  }

  if (scope === "mine") {
    const [{ data: enrollments }, { data: orgs }] = await Promise.all([
      supabase.from("enrollments").select("course_id").eq("user_id", user.id),
      supabase.from("org_members").select("org_id").eq("user_id", user.id),
    ]);
    const enrolledIds = (enrollments ?? []).map((e) => e.course_id);
    const orgIds = (orgs ?? []).map((o) => o.org_id);

    // "Mine" = enrolled OR in one of my orgs OR platform content (teacher_id null).
    const clauses: string[] = ["teacher_id.is.null"];
    if (enrolledIds.length > 0) clauses.push(`id.in.(${enrolledIds.join(",")})`);
    if (orgIds.length > 0) clauses.push(`org_id.in.(${orgIds.join(",")})`);
    query = query.or(clauses.join(","));
  }

  const { data: courses } = await query;
  const ids = (courses ?? []).map(c => c.id);
  const [catalogLessons, completed] = ids.length ? await Promise.all([
    allRows((from,to) => supabase.from("lessons").select("id,course_id,kind,position,estimated_minutes").in("course_id", ids).order("position").order("id").range(from,to)),
    allRows((from,to) => supabase.from("lesson_progress").select("lesson_id").eq("user_id", user.id).not("completed_at", "is", null).order("lesson_id").range(from,to)),
  ]) : [[], []];
  const completedIds = new Set((completed ?? []).map(p => p.lesson_id));
  const topics = (courses ?? []).map(c => {
    const lessons = (catalogLessons ?? []).filter(l => l.course_id === c.id);
    const next = lessons.find((l,i) => !completedIds.has(l.id) && !(i === 0 && l.kind === "quiz")) ?? lessons.find(l => !completedIds.has(l.id));
    return { ...c, school: subject, total: lessons.length, done: lessons.filter(l => completedIds.has(l.id)).length,
      minutes: lessons.reduce((n,l) => n + Math.max(0,l.estimated_minutes ?? 0),0), nextId: next?.id ?? null };
  });


  const qs = (over: Partial<{ school: string; lang: string; scope: string }>) => {
    const p = new URLSearchParams();
    const s = over.school ?? (subject === "language" ? "" : subject);
    if (s) p.set("school", s);
    const l = over.lang ?? (subject === "language" ? lang : "");
    if (l && (over.school ?? subject) === "language") p.set("lang", l);
    const sc = over.scope ?? (scope === "all" ? "all" : "");
    if (sc === "all") p.set("scope", "all");
    const str = p.toString();
    return str ? `/learn?${str}` : "/learn";
  };

  return (
    <div className="space-y-5">
      <Link
        href="/search"
        className="card flex items-center gap-2 py-3 text-sm text-ink-500"
        data-testid="search-entry"
      >
        🔍 Search courses and lessons…
      </Link>

      {/* Schools */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SCHOOLS.map((s) => (
          <Link
            key={s.id}
            href={qs({ school: s.id === "language" ? "language" : s.id })}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
              s.id === subject
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-black/10 bg-white text-ink-700"
            }`}
          >
            <span className="mr-1">{s.icon}</span>
            {s.label}
          </Link>
        ))}
      </div>

      <header className="rounded-3xl border border-brand-500/10 bg-gradient-to-br from-brand-50 via-white to-violet-50 p-6 sm:p-8 dark:from-brand-500/10 dark:via-transparent dark:to-violet-500/10">
        <h1 className="text-2xl font-bold">
          {subject === "language"
            ? `Learn ${LANGUAGES[lang]?.label ?? lang}`
            : `School of ${school.label}`}
        </h1>
        <p className="text-sm text-ink-500">{school.blurb}</p>
      </header>

      {subject === "language" && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {Object.entries(LANGUAGES).map(([code, l]) => (
            <Link
              key={code}
              href={qs({ lang: code, school: "language" })}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                code === lang
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-black/10 bg-white text-ink-700"
              }`}
            >
              <span className="mr-1">{l.flag}</span>
              {l.label}
            </Link>
          ))}
        </div>
      )}

      <div className="flex gap-2 text-sm">
        <Link
          href={qs({ scope: "mine" })}
          className={
            "rounded-full px-3 py-1 " +
            (scope === "mine" ? "bg-brand-500 text-white" : "bg-black/5 text-ink-700")
          }
        >
          My courses
        </Link>
        <Link
          href={qs({ scope: "all" })}
          className={
            "rounded-full px-3 py-1 " +
            (scope === "all" ? "bg-brand-500 text-white" : "bg-black/5 text-ink-700")
          }
        >
          Browse all
        </Link>
      </div>

      <TopicCatalog topics={topics} icon={subject === "language" ? LANGUAGES[lang]?.flag ?? school.icon : school.icon} accent={SUBJECT_ACCENT[subject]} />
    </div>
  );
}
