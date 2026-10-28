"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { rateCardAction, completeLessonAction, logQuizAnswer, recordTestResultAction } from "@/app/learn/[courseId]/[lessonId]/actions";
import { PronouncePractice } from "@/components/PronouncePractice";
import { Celebrate } from "@/components/Celebrate";
import { XP } from "@/lib/gamification";
import {
  createRunnerUrl,
  runInSandbox,
  createPythonRunner,
  createSqlRunner,
  sqlResultsEqual,
  normalizeLanguage,
  LANGUAGE_LABEL,
  type CodeTest,
  type PythonRunner,
  type SqlRunner,
  type SqlResult,
} from "@/lib/code-runner";
import { codeEditorKeyDown } from "@/lib/editor-keys";
import { InstantFeedback } from "@/components/InstantFeedback";

type Lesson = {
  id: string;
  course_id: string;
  title: string;
  kind: string;
  body: any;
  grammar_notes_md: string | null;
  estimated_minutes?: number | null;
};

type VocabItem = { term: string; translation: string; ipa?: string; example?: string };

type OutlineLesson = {
  id: string;
  position: number;
  title: string;
  kind: string;
  completed: boolean;
};

// Modules (units) are formed by splitting the ordered outline at quiz lessons:
// a quiz ends its module. A quiz that is the very first lesson stands alone as
// the "Diagnostic" module (module index 0); real units count from 1.
type ModuleGroup = {
  index: number;
  label: string;
  entries: { lesson: OutlineLesson; idx: number }[];
};

function buildModules(outline: OutlineLesson[]): ModuleGroup[] {
  const groups: ModuleGroup[] = [];
  let current: { lesson: OutlineLesson; idx: number }[] = [];
  let unit = 1;
  outline.forEach((l, idx) => {
    if (idx === 0 && l.kind === "quiz") {
      groups.push({ index: 0, label: "Diagnostic", entries: [{ lesson: l, idx }] });
      return;
    }
    current.push({ lesson: l, idx });
    if (l.kind === "quiz") {
      groups.push({ index: unit, label: `Unit ${unit}`, entries: current });
      unit += 1;
      current = [];
    }
  });
  if (current.length) {
    groups.push({ index: unit, label: `Unit ${unit}`, entries: current });
  }
  return groups;
}

// Module-relative lesson number, e.g. "2.3" = 3rd lesson of Unit 2.
function lessonNumber(modules: ModuleGroup[], lessonId: string): string | null {
  for (const m of modules) {
    const pos = m.entries.findIndex((e) => e.lesson.id === lessonId);
    if (pos >= 0) return `${m.index}.${pos + 1}`;
  }
  return null;
}

