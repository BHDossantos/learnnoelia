import { supabaseServer } from "@/lib/supabase/server";
import { LessonPlayer } from "@/components/LessonPlayer";
import { requireOnboardedUser } from "@/lib/auth";
import { assignVariant } from "@/lib/experiments";

export const dynamic = "force-dynamic";

export default async function LessonPage(
  props: {
    params: Promise<{ courseId: string; lessonId: string }>;
  }
) {
  const params = await props.params;
  const user = await requireOnboardedUser();
  const supabase = await supabaseServer();
  const [{ data: lesson }, { data: course }, { data: lessons }, { data: progress }, { data: stats }] =
    await Promise.all([
      supabase.from("lessons").select("*").eq("id", params.lessonId).single(),
      supabase
        .from("courses")
        .select("title,language,dialect")
        .eq("id", params.courseId)
        .single(),
      supabase
        .from("lessons")
        .select("id,position,title,kind")
        .eq("course_id", params.courseId)
        .order("position"),
      supabase
        .from("lesson_progress")
        .select("lesson_id,completed_at")
        .eq("user_id", user.id)
        .not("completed_at", "is", null),
      supabase
        .from("user_stats")
        .select("streak_days")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (!lesson || !course) return <p>Lesson not found.</p>;

  const doneIds = new Set((progress ?? []).map((p) => p.lesson_id));

  // Content is freely browsable (like a textbook / Brightspace): a learner can
  // open any lesson in the course and read the material in any order. Mastery is
  // still enforced where it matters — checkpoint quizzes require a passing score
  // to count toward completion — but the material is never hidden behind a lock.
  const outline = (lessons ?? []).map((l) => ({
    id: l.id,
    position: l.position,
    title: l.title,
    kind: l.kind,
    completed: doneIds.has(l.id),
  }));

  // Live experiment (spec §28): does a motivational nudge lift mastery?
  const nudgeVariant = await assignVariant("lesson_nudge");

  return (
    <LessonPlayer
      lesson={lesson}
      courseId={params.courseId}
      language={course.language}
      dialect={course.dialect}
      outline={outline}
      courseTitle={course.title}
      streakDays={stats?.streak_days ?? 0}
      nudgeVariant={nudgeVariant}
    />
  );
}
