export type TopicLesson = {
  id: string; title: string; kind: string; estimated_minutes: number | null;
  completed: boolean; mastery: string | null;
};
export type LessonFilter = "all" | "unfinished" | "review" | "completed";
export function needsReview(lesson: TopicLesson) {
  return ["Review needed", "Developing", "Fragile"].includes(lesson.mastery ?? "");
}
export function filterTopicLessons(lessons: TopicLesson[], query: string, filter: LessonFilter, minutes: number) {
  const q = query.trim().toLocaleLowerCase();
  return lessons.filter(l => (
    (l.title + " " + l.kind).toLocaleLowerCase().includes(q) &&
    (filter === "all" || (filter === "unfinished" && !l.completed) ||
      (filter === "completed" && l.completed) || (filter === "review" && needsReview(l))) &&
    (!minutes || (l.estimated_minutes != null && l.estimated_minutes > 0 && l.estimated_minutes <= minutes))
  ));
}
export function topicUnits(lessons: TopicLesson[]) {
  const units: { title: string; lessons: TopicLesson[] }[] = [];
  let current: TopicLesson[] = [];
  let number = 1;
  lessons.forEach((lesson, index) => {
    if (index === 0 && lesson.kind === "quiz") { units.push({ title: "Optional diagnostic", lessons: [lesson] }); return; }
    current.push(lesson);
    if (lesson.kind === "quiz") { units.push({ title: "Unit " + number++, lessons: current }); current = []; }
  });
  if (current.length) units.push({ title: "Unit " + number, lessons: current });
  return units;
}
export function shortSession(lessons: TopicLesson[], budget: number) {
  let remaining = budget;
  // Never skip ahead past an unknown-length or over-budget lesson in the learning path.
  const pending = lessons.filter((l, index) => !l.completed && !(index === 0 && l.kind === "quiz"));
  const selected: TopicLesson[] = [];
  for (const lesson of pending) {
    const minutes = lesson.estimated_minutes;
    if (minutes == null || minutes <= 0 || minutes > remaining) break;
    selected.push(lesson); remaining -= minutes;
  }
  return selected;
}