export function LessonPlayer({
  lesson, courseId, language, dialect, outline = [], courseTitle = "", streakDays = null,
  nudgeVariant = null,
}: {
  lesson: Lesson;
  courseId: string;
  language: string;
  dialect: string | null;
  outline?: OutlineLesson[];
  courseTitle?: string;
  streakDays?: number | null;
  nudgeVariant?: string | null;
}) {
  let content: React.ReactNode;
  if (lesson.kind === "vocab") {
    content = (
      <VocabFlashcards
        items={Array.isArray(lesson.body?.items) ? lesson.body.items : []}
        title={lesson.title}
        courseId={courseId}
        lessonId={lesson.id}
        language={language}
        dialect={dialect}
        grammar={lesson.grammar_notes_md}
      />
    );
  } else if (lesson.kind === "roleplay") {
    content = <RoleplayLesson body={lesson.body} title={lesson.title} courseId={courseId} />;
  } else if (lesson.kind === "code") {
    content =
      normalizeLanguage(lesson.body?.language) === "sql" ? (
        <SqlLesson body={lesson.body} title={lesson.title} courseId={courseId} lessonId={lesson.id} />
      ) : (
        <CodeLesson body={lesson.body} title={lesson.title} courseId={courseId} lessonId={lesson.id} />
      );
  } else if (lesson.kind === "quiz") {
    // Malformed questions (no prompt/options) are skipped rather than crashing
    // or dead-ending the quiz.
    const questions: QuizQuestion[] = (
      Array.isArray(lesson.body?.questions) ? lesson.body.questions : []
    ).filter((q: any) => q && Array.isArray(q.options) && q.options.length > 0);
    // The course's opening diagnostic quiz should never trap a learner: offer a
    // direct link to the first real lesson (crucial on mobile, where the lesson
    // sidebar is hidden and the quiz view fills the screen).
    const isOpeningDiagnostic = outline.length > 0 && outline[0]?.id === lesson.id;
    const firstContentLesson = outline.find((l) => l.kind !== "quiz");
    content = (
      <QuizLesson
        questions={questions}
        title={lesson.title}
        courseId={courseId}
        lessonId={lesson.id}
        streakDays={streakDays}
        // Checkpoint/final quizzes gate progress; a course's opening diagnostic
        // quiz does not (placement should never trap a new learner).
        gate={outline.length === 0 ? true : outline[0]?.id !== lesson.id}
        skipToLessonsHref={
          isOpeningDiagnostic && firstContentLesson
            ? `/learn/${courseId}/${firstContentLesson.id}`
            : undefined
        }
      />
    );
  } else {
    const contentLesson = (
      <ContentLesson
        body={lesson.body}
        title={lesson.title}
        courseId={courseId}
        lessonId={lesson.id}
        grammar={lesson.grammar_notes_md}
      />
    );
    if (lesson.kind === "writing") {
      // Writing lessons ask the student to produce work — so offer instant,
      // rubric-based feedback on their draft right here, seeded with the task.
      const sections: Array<{ heading?: string; text: string }> = Array.isArray(lesson.body?.sections)
        ? lesson.body.sections
        : [];
      const task = [lesson.title, ...sections.map((s) => (s.heading ? `${s.heading}: ` : "") + s.text)]
        .join("\n")
        .slice(0, 3500);
      content = (
        <>
          {contentLesson}
          <section className="mt-6 border-t border-black/5 pt-5">
            <h2 className="text-lg font-bold">Get feedback on your draft</h2>
            <p className="mb-3 text-sm text-ink-500">
              Write or paste your response below for detailed, real-time feedback — then revise and mark the lesson complete.
            </p>
            <InstantFeedback initialTask={task} initialKind="essay" taskLabel="The task (from this lesson)" />
          </section>
        </>
      );
    } else {
      content = contentLesson;
    }
  }

  const vocabItems: VocabItem[] = Array.isArray(lesson.body?.items) ? lesson.body.items : [];
  const hasOutline = outline.length > 0;
  const hasVocabPanel = vocabItems.length > 0;

  // Experiment "lesson_nudge" (spec §28): the treatment variant shows a short
  // encouragement banner at the top of the lesson; control shows nothing.
  const nudge =
    nudgeVariant === "treatment" ? (
      <div className="mb-3 rounded-xl border border-brand-500/20 bg-brand-50 px-3 py-2 text-sm text-ink-700 dark:bg-brand-500/10">
        <span aria-hidden>✨</span>{" "}
        {streakDays && streakDays > 0
          ? `You're on a ${streakDays}-day streak — finish this lesson to keep it going.`
          : "One lesson at a time is how mastery is built. You've got this."}
      </div>
    ) : null;

  // No desktop chrome to render — behave exactly as before (plus the nudge).
  if (!hasOutline && !hasVocabPanel) return <>{nudge}{content}</>;

  const isQuiz = lesson.kind === "quiz";
  const modules = buildModules(outline);
  const lessonNo = lessonNumber(modules, lesson.id);
  const currentIdx = outline.findIndex((l) => l.id === lesson.id);
  const prevLesson = currentIdx > 0 ? outline[currentIdx - 1] : null;
  const nextLesson =
    currentIdx >= 0 && currentIdx < outline.length - 1 ? outline[currentIdx + 1] : null;

  // Desktop three-zone layout at lg+; below lg the sidebars are hidden and
  // the single-column experience is untouched. Grid templates are written as
  // full literal class strings so Tailwind's JIT picks them up.
  const gridCols =
    hasOutline && hasVocabPanel
      ? "lg:grid-cols-[240px_minmax(0,1fr)_280px]"
      : hasOutline
        ? "lg:grid-cols-[240px_minmax(0,1fr)]"
        : "lg:grid-cols-[minmax(0,1fr)_280px]";

  return (
    <div className={`lg:grid lg:items-start lg:gap-6 ${gridCols}`}>
      {hasOutline && (
        <aside className="hidden lg:sticky lg:top-4 lg:block">
          <CourseOutline
            outline={outline}
            modules={modules}
            courseId={courseId}
            courseTitle={courseTitle}
            currentLessonId={lesson.id}
          />
        </aside>
      )}
      <div className="min-w-0">
        {/* Top bar (content view): back link + course title, estimated time.
            Quiz lessons render their own assessment top bar instead. */}
        {!isQuiz && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/learn/${courseId}`}
                className="text-xs font-medium text-brand-500 hover:underline"
              >
                ← Back to course
              </Link>
              {courseTitle && (
                <p className="truncate text-sm font-semibold text-ink-700">{courseTitle}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-ink-500">
              ⏱ {lesson.estimated_minutes ?? 10} min
            </span>
          </div>
        )}
        {/* Lesson mode tabs (per the product design): Learn is this page;
            the others deep-link to the matching experience. */}
        <div className="mb-4 hidden gap-5 border-b border-black/5 text-sm lg:flex">
          <span className="border-b-2 border-brand-500 pb-2 font-semibold text-brand-700">Learn</span>
          <a href="/practice" className="pb-2 text-ink-500 hover:text-ink-900">Practice</a>
          <a href="/practice" className="pb-2 text-ink-500 hover:text-ink-900">Speak</a>
          <a href="/review" className="pb-2 text-ink-500 hover:text-ink-900">Review</a>
        </div>
        {/* Module-relative numbering kicker; inner components render the title. */}
        {!isQuiz && lessonNo && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-brand-600">
            Lesson {lessonNo}
          </p>
        )}
        {nudge}
        {content}
        {/* Footer nav: previous / position / next through the outline. */}
        {!isQuiz && currentIdx >= 0 && (
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-black/5 pt-4">
            {prevLesson ? (
              <Link href={`/learn/${courseId}/${prevLesson.id}`} className="btn-ghost">
                Previous
              </Link>
            ) : (
              <span aria-hidden />
            )}
            <span className="text-xs text-ink-500">
              {currentIdx + 1} of {outline.length}
            </span>
            {nextLesson ? (
              <Link href={`/learn/${courseId}/${nextLesson.id}`} className="btn-primary">
                Next →
              </Link>
            ) : (
              <Link href={`/learn/${courseId}`} className="btn-primary">
                Finish course ✓
              </Link>
            )}
          </div>
        )}
      </div>
      {hasVocabPanel && (
        <aside className="hidden lg:sticky lg:top-4 lg:block">
          <VocabPanel
            items={vocabItems}
            language={language}
            dialect={dialect}
            grammar={lesson.grammar_notes_md}
          />
        </aside>
      )}
    </div>
  );
}

// Desktop left sidebar: unit-grouped course outline with per-unit progress
// bars and a current-lesson accent.
function CourseOutline({
  outline, modules, courseId, courseTitle, currentLessonId,
}: {
  outline: OutlineLesson[];
  modules: ModuleGroup[];
  courseId: string;
  courseTitle: string;
  currentLessonId: string;
}) {
  const total = outline.length;
  const doneCount = outline.filter((l) => l.completed).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  return (
    <nav className="card space-y-3" aria-label="Course outline" data-testid="lesson-outline">
      <div>
        <Link href={`/learn/${courseId}`} className="text-xs font-medium text-brand-500 hover:underline">
          ← Back to course
        </Link>
        {courseTitle && <p className="mt-1 text-sm font-bold leading-snug">{courseTitle}</p>}
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-[11px] text-ink-500">
          <span>{doneCount} / {total} complete</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {modules.map((m) => {
        const unitDone = m.entries.filter((e) => e.lesson.completed).length;
        const unitPct = m.entries.length
          ? Math.round((unitDone / m.entries.length) * 100)
          : 0;
        return (
          <div key={m.index} className="space-y-1">
            <div className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              <span>{m.label}</span>
              <span>{unitPct}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${unitPct}%` }}
              />
            </div>
            <ol className="space-y-1">
              {m.entries.map(({ lesson: l, idx }) => {
                const current = l.id === currentLessonId;
                return (
                  <li key={l.id}>
                    <Link
                      href={`/learn/${courseId}/${l.id}`}
                      aria-current={current ? "page" : undefined}
                      className={
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition " +
                        (current
                          ? "bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-500"
                          : "text-ink-700 hover:bg-black/5")
                      }
                    >
                      <span
                        aria-hidden
                        className={
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold " +
                          (l.completed
                            ? "bg-brand-500 text-white"
                            : current
                              ? "bg-white text-brand-600 ring-1 ring-brand-500"
                              : "bg-black/5 text-ink-500")
                        }
                      >
                        {l.completed ? "✓" : idx + 1}
                      </span>
                      <span className="truncate">{l.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </nav>
  );
}

// Desktop right sidebar: quick vocabulary reference with TTS + grammar focus.
function VocabPanel({
  items, language, dialect, grammar,
}: {
  items: VocabItem[];
  language: string;
  dialect: string | null;
  grammar: string | null;
}) {
  function speak(term: string) {
    try {
      const u = new SpeechSynthesisUtterance(term);
      u.lang = dialect ? `${language}-${dialect.toUpperCase()}` : language;
      u.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // TTS unavailable — the panel remains a silent reference list.
    }
  }
  return (
    <div className="space-y-4" data-testid="vocab-panel">
      <section className="card">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Vocabulary</p>
        <ul className="mt-1 divide-y divide-black/5">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{it.term}</p>
                <p className="truncate text-xs text-ink-500">{it.translation}</p>
              </div>
              <button
                type="button"
                onClick={() => speak(it.term)}
                aria-label={`Play pronunciation of ${it.term}`}
                className="shrink-0 rounded-full p-1.5 text-base transition hover:bg-black/5"
              >
                🔊
              </button>
            </li>
          ))}
        </ul>
      </section>
      {grammar && (
        <section className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Grammar Focus</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{grammar}</p>
        </section>
      )}
    </div>
  );
}

function ContentLesson({
  body, title, courseId, lessonId, grammar,
}: {
  body: any;
  title: string;
  courseId: string;
  lessonId: string;
  grammar: string | null;
}) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // Supported shapes:
  //   { content: "markdown-ish text" }
  //   { sections: [{ heading, text }] }
  //   { content, sections }
  const sections: Array<{ heading?: string; text: string }> = Array.isArray(body?.sections)
    ? body.sections
    : [];

  // Mock's tip callout: prefer body.notes, fall back to the grammar notes.
  // When the tip IS the grammar notes we skip the collapsible Notes block
  // below so the same text never renders twice.
  const tip: string | null =
    typeof body?.notes === "string" && body.notes.trim() ? body.notes : grammar;

  function complete() {
    startTransition(async () => {
      try { await completeLessonAction(lessonId, 100); } catch {}
    });
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-3">
        <Celebrate xp={XP.lessonComplete} />
        <h1 className="text-xl font-bold">Lesson complete 🎉</h1>
        <p className="text-sm text-ink-500">
          {pending ? "Saving your progress…" : "Progress saved."}
        </p>
        <Link href={`/learn/${courseId}`} className="btn-primary inline-block">Continue</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>

      {body?.content && (
        <article className="card whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
          {body.content}
        </article>
      )}

      {tip && (
        <div className="card border border-brand-500/20 bg-brand-50">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-700">
            <span aria-hidden className="text-base">💡</span>
            <span className="whitespace-pre-wrap">{tip}</span>
          </p>
        </div>
      )}

      {sections.map((s, i) => (
        <section key={i} className="card space-y-1">
          {s.heading && <h2 className="font-semibold">{s.heading}</h2>}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{s.text}</p>
        </section>
      ))}

      {body?.key_terms && Array.isArray(body.key_terms) && (
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Key terms</p>
          <ul className="mt-1 space-y-1 text-sm">
            {body.key_terms.map((t: any, i: number) => (
              <li key={i}><strong>{t.term}:</strong> {t.definition}</li>
            ))}
          </ul>
        </div>
      )}

      {grammar && tip !== grammar && (
        <details className="card">
          <summary className="cursor-pointer font-medium">Notes</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{grammar}</p>
        </details>
      )}

      <button onClick={complete} className="btn-primary w-full">Mark complete</button>
      <Link href={`/learn/${courseId}`} className="block text-center text-sm text-ink-500">
        Back to course
      </Link>
    </div>
  );
}

