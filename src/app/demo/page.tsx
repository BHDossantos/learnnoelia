import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { setupFullDemo } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guided demo" };

// A single place to demo the ENTIRE app from one account: it provisions the
// student, teacher, and parent experiences for you, then walks you through each
// with direct links into the real features (no role-switching needed).
export default async function DemoPage() {
  const user = await requireUser();
  const supabase = await supabaseServer();

  const [{ data: teach }, { data: enroll }, { data: guards }] = await Promise.all([
    supabase
      .from("classroom_members")
      .select("classroom:classrooms(id,org_id,name)")
      .eq("user_id", user.id)
      .eq("role", "teacher")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("course:courses(id,title)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("guardians")
      .select("student_id, student:profiles!guardians_student_id_fkey(display_name)")
      .eq("guardian_id", user.id)
      .limit(10),
  ]);

  const cls = (teach as any)?.classroom as { id: string; org_id: string; name: string } | undefined;
  const course = (enroll as any)?.course as { id: string; title: string } | undefined;
  const john =
    (guards ?? []).find((g: any) => (g.student?.display_name ?? "").toLowerCase().includes("john doe")) ??
    (guards ?? [])[0];
  const johnId = (john as any)?.student_id as string | undefined;

  const ready = !!cls && !!course && !!johnId;

  const Step = ({ n, title, children, href, cta }: {
    n: number; title: string; children: React.ReactNode; href?: string; cta?: string;
  }) => (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="text-sm text-ink-600">{children}</p>
        {href && (
          <Link href={href} className="mt-1 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">
            {cta ?? "Open"} →
          </Link>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Guided demo</h1>
        <p className="text-sm text-ink-500">
          Walk through the whole platform from this one account — as a student, a teacher, and a parent.
        </p>
      </header>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{ready ? "✅ Your demo is ready" : "Set up the full demo"}</p>
            <p className="text-sm text-ink-500">
              {ready
                ? "A demo class, a student enrollment, and a link to John Doe are all set. Follow the steps below."
                : "One click sets up a teacher class (with John Doe + courses), enrolls you in a course as a student, and links you to John Doe as a parent."}
            </p>
          </div>
          <form action={setupFullDemo}>
            <button type="submit" className={ready ? "btn-ghost border border-black/10 text-sm dark:border-white/10" : "btn-primary text-sm"}>
              {ready ? "↻ Re-run setup" : "✨ Set up the full demo"}
            </button>
          </form>
        </div>
      </section>

      {/* STUDENT */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">🎓 As a student</h2>
        <ol className="card space-y-4">
          <Step n={1} title="Browse the course catalog" href="/learn" cta="Open the catalog">
            252 courses across languages, math, science, technology, business, humanities, and arts.
          </Step>
          <Step
            n={2}
            title="Open a course and read the material"
            href={course ? `/learn/${course.id}` : undefined}
            cta={course ? `Open “${course.title}”` : undefined}
          >
            {course
              ? "Read the lessons, then take the quiz — you'll get a “Focus on these” review of anything you miss."
              : "Run setup above to get a course enrolled, then it opens here."}
          </Step>
          <Step n={3} title="Track mastery & earn a certificate" href="/profile" cta="See your progress">
            Finish every lesson in a course to unlock a verifiable certificate you can share.
          </Step>
        </ol>
      </section>

      {/* TEACHER */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">🧑‍🏫 As a teacher</h2>
        <ol className="card space-y-4">
          <Step
            n={1}
            title="Open your demo class"
            href={cls ? `/school/${cls.org_id}/classrooms/${cls.id}` : undefined}
            cta={cls ? "Open the class" : undefined}
          >
            {cls
              ? "Pre-loaded with catalog courses and John Doe on the roster. Add more courses from the catalog by ticking boxes."
              : "Run setup above to create your demo class."}
          </Step>
          <Step
            n={2}
            title="Open the gradebook"
            href={cls ? `/teach/classrooms/${cls.id}/gradebook` : undefined}
            cta={cls ? "Open the gradebook" : undefined}
          >
            Brightspace-style gradebook: import an assignment, grade, weight categories, and export to CSV.
          </Step>
          <Step
            n={3}
            title="Grade a paper (scan, photo, or typed)"
            href={cls ? `/teach/grade?classroomId=${cls.id}` : "/teach/grade"}
            cta="Open paper grading"
          >
            Auto-grade a student's work with feedback, focus areas, and a plan — then notify the student and parent.
          </Step>
        </ol>
      </section>

      {/* PARENT */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">👨‍👩‍👧 As a parent</h2>
        <ol className="card space-y-4">
          <Step
            n={1}
            title="Follow your child (John Doe)"
            href={johnId ? `/parent/${johnId}` : "/family"}
            cta={johnId ? "Open John Doe's progress" : "Go to Family"}
          >
            {johnId
              ? "See John Doe's enrolled courses, recent lesson scores, and overall progress — the full parent view."
              : "Run setup above (or go to Family) to follow the demo student."}
          </Step>
          <Step n={2} title="Understand the linking flow" href="/family" cta="Open Family">
            In real use, a parent enters the 6-character invite code the child shares from their own account.
          </Step>
        </ol>
      </section>

      <p className="text-center text-xs text-ink-400">
        This is a demo workspace on your own account. You can delete the demo class, courses, and links anytime.
      </p>
    </div>
  );
}
