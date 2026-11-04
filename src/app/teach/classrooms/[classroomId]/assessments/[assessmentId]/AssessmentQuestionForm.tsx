"use client";
import { useState, useTransition } from "react";
import { addQuestion } from "../actions";

type Kind = "mcq" | "multi" | "short" | "written";

export function AssessmentQuestionForm({
  classroomId, assessmentId,
}: {
  classroomId: string;
  assessmentId: string;
}) {
  const [kind, setKind] = useState<Kind>("mcq");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState(1);
  const [optionLines, setOptionLines] = useState("Option A\nOption B\nOption C\nOption D");
  const [correctIndex, setCorrectIndex] = useState(0);
  const [correctMulti, setCorrectMulti] = useState<Set<number>>(new Set([0]));
  const [correctText, setCorrectText] = useState("");
  const [rubric, setRubric] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const options = optionLines.split("\n").map((l) => l.trim()).filter(Boolean);
  const needsOptions = kind === "mcq" || kind === "multi";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!prompt.trim()) { setError("Enter a question prompt."); return; }
    if (needsOptions && options.length < 2) { setError("Add at least two options."); return; }
    start(async () => {
      try {
        await addQuestion({
          classroomId,
          assessmentId,
          kind,
          prompt: prompt.trim(),
          points,
          options: needsOptions ? options : undefined,
          correctIndex: kind === "mcq" ? correctIndex : undefined,
          correctIndices: kind === "multi" ? [...correctMulti] : undefined,
          correctText: kind === "short" ? correctText.trim() : undefined,
          rubric: kind === "written" ? rubric.trim() : undefined,
        });
        // Reset for the next question.
        setPrompt(""); setCorrectText(""); setRubric("");
        setOptionLines("Option A\nOption B\nOption C\nOption D");
        setCorrectIndex(0); setCorrectMulti(new Set([0]));
      } catch (err: any) {
        setError(err?.message ?? "Could not add the question.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Add a question</p>

      <div className="flex flex-wrap gap-2">
        <label className="text-sm">
          <span className="block text-xs text-ink-500">Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5">
            <option value="mcq">Multiple choice (one answer)</option>
            <option value="multi">Multiple choice (several answers)</option>
            <option value="short">Short answer (auto-graded)</option>
            <option value="written">Written (AI + teacher review)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-ink-500">Points</span>
          <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} className="w-24 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
        </label>
      </div>

      <label className="block text-sm">
        <span className="block text-xs text-ink-500">Question</span>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
      </label>

      {needsOptions && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-xs text-ink-500">Options (one per line)</span>
            <textarea value={optionLines} onChange={(e) => setOptionLines(e.target.value)} rows={4} className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 font-mono text-xs dark:bg-white/5" />
          </label>
          <div className="text-sm">
            <span className="block text-xs text-ink-500">Correct answer{kind === "multi" ? "s" : ""}</span>
            <ul className="mt-1 space-y-1">
              {options.map((opt, i) => (
                <li key={i}>
                  <label className="flex items-center gap-2">
                    {kind === "mcq" ? (
                      <input type="radio" name="correct" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
                    ) : (
                      <input
                        type="checkbox"
                        checked={correctMulti.has(i)}
                        onChange={() => setCorrectMulti((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                      />
                    )}
                    <span className="truncate">{String.fromCharCode(65 + i)}. {opt}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {kind === "short" && (
        <label className="block text-sm">
          <span className="block text-xs text-ink-500">Accepted answer(s) — separate alternatives with |</span>
          <input value={correctText} onChange={(e) => setCorrectText(e.target.value)} placeholder="hola|buenos dias" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
        </label>
      )}

      {kind === "written" && (
        <label className="block text-sm">
          <span className="block text-xs text-ink-500">Grading rubric (used by the AI grader + teacher review)</span>
          <textarea value={rubric} onChange={(e) => setRubric(e.target.value)} rows={3} placeholder="What a full-credit answer must include…" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={pending} className="btn-primary text-sm">{pending ? "Adding…" : "Add question"}</button>
    </form>
  );
}