// A vocab lesson now drills each item through THREE modes back-to-back:
//   1. Recognize — see the term, recall the meaning, self-rate (existing flow).
//   2. Recall    — see the translation, TYPE the term in target language,
//                  auto-graded against the expected answer.
//   3. Listen    — hear the term via TTS, type what was said. Auto-graded.
// Each interaction records an SRS rating; the lesson completes once every
// item has been seen in all three modes.
type Mode = "recognize" | "recall" | "listen";
const MODE_ORDER: Mode[] = ["recognize", "recall", "listen"];
const MODE_LABEL: Record<Mode, string> = {
  recognize: "Recognize",
  recall: "Recall",
  listen: "Listen",
};

function VocabFlashcards({
  items, title, courseId, lessonId, language, dialect, grammar,
}: {
  items: VocabItem[];
  title: string;
  courseId: string;
  lessonId: string;
  language: string;
  dialect: string | null;
  grammar: string | null;
}) {
  // Build the full sequence of {item, mode} steps once. This is the deepening:
  // a 3-card vocab lesson becomes 9 interactions, not 3.
  const sequence = useMemo(
    () => items.flatMap((item) => MODE_ORDER.map((mode) => ({ item, mode }))),
    [items],
  );

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [ratings, setRatings] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = sequence.length;
  const current = sequence[step];
  const progress = useMemo(() => (step / Math.max(1, total)) * 100, [step, total]);
  const locale = dialect ? `${language}-${dialect.toUpperCase()}` : undefined;

  function record(rating: number) {
    if (!current) return;
    const nextRatings = [...ratings, rating];
    setRatings(nextRatings);
    startTransition(async () => {
      try {
        await rateCardAction({
          language,
          dialect,
          term: current.item.term,
          translation: current.item.translation,
          ipa: current.item.ipa,
          example: current.item.example,
          rating,
        });
      } catch (e: any) {
        setError(e?.message ?? "Could not save review");
      }
    });
    if (step + 1 >= total) {
      const avg = (nextRatings.reduce((a, b) => a + b, 0) / total) * 20;
      startTransition(async () => {
        try { await completeLessonAction(lessonId, avg); } catch {}
      });
      setDone(true);
    } else {
      setStep(step + 1);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <Celebrate xp={XP.lessonComplete + total * XP.cardReview} />
        <h1 className="text-xl font-bold">Lesson complete 🎉</h1>
        <p className="text-sm text-ink-500">
          {pending
            ? "Saving your reviews…"
            : `${items.length} cards practiced in ${MODE_ORDER.length} modes — saved to your spaced-repetition queue.`}
        </p>
        <div className="flex gap-2">
          <Link href="/review" className="btn-primary flex-1 text-center">Start a review</Link>
          <Link href={`/learn/${courseId}`} className="btn-ghost flex-1 text-center">Back to course</Link>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (!current) return <p>No items.</p>;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-ink-500">
          <span>{step + 1} / {total}</span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            {MODE_LABEL[current.mode]}
          </span>
        </div>
      </header>

      {current.mode === "recognize" && (
        <RecognizeCard
          key={`r-${step}`}
          item={current.item}
          language={language}
          locale={locale}
          onRate={record}
        />
      )}
      {current.mode === "recall" && (
        <TypedExercise
          key={`c-${step}`}
          item={current.item}
          language={language}
          locale={locale}
          mode="recall"
          onRate={record}
        />
      )}
      {current.mode === "listen" && (
        <TypedExercise
          key={`l-${step}`}
          item={current.item}
          language={language}
          locale={locale}
          mode="listen"
          onRate={record}
        />
      )}

      {grammar && (
        <details className="card">
          <summary className="cursor-pointer font-medium">Grammar notes</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{grammar}</p>
        </details>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function RecognizeCard({
  item, language, locale, onRate,
}: {
  item: VocabItem;
  language: string;
  locale: string | undefined;
  onRate: (rating: number) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <div className="card min-h-[220px] text-center">
        <p className="text-3xl font-semibold">{item.term}</p>
        {item.ipa && <p className="mt-1 text-sm text-ink-500">/{item.ipa}/</p>}
        {revealed ? (
          <>
            <p className="mt-4 text-lg">{item.translation}</p>
            {item.example && <p className="mt-2 italic text-ink-500">"{item.example}"</p>}
          </>
        ) : (
          <button onClick={() => setRevealed(true)} className="btn-ghost mt-6">
            Show answer
          </button>
        )}
      </div>

      {revealed && (
        <div className="card">
          <PronouncePractice
            reference={item.example ?? item.term}
            language={language}
            locale={locale}
          />
        </div>
      )}

      {revealed && (
        <div className="grid grid-cols-4 gap-2" data-testid="self-rate">
          <button onClick={() => onRate(0)} className="btn-ghost">Again</button>
          <button onClick={() => onRate(3)} className="btn-ghost">Hard</button>
          <button onClick={() => onRate(4)} className="btn-ghost">Good</button>
          <button onClick={() => onRate(5)} className="btn-primary">Easy</button>
        </div>
      )}
    </>
  );
}

function TypedExercise({
  item, language, locale, mode, onRate,
}: {
  item: VocabItem;
  language: string;
  locale: string | undefined;
  mode: "recall" | "listen";
  onRate: (rating: number) => void;
}) {
  const [given, setGiven] = useState("");
  const [graded, setGraded] = useState<null | { ok: boolean; close: boolean; confidence: number }>(null);
  const [played, setPlayed] = useState(false);

  function playPrompt() {
    // Unlock the answer field even if TTS is unavailable (some browsers /
    // headless environments lack speechSynthesis) — the gate is a nudge to
    // listen first, not a hard requirement.
    setPlayed(true);
    try {
      const u = new SpeechSynthesisUtterance(item.term);
      u.lang = locale ?? `${language}-${language.toUpperCase()}`;
      u.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // No TTS — the learner can still type from memory of the term.
    }
  }

  function check(e: React.FormEvent) {
    e.preventDefault();
    if (!given.trim()) return;
    // Lazy-load to keep the client bundle slim.
    import("@/lib/match").then(({ gradeTypedAnswer }) => {
      setGraded(gradeTypedAnswer(item.term, given));
    });
  }

  return (
    <>
      {mode === "recall" ? (
        <div className="card min-h-[220px] text-center">
          <p className="text-xs uppercase tracking-wider text-ink-500">Translate</p>
          <p className="mt-2 text-2xl font-semibold">{item.translation}</p>
          <p className="mt-3 text-sm text-ink-500">How do you say this in {language === "es" ? "Spanish" : language}?</p>
        </div>
      ) : (
        <div className="card min-h-[220px] text-center">
          <p className="text-xs uppercase tracking-wider text-ink-500">Listen</p>
          <button
            type="button"
            onClick={playPrompt}
            className="mt-3 text-4xl"
            aria-label="Play audio"
            data-testid="listen-play"
          >
            🔊
          </button>
          <p className="mt-2 text-sm text-ink-500">
            {played ? "Type what you heard." : "Tap to hear the term, then type what you heard."}
          </p>
        </div>
      )}

      {!graded ? (
        <form onSubmit={check} className="space-y-3" data-testid="typed-exercise-form">
          <input
            autoFocus
            value={given}
            onChange={(e) => setGiven(e.target.value)}
            placeholder={mode === "listen" ? "What did you hear?" : "Your answer…"}
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3"
          />
          <button
            type="submit"
            disabled={!given.trim() || (mode === "listen" && !played)}
            className="btn-primary w-full"
          >
            Check
          </button>
        </form>
      ) : (
        <div
          className={
            "card space-y-2 " +
            (graded.ok ? "border border-green-300 bg-green-50" : "border border-red-300 bg-red-50")
          }
          data-testid="typed-result"
        >
          <p className="text-sm font-semibold">
            {graded.ok
              ? graded.close
                ? "Almost — close to perfect (mind the accents)."
                : "Correct!"
              : graded.close
                ? "Close, but not quite."
                : "Not quite."}
          </p>
          <p className="text-sm">
            <span className="text-ink-500">You wrote:</span>{" "}
            <span className="font-medium">{given || "—"}</span>
          </p>
          <p className="text-sm">
            <span className="text-ink-500">Answer:</span>{" "}
            <span className="font-medium">{item.term}</span>
            {item.ipa && <span className="text-ink-500"> /{item.ipa}/</span>}
          </p>
          <button
            type="button"
            onClick={() => onRate(graded.confidence)}
            className="btn-primary mt-1 w-full"
            data-testid="typed-continue"
          >
            Continue
          </button>
        </div>
      )}
    </>
  );
}

function RoleplayLesson({
  body, title, courseId,
}: { body: any; title: string; courseId: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="card space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-ink-500">Scenario</p>
        <p>{body?.scenario}</p>
        {body?.goal && <p className="text-sm text-ink-500">Goal: {body.goal}</p>}
      </div>
      <Link href={`/practice?scenario=${encodeURIComponent(body?.scenario ?? "")}&persona=${encodeURIComponent(body?.persona ?? "")}`} className="btn-primary block text-center">
        Start system roleplay
      </Link>
      <Link href={`/tutors`} className="btn-ghost block text-center">Or do this with a live instructor</Link>
      <Link href={`/learn/${courseId}`} className="block text-center text-sm text-ink-500">Back to course</Link>
    </div>
  );
}

// A coding lesson (spec §12): author gives a prompt, a starter template, and a
// set of hidden tests. The learner writes JavaScript, runs it against the tests
// in a sandboxed worker, and the lesson only completes — and thus unlocks the
// next one under the sequential gate — once every test passes. Runs entirely in
// the browser; nothing is sent to a server to be graded.
function CodeLesson({
  body, title, courseId, lessonId,
}: {
  body: any;
  title: string;
  courseId: string;
  lessonId: string;
}) {
  const prompt: string = typeof body?.prompt === "string" ? body.prompt : "";
  const instructions: string | null =
    typeof body?.instructions === "string" && body.instructions.trim() ? body.instructions : null;
  const starter: string = typeof body?.starter === "string" ? body.starter : "";
  const solution: string | null =
    typeof body?.solution === "string" && body.solution.trim() ? body.solution : null;
  const tests: CodeTest[] = (Array.isArray(body?.tests) ? body.tests : []).filter(
    (t: any) => t && typeof t.label === "string" && typeof t.expr === "string",
  );
  const lang = normalizeLanguage(body?.language);
  const packages: string[] = Array.isArray(body?.packages)
    ? body.packages.filter((p: any) => typeof p === "string")
    : [];

  const [code, setCode] = useState(starter);
  const [running, setRunning] = useState(false);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [results, setResults] = useState<(boolean | string)[] | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // JavaScript runs in a throwaway Blob worker; Python reuses one Pyodide
  // worker (heavy to load, so kept alive across runs).
  const workerUrl = useMemo(
    () => (lang === "javascript" && typeof window !== "undefined" ? createRunnerUrl() : ""),
    [lang],
  );
  const pyRunner = useRef<PythonRunner | null>(null);
  useEffect(() => {
    return () => {
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      pyRunner.current?.dispose();
    };
  }, [workerUrl]);

  const allPass = results !== null && tests.length > 0 && results.every((r) => r === true);

  async function run() {
    if (running) return;
    setRunning(true); setResults(null); setLogs([]); setImage(null);
    let res: (boolean | string)[];
    let lg: string[];
    let img: string | null = null;
    if (lang === "python") {
      if (!pyRunner.current) pyRunner.current = createPythonRunner();
      const out = await pyRunner.current.run(code, tests, {
        onLoadStart: () => setLoadingRuntime(true),
        packages,
      });
      res = out.results; lg = out.logs; img = out.image ?? null;
      setLoadingRuntime(false);
    } else {
      if (!workerUrl) { setRunning(false); return; }
      const out = await runInSandbox(workerUrl, code, tests);
      res = out.results; lg = out.logs;
    }
    setResults(res);
    setLogs(lg);
    setImage(img);
    setAttempts((a) => a + 1);
    setRunning(false);
    if (res.length > 0 && res.every((r) => r === true)) {
      startTransition(async () => {
        try { await completeLessonAction(lessonId, 100); } catch {}
      });
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <Celebrate xp={XP.lessonComplete} />
        <h1 className="text-xl font-bold">Challenge solved 🎉</h1>
        <p className="text-sm text-ink-500">
          {pending ? "Saving your progress…" : `All ${tests.length} tests passed in ${attempts} ${attempts === 1 ? "run" : "runs"}.`}
        </p>
        <Link href={`/learn/${courseId}`} className="btn-primary inline-block">Continue</Link>
      </div>
    );
  }

  if (tests.length === 0) {
    return <p>This coding lesson has no tests configured.</p>;
  }

  const passCount = results ? results.filter((r) => r === true).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-semibold text-ink-500">
          {LANGUAGE_LABEL[lang]}
        </span>
      </div>

      <div className="card">
        <p className="text-sm leading-relaxed text-ink-700">{prompt}</p>
        {instructions && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-500">{instructions}</p>
        )}
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => codeEditorKeyDown(e, setCode, run)}
        spellCheck={false}
        rows={12}
        className="w-full rounded-xl border border-black/10 bg-[#0e1022] p-3 font-mono text-sm text-white"
        aria-label="Code editor"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={run} disabled={running} className="btn-primary px-5 py-2 text-sm">
          {loadingRuntime ? "Loading Python…" : running ? "Running…" : "▶ Run & check"}
        </button>
        <button onClick={() => { setCode(starter); setResults(null); setLogs([]); }} className="btn-ghost px-4 py-2 text-sm">
          Reset
        </button>
        {solution && attempts >= 3 && !allPass && (
          <button onClick={() => setShowSolution((s) => !s)} className="btn-ghost px-4 py-2 text-sm">
            {showSolution ? "Hide solution" : "Show solution"}
          </button>
        )}
        {results && (
          <span className={`text-sm font-semibold ${allPass ? "text-green-600" : "text-ink-500"}`}>
            {passCount} / {tests.length} passing
          </span>
        )}
      </div>

      {loadingRuntime && (
        <div className="card border-brand-500/20 bg-brand-50 text-sm text-ink-700">
          Downloading the Python runtime{packages.length ? ` and ${packages.join(", ")}` : ""} — this happens once and can take a few seconds. It then runs instantly in your browser.
        </div>
      )}

      {results && (
        <div className="card space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Tests</p>
          {tests.map((t, i) => {
            const r = results[i];
            const ok = r === true;
            return (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span aria-hidden>{ok ? "✅" : "❌"}</span>
                <span className="font-mono text-xs">{t.label}</span>
                {typeof r === "string" && <span className="text-xs text-red-600">— {r}</span>}
              </div>
            );
          })}
          {!allPass && (
            <p className="pt-1 text-xs text-ink-500">
              Keep going — the lesson unlocks once every test passes.
            </p>
          )}
        </div>
      )}

      {image && (
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Plot</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${image}`}
            alt="Plot produced by your code"
            className="mt-2 max-w-full rounded-lg border border-black/5 bg-white"
          />
        </div>
      )}

      {logs.length > 0 && (
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Console</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-ink-700">{logs.join("\n")}</pre>
        </div>
      )}

      {showSolution && solution && (
        <details className="card" open>
          <summary className="cursor-pointer text-sm font-medium">Reference solution</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#0e1022] p-3 font-mono text-xs text-white">{solution}</pre>
          <p className="mt-2 text-xs text-ink-500">Compare it with your approach, then make yours pass.</p>
        </details>
      )}

      <Link href={`/learn/${courseId}`} className="block text-center text-sm text-ink-500">
        Back to course
      </Link>
    </div>
  );
}

// A SQL lesson (spec §12): the learner writes a query against a small in-browser
// SQLite database seeded by `schema`. We run their query and a reference
// `solution` query, compare result sets, and complete the lesson on a match.
// SQLite runs entirely in the browser via sql.js — nothing is sent to a server.
function SqlLesson({
  body, title, courseId, lessonId,
}: {
  body: any;
  title: string;
  courseId: string;
  lessonId: string;
}) {
  const prompt: string = typeof body?.prompt === "string" ? body.prompt : "";
  const instructions: string | null =
    typeof body?.instructions === "string" && body.instructions.trim() ? body.instructions : null;
  const schema: string = typeof body?.schema === "string" ? body.schema : "";
  const starter: string = typeof body?.starter === "string" ? body.starter : "SELECT ";
  const solution: string | null =
    typeof body?.solution === "string" && body.solution.trim() ? body.solution : null;
  const ordered = body?.ordered === true;

  const [query, setQuery] = useState(starter);
  const [running, setRunning] = useState(false);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const runner = useRef<SqlRunner | null>(null);
  useEffect(() => () => runner.current?.dispose(), []);

  async function run() {
    if (running) return;
    setRunning(true); setError(null); setPass(null); setResult(null);
    if (!runner.current) runner.current = createSqlRunner();
    const out = await runner.current.run(schema, query, solution, {
      onLoadStart: () => setLoadingRuntime(true),
    });
    setLoadingRuntime(false);
    setAttempts((a) => a + 1);
    setRunning(false);
    if (!out.ok) { setError(out.error); return; }
    setResult(out.actual);
    if (out.expected) {
      const ok = sqlResultsEqual(out.actual, out.expected, ordered);
      setPass(ok);
      if (ok) {
        startTransition(async () => {
          try { await completeLessonAction(lessonId, 100); } catch {}
        });
        setDone(true);
      }
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <Celebrate xp={XP.lessonComplete} />
        <h1 className="text-xl font-bold">Query solved 🎉</h1>
        <p className="text-sm text-ink-500">
          {pending ? "Saving your progress…" : `Correct result in ${attempts} ${attempts === 1 ? "run" : "runs"}.`}
        </p>
        <Link href={`/learn/${courseId}`} className="btn-primary inline-block">Continue</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-semibold text-ink-500">SQL</span>
      </div>

      <div className="card">
        <p className="text-sm leading-relaxed text-ink-700">{prompt}</p>
        {instructions && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-500">{instructions}</p>
        )}
      </div>

      {schema && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium">Show the database schema</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#0e1022] p-3 font-mono text-xs text-white">{schema}</pre>
        </details>
      )}

      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => codeEditorKeyDown(e, setQuery, run)}
        spellCheck={false}
        rows={8}
        className="w-full rounded-xl border border-black/10 bg-[#0e1022] p-3 font-mono text-sm text-white"
        aria-label="SQL editor"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={run} disabled={running} className="btn-primary px-5 py-2 text-sm">
          {loadingRuntime ? "Loading SQL…" : running ? "Running…" : "▶ Run query"}
        </button>
        <button onClick={() => { setQuery(starter); setResult(null); setError(null); setPass(null); }} className="btn-ghost px-4 py-2 text-sm">
          Reset
        </button>
        {solution && attempts >= 3 && pass !== true && (
          <button onClick={() => setShowSolution((s) => !s)} className="btn-ghost px-4 py-2 text-sm">
            {showSolution ? "Hide solution" : "Show solution"}
          </button>
        )}
        {pass === true && <span className="text-sm font-semibold text-green-600">✓ Correct result!</span>}
        {pass === false && <span className="text-sm font-semibold text-amber-600">Not the expected result yet — keep going.</span>}
      </div>

      {loadingRuntime && (
        <div className="card border-brand-500/20 bg-brand-50 text-sm text-ink-700">
          Loading the in-browser SQLite engine — this happens once and can take a few seconds.
        </div>
      )}

      {error && (
        <div className="card border border-red-300 bg-red-50 text-sm text-red-700">
          <p className="font-semibold">SQL error</p>
          <p className="mt-0.5 font-mono text-xs">{error}</p>
        </div>
      )}

      {result && (
        <div className="card space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Result · {result.values.length} row{result.values.length === 1 ? "" : "s"}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-500">
                  {result.columns.map((c, i) => (
                    <th key={i} className="py-1 pr-3 font-semibold">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.values.slice(0, 50).map((row, ri) => (
                  <tr key={ri} className="border-t border-black/5">
                    {row.map((cell, ci) => (
                      <td key={ci} className="py-1 pr-3">{cell === null ? <span className="text-ink-500">NULL</span> : String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.values.length > 50 && <p className="text-[11px] text-ink-500">Showing first 50 rows.</p>}
        </div>
      )}

      {showSolution && solution && (
        <details className="card" open>
          <summary className="cursor-pointer text-sm font-medium">Reference solution</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#0e1022] p-3 font-mono text-xs text-white">{solution}</pre>
        </details>
      )}

      <Link href={`/learn/${courseId}`} className="block text-center text-sm text-ink-500">Back to course</Link>
    </div>
  );
}

type QuizQuestion = {
  prompt: string;
  options: string[];
  answer: number;
  explanation?: string;
};

// A question the learner got wrong, kept so the results screen can show them
// exactly what to review (their answer, the right one, and why).
type MissedItem = { prompt: string; your: string; correct: string; explanation?: string };

// Quick quiz: answer each question, get instant feedback + explanation,
// finish with a percentage score that feeds lesson_progress and XP.
const QUIZ_PASS = 70;

function QuizLesson({
  questions, title, courseId, lessonId, streakDays = null, gate = false, skipToLessonsHref,
}: {
  questions: QuizQuestion[];
  title: string;
  courseId: string;
  lessonId: string;
  streakDays?: number | null;
  gate?: boolean;
  skipToLessonsHref?: string;
}) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [missed, setMissed] = useState<MissedItem[]>([]);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const q = questions[i];
  const total = questions.length;

  function pick(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    const isCorrect = idx === q.answer;
    if (isCorrect) setCorrectCount((c) => c + 1);
    else
      setMissed((m) => [
        ...m,
        {
          prompt: q.prompt ?? "a question",
          your: q.options?.[idx] ?? "—",
          correct: q.options?.[q.answer] ?? "—",
          explanation: q.explanation,
        },
      ]);
    // Feed item analysis (fire-and-forget).
    void logQuizAnswer(lessonId, i, (q as any).prompt ?? "", isCorrect);
  }

  function retake() {
    setI(0); setPicked(null); setCorrectCount(0); setMissed([]); setDone(false);
  }

  function next() {
    if (i + 1 >= total) {
      const finalCorrect = correctCount;
      const score = Math.round((finalCorrect / Math.max(1, total)) * 100);
      // Mastery gate: a gated checkpoint quiz only marks the lesson complete —
      // and thus unlocks the next lesson — when the learner reaches the pass mark.
      if (!gate || score >= QUIZ_PASS) {
        startTransition(async () => {
          try { await completeLessonAction(lessonId, score); } catch {}
        });
      }
      // A gated quiz is a graded TEST: file the result (pass or fail) so the
      // student's teachers and parents are notified with the score, the topics
      // missed, and a plan — same fan-out as a paper grading.
      if (gate) {
        const missedNow = missed.slice(0, 6).map((m) => m.prompt);
        startTransition(async () => {
          try { await recordTestResultAction(lessonId, score, missedNow); } catch {}
        });
      }
      setDone(true);
    } else {
      setI(i + 1);
      setPicked(null);
    }
  }

  if (total === 0) return <p>No questions.</p>;

  if (done) {
    const score = Math.round((correctCount / total) * 100);
    const passed = !gate || score >= QUIZ_PASS;
    // "Focus on these": the exact questions missed, with the right answer and why,
    // so the learner knows what to study instead of just seeing a score.
    const missedReview =
      missed.length > 0 ? (
        <div className="card space-y-3 text-left" data-testid="quiz-focus">
          <p className="text-sm font-semibold text-ink-900">
            📌 Focus on these {missed.length === 1 ? "1 topic" : `${missed.length} topics`}
          </p>
          <ul className="space-y-3">
            {missed.map((m, idx) => (
              <li key={idx} className="border-l-2 border-amber-400 pl-3">
                <p className="text-sm font-medium text-ink-800">{m.prompt}</p>
                <p className="mt-0.5 text-xs text-red-600">You chose: {m.your}</p>
                <p className="text-xs font-medium text-green-700">Correct: {m.correct}</p>
                {m.explanation && <p className="mt-1 text-xs leading-relaxed text-ink-600">{m.explanation}</p>}
              </li>
            ))}
          </ul>
          <Link href={`/learn/${courseId}`} className="inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">
            Back to the lessons to review these ›
          </Link>
        </div>
      ) : null;

    if (!passed) {
      return (
        <div className="mx-auto max-w-lg space-y-3">
          <div className="card space-y-3 py-8 text-center border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-5xl font-extrabold tracking-tight text-amber-600" data-testid="quiz-score">{score}%</p>
            <p className="text-sm text-amber-800">
              You need {QUIZ_PASS}% to unlock the next lesson. {correctCount} of {total} correct.
            </p>
            <p className="text-xs text-ink-500">Review the focus areas below, then try again — this is how mastery sticks.</p>
            <div className="flex justify-center gap-2 pt-1">
              <button onClick={retake} className="btn-primary">Retake quiz</button>
              <Link href={`/learn/${courseId}`} className="btn-ghost">Review the course</Link>
            </div>
          </div>
          {missedReview}
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg space-y-3">
        <div className="card space-y-3 py-8 text-center">
          <Celebrate xp={XP.lessonComplete} />
          <h1 className="text-xl font-bold">Quiz passed 🎉</h1>
          <p className="text-6xl font-extrabold tracking-tight text-brand-600" data-testid="quiz-score">
            {score}%
          </p>
          <p className="text-sm text-ink-500">
            {correctCount} of {total} correct{pending ? " · saving…" : ""}
          </p>
          <Link href={`/learn/${courseId}`} className="btn-primary inline-block">Continue</Link>
        </div>
        {missedReview}
      </div>
    );
  }

  const answered = i + (picked !== null ? 1 : 0);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        {/* Assessment top bar: exit on both ends, lesson title centered. */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/learn/${courseId}`}
            aria-label="Exit quiz"
            className="text-lg leading-none text-ink-500 transition hover:text-ink-900"
          >
            ✕
          </Link>
          <span className="min-w-0 truncate text-xs font-medium text-ink-500">{title}</span>
          <Link
            href={`/learn/${courseId}`}
            className="text-xs font-medium text-ink-500 transition hover:text-ink-900"
          >
            Exit
          </Link>
        </div>
        {/* Opening diagnostic is optional — always offer a way straight to the
            reading/lessons (the sidebar is hidden on mobile). */}
        {skipToLessonsHref && (
          <div className="rounded-xl border border-brand-500/20 bg-brand-50 px-3 py-2 text-xs text-ink-700 dark:bg-brand-500/10">
            This quick placement check is optional.{" "}
            <Link href={skipToLessonsHref} className="font-semibold text-brand-600 underline">
              Skip to the lessons →
            </Link>
          </div>
        )}
        {/* Segmented progress: one segment per question, filled once answered. */}
        <div className="flex gap-1" aria-hidden>
          {questions.map((_, idx) => (
            <div
              key={idx}
              className={
                "h-1.5 flex-1 rounded-full transition-colors " +
                (idx < answered ? "bg-brand-500" : "bg-black/10")
              }
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ink-500">Question {i + 1} of {total}</p>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">
              Score {correctCount * 30}
            </span>
            {streakDays != null && (
              <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-semibold text-ink-500">
                🔥 {streakDays}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start lg:gap-4">
        <div className="min-w-0 space-y-4">
          <div className="card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              Choose the correct answer
            </p>
            <p className="mt-1 font-medium" data-testid="quiz-prompt">{q.prompt}</p>
          </div>

          <div className="space-y-2" data-testid="quiz-options">
            {(q.options ?? []).map((opt, idx) => {
              const isPicked = picked === idx;
              const isAnswer = idx === q.answer;
              const revealed = picked !== null;
              const letter = String.fromCharCode(65 + idx);
              let cardCls: string;
              let badgeCls: string;
              if (revealed && isAnswer) {
                cardCls = "border-green-400 bg-green-50 ring-1 ring-green-400";
                badgeCls = "bg-green-500 text-white";
              } else if (revealed && isPicked) {
                cardCls = "border-red-400 bg-red-50 ring-1 ring-red-400";
                badgeCls = "bg-red-500 text-white";
              } else if (isPicked) {
                cardCls = "ring-2 ring-brand-500";
                badgeCls = "bg-brand-500 text-white";
              } else if (revealed) {
                cardCls = "opacity-60";
                badgeCls = "bg-black/5 text-ink-500";
              } else {
                cardCls = "hover:border-brand-500/40 hover:ring-1 hover:ring-brand-500/40";
                badgeCls = "bg-black/5 text-ink-500";
              }
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => pick(idx)}
                  disabled={revealed}
                  className={`card flex w-full items-center gap-3 text-left text-sm transition ${cardCls}`}
                >
                  <span
                    aria-hidden
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${badgeCls}`}
                  >
                    {letter}
                  </span>
                  <span className="flex-1">{opt}</span>
                  {revealed && isAnswer && <span className="font-semibold text-green-600">✓</span>}
                  {revealed && isPicked && !isAnswer && <span className="font-semibold text-red-600">✕</span>}
                </button>
              );
            })}
          </div>

          {picked !== null && (
            <div className="space-y-3">
              {q.explanation && (
                <div className="card border-l-4 border-l-green-500" data-testid="quiz-explanation">
                  <p className="flex items-center gap-2 text-sm font-semibold text-green-700">
                    <span aria-hidden>✓</span> Why this is correct
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-700">{q.explanation}</p>
                </div>
              )}
              <button type="button" onClick={next} className="btn-primary w-full" data-testid="quiz-next">
                {i + 1 >= total ? "See results" : "Next Question"}
              </button>
            </div>
          )}
        </div>

        {/* Desktop-only tip: the question's explanation once answered,
            otherwise a generic study tip. */}
        <aside className="hidden lg:block">
          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Tip</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              {picked !== null && q.explanation
                ? q.explanation
                : "Read every option before choosing — distractors are designed to feel right."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
