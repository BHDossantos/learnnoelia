"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveResponse, submitAttempt } from "../actions";

type Q = { id: string; kind: "mcq" | "multi" | "short" | "written"; prompt: string; options: string[] | null; points: number };
type ResponseMap = Record<string, any>;

export function AttemptClient({
  assessmentId, attemptId, title, timeLimitMinutes, startedAt, questions, initialResponses,
}: {
  assessmentId: string;
  attemptId: string;
  title: string;
  timeLimitMinutes: number | null;
  startedAt: string;
  questions: Q[];
  initialResponses: ResponseMap;
}) {
  const [responses, setResponses] = useState<ResponseMap>(initialResponses);
  const [saving, setSaving] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Debounced autosave per question.
  function update(qid: string, value: any) {
    setResponses((r) => ({ ...r, [qid]: value }));
    clearTimeout(timers.current[qid]);
    timers.current[qid] = setTimeout(async () => {
      setSaving(true);
      try { await saveResponse({ attemptId, questionId: qid, response: value }); } catch {}
      setSaving(false);
    }, 500);
  }

  // Countdown + auto-submit on expiry.
  const endAt = useMemo(
    () => (timeLimitMinutes ? new Date(startedAt).getTime() + timeLimitMinutes * 60_000 : null),
    [timeLimitMinutes, startedAt],
  );
  const [remaining, setRemaining] = useState<number | null>(endAt ? endAt - Date.now() : null);
  useEffect(() => {
    if (!endAt) return;
    const t = setInterval(() => {
      const r = endAt - Date.now();
      setRemaining(r);
      if (r <= 0) { clearInterval(t); formRef.current?.requestSubmit(); }
    }, 1000);
    return () => clearInterval(t);
  }, [endAt]);

  const mins = remaining != null ? Math.max(0, Math.floor(remaining / 60000)) : null;
  const secs = remaining != null ? Math.max(0, Math.floor((remaining % 60000) / 1000)) : null;
  const answeredCount = questions.filter((q) => responses[q.id] != null && responses[q.id] !== "").length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-xs text-ink-500">{answeredCount}/{questions.length} answered · {saving ? "saving…" : "saved"}</p>
        </div>
        {remaining != null && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${remaining < 60000 ? "bg-red-100 text-red-700" : "bg-black/5 text-ink-700"}`}>
            ⏱ {mins}:{String(secs).padStart(2, "0")}
          </span>
        )}
      </header>

      {questions.map((q, i) => (
        <div key={q.id} className="card space-y-2">
          <p className="text-sm font-medium">{i + 1}. {q.prompt} <span className="text-xs text-ink-400">({q.points} pt{q.points === 1 ? "" : "s"})</span></p>

          {q.kind === "mcq" && (q.options ?? []).map((opt, j) => (
            <label key={j} className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm">
              <input type="radio" name={q.id} checked={responses[q.id]?.index === j} onChange={() => update(q.id, { index: j })} />
              <span>{String.fromCharCode(65 + j)}. {opt}</span>
            </label>
          ))}

          {q.kind === "multi" && (q.options ?? []).map((opt, j) => {
            const chosen: number[] = Array.isArray(responses[q.id]?.indices) ? responses[q.id].indices : [];
            return (
              <label key={j} className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(j)}
                  onChange={() => {
                    const next = chosen.includes(j) ? chosen.filter((x) => x !== j) : [...chosen, j];
                    update(q.id, { indices: next });
                  }}
                />
                <span>{String.fromCharCode(65 + j)}. {opt}</span>
              </label>
            );
          })}

          {q.kind === "short" && (
            <input
              value={responses[q.id]?.text ?? ""}
              onChange={(e) => update(q.id, { text: e.target.value })}
              placeholder="Your answer"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:bg-white/5"
            />
          )}

          {q.kind === "written" && (
            <textarea
              value={responses[q.id]?.text ?? ""}
              onChange={(e) => update(q.id, { text: e.target.value })}
              rows={5}
              placeholder="Write your response…"
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:bg-white/5"
            />
          )}
        </div>
      ))}

      <form ref={formRef} action={submitAttempt}>
        <input type="hidden" name="attemptId" value={attemptId} />
        <button className="btn-primary w-full">Submit assessment</button>
        <p className="mt-1 text-center text-xs text-ink-400">You can&apos;t change answers after submitting.</p>
      </form>
    </div>
  );
}
