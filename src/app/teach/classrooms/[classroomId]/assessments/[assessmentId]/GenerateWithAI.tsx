"use client";
import { useState, useTransition } from "react";
import { generateQuestions } from "../actions";

export function GenerateWithAI({ classroomId, assessmentId }: { classroomId: string; assessmentId: string }) {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    if (!topic.trim()) return;
    setNote(null);
    start(async () => {
      try {
        const res = await generateQuestions({ classroomId, assessmentId, topic: topic.trim(), count });
        if (res.offline) setNote("AI generation is offline — set ANTHROPIC_API_KEY to enable it.");
        else { setNote(`✓ Added ${res.added} question${res.added === 1 ? "" : "s"}.`); setTopic(""); }
      } catch (e: any) {
        setNote(e?.message ?? "Generation failed — try again.");
      }
    });
  }

  return (
    <div className="card space-y-2 border-brand-500/20 bg-brand-50/40 dark:bg-brand-500/5">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">✨ Generate questions with AI</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 text-sm">
          <span className="block text-xs text-ink-500">Topic</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Spanish A2 — ser vs estar" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-ink-500">How many</span>
          <input type="number" min={1} max={15} value={count} onChange={(e) => setCount(Number(e.target.value) || 5)} className="w-20 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
        </label>
        <button type="button" onClick={go} disabled={pending || !topic.trim()} className="btn-primary text-sm">
          {pending ? "Generating…" : "Generate"}
        </button>
      </div>
      {note && <p className="text-xs text-ink-600">{note}</p>}
      <p className="text-[11px] text-ink-400">Review generated questions and keys below before publishing.</p>
    </div>
  );
}
