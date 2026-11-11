"use client";
import { useState, useTransition } from "react";
import { setWrittenScore, aiGradeWritten, publishAttempt } from "../../../actions";

type Item = {
  id: string;
  kind: "mcq" | "multi" | "short" | "written";
  prompt: string;
  points: number;
  answerText: string;
  correctText: string;
  pointsAwarded: number | null;
  isCorrect: boolean | null;
  feedback: string;
};

export function ReviewClient({
  classroomId, assessmentId, attemptId, items, published,
}: {
  classroomId: string;
  assessmentId: string;
  attemptId: string;
  items: Item[];
  published: boolean;
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.id} className="card space-y-2">
          <p className="text-sm font-medium">{i + 1}. {it.prompt} <span className="text-xs text-ink-400">({it.points} pt{it.points === 1 ? "" : "s"})</span></p>
          <p className="text-sm"><span className="text-ink-500">Answer:</span> <span className="font-medium">{it.answerText}</span></p>

          {it.kind === "written" ? (
            <WrittenGrader classroomId={classroomId} assessmentId={assessmentId} attemptId={attemptId} item={it} />
          ) : (
            <p className="text-sm">
              <span className="text-ink-500">Correct:</span> <span className="font-medium text-green-700">{it.correctText}</span>{" · "}
              <span className={it.isCorrect ? "text-green-600" : "text-red-600"}>
                {it.pointsAwarded ?? 0}/{it.points} {it.isCorrect ? "✓" : "✗"}
              </span>
            </p>
          )}
        </div>
      ))}

      <form action={publishAttempt} className="pt-1">
        <input type="hidden" name="classroomId" value={classroomId} />
        <input type="hidden" name="attemptId" value={attemptId} />
        <button className="btn-primary w-full">{published ? "Re-publish results" : "Publish results"}</button>
        <p className="mt-1 text-center text-xs text-ink-400">Totals every question and sends the score to the gradebook (and the student).</p>
      </form>
    </div>
  );
}

function WrittenGrader({
  classroomId, assessmentId, attemptId, item,
}: {
  classroomId: string;
  assessmentId: string;
  attemptId: string;
  item: Item;
}) {
  const [points, setPoints] = useState<string>(item.pointsAwarded != null ? String(item.pointsAwarded) : "");
  const [feedback, setFeedback] = useState(item.feedback);
  const [saved, setSaved] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [aiPending, startAi] = useTransition();

  function save() {
    start(async () => {
      try {
        await setWrittenScore({ classroomId, attemptId, questionId: item.id, points: Number(points) || 0, feedback });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (e: any) {
        setAiNote(e?.message ?? "Could not save.");
      }
    });
  }

  function suggest() {
    setAiNote(null);
    startAi(async () => {
      try {
        const res = await aiGradeWritten({ classroomId, questionId: item.id, attemptId });
        if (res.offline) { setAiNote("AI grading is offline (no API key) — grade manually."); return; }
        setPoints(String(res.score));
        setFeedback(res.feedback);
        setAiNote("AI suggestion filled in — review and Save.");
      } catch {
        setAiNote("AI suggestion failed — grade manually.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/5 bg-black/[0.02] p-2 dark:bg-white/[0.02]">
      {item.correctText && <p className="text-xs text-ink-500"><span className="font-semibold">Rubric:</span> {item.correctText}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-ink-500">Points (/{item.points})</span>
          <input type="number" min={0} max={item.points} value={points} onChange={(e) => setPoints(e.target.value)} className="w-24 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
        </label>
        <button type="button" onClick={suggest} disabled={aiPending} className="btn-ghost border border-black/10 text-xs dark:border-white/10">
          {aiPending ? "Thinking…" : "✨ AI suggest"}
        </button>
        <button type="button" onClick={save} disabled={pending} className="btn-primary text-xs">
          {pending ? "Saving…" : saved ? "Saved ✓" : "Save score"}
        </button>
      </div>
      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Feedback for the student (optional)" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
      {aiNote && <p className="text-xs text-ink-500">{aiNote}</p>}
    </div>
  );
}
