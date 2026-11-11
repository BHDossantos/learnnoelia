"use client";
import { useState } from "react";
import { setWrittenScore, aiGradeWritten, publishAttempt } from "../../../actions";

type Item = {
  id: string;
  kind: "mcq" | "multi" | "short" | "written" | "truefalse" | "numeric";
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
  const [publishing, setPublishing] = useState(false);
  const [unsaved, setUnsaved] = useState<Set<string>>(() => new Set(
    items.filter(item => item.kind === "written" && item.pointsAwarded == null).map(item => item.id),
  ));
  function markUnsaved(id: string, dirty: boolean) {
    setUnsaved(previous => {
      const next = new Set(previous);
      if (dirty) next.add(id); else next.delete(id);
      return next;
    });
  }
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.id} className="card space-y-2">
          <p className="text-sm font-medium">{i + 1}. {it.prompt} <span className="text-xs text-ink-400">({it.points} pt{it.points === 1 ? "" : "s"})</span></p>
          <p className="text-sm"><span className="text-ink-500">Answer:</span> <span className="font-medium">{it.answerText}</span></p>

          {it.kind === "written" ? (
            <WrittenGrader onDirty={dirty => markUnsaved(it.id, dirty)} locked={published || publishing} classroomId={classroomId} assessmentId={assessmentId} attemptId={attemptId} item={it} />
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

      <form action={async data => {
        setPublishing(true);
        try { await publishAttempt(data); } finally { setPublishing(false); }
      }} className="pt-1">
        <input type="hidden" name="classroomId" value={classroomId} />
        <input type="hidden" name="attemptId" value={attemptId} />
        <button disabled={published || publishing || unsaved.size > 0} className="btn-primary w-full">{published ? "Results published — scores locked" : "Publish results"}</button>
        {unsaved.size > 0 && !published && <p role="status" className="text-sm text-amber-700">Save every written score before publishing results.</p>}
        <p className="mt-1 text-center text-xs text-ink-400">Totals every question and sends the score to the gradebook (and the student).</p>
      </form>
    </div>
  );
}

function WrittenGrader({
  classroomId, assessmentId, attemptId, item, locked, onDirty,
}: {
  classroomId: string;
  assessmentId: string;
  attemptId: string;
  item: Item;
  locked: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const [points, setPoints] = useState<string>(item.pointsAwarded != null ? String(item.pointsAwarded) : "");
  const [feedback, setFeedback] = useState(item.feedback);
  const [saved, setSaved] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);

  async function save() {
    onDirty(true);
    setPending(true);
    try {
      await setWrittenScore({ classroomId, attemptId, questionId: item.id, points: Number(points) || 0, feedback });
      onDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e: any) {
      setAiNote(e?.message ?? "Could not save.");
    } finally { setPending(false); }
  }

  async function suggest() {
    onDirty(true);
    setAiNote(null);
    setAiPending(true);
    try {
      const res = await aiGradeWritten({ classroomId, questionId: item.id, attemptId });
      if (res.offline) { setAiNote("AI grading is offline (no API key) — grade manually."); return; }
      setPoints(String(res.score));
      setFeedback(res.feedback);
      setAiNote("AI suggestion filled in — review and Save.");
    } catch {
      setAiNote("AI suggestion failed — grade manually.");
    } finally { setAiPending(false); }
  }

  return (
    <fieldset disabled={locked || pending || aiPending} className="space-y-2 rounded-lg border border-black/5 bg-black/[0.02] p-2 dark:bg-white/[0.02]">
      {item.correctText && <p className="text-xs text-ink-500"><span className="font-semibold">Rubric:</span> {item.correctText}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-ink-500">Points (/{item.points})</span>
          <input type="number" min={0} max={item.points} value={points} onChange={(e) => { onDirty(true); setPoints(e.target.value); }} className="w-24 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
        </label>
        <button type="button" onClick={suggest} disabled={aiPending} className="btn-ghost border border-black/10 text-xs dark:border-white/10">
          {aiPending ? "Thinking…" : "✨ AI suggest"}
        </button>
        <button type="button" onClick={save} disabled={pending} className="btn-primary text-xs">
          {pending ? "Saving…" : saved ? "Saved ✓" : "Save score"}
        </button>
      </div>
      <textarea value={feedback} onChange={(e) => { onDirty(true); setFeedback(e.target.value); }} rows={2} placeholder="Feedback for the student (optional)" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5" />
      {aiNote && <p className="text-xs text-ink-500">{aiNote}</p>}
    </fieldset>
  );
}
