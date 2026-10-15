"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { enrollInCourse } from "@/app/learn/actions";

type Question = { prompt: string; options: string[]; topic?: string; difficulty?: number };
type Model = {
  level: string;
  masteredTopics: string[];
  developingTopics: string[];
  gaps: string[];
  misconceptions: string[];
  recommendation: string;
  estimatedHours: number;
};
type Placement = { courseId: string; title: string; reason: string };

export function DiagnosticClient() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [phase, setPhase] = useState<"pick" | "quiz" | "done">("pick");
  const [busy, setBusy] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [model, setModel] = useState<Model | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  async function call(body: unknown) {
    const r = await fetch("/api/diagnostic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 503) { setOffline(true); return null; }
    const data = await r.json();
    if (!r.ok) { setError("Something went wrong — try again."); return null; }
    return data;
  }

  async function start() {
    if (subject.trim().length < 2 || busy) return;
    setBusy(true); setError(null); setOffline(false);
    const data = await call({ action: "start", subject });
    setBusy(false);
    if (data?.questions?.length) { setQuestions(data.questions); setAnswers({}); setPhase("quiz"); }
  }

  async function submit() {
    if (busy) return;
    setBusy(true); setError(null);
    const orderedAnswers = questions.map((_, i) => answers[i] ?? -1);
    const data = await call({ action: "assess", subject, questions, answers: orderedAnswers });
    setBusy(false);
    if (data?.model) { setModel(data.model); setPlacement(data.placement ?? null); setPhase("done"); }
  }

  async function enrollAndStart() {
    if (!placement || enrolling) return;
    setEnrolling(true);
    try {
      await enrollInCourse({ courseId: placement.courseId });
      router.push(`/learn/${placement.courseId}`);
    } catch {
      setEnrolling(false);
      setError("Couldn't enroll just now — open the course from your path.");
    }
  }

  const answeredCount = Object.keys(answers).length;

  if (offline) {
    return (
      <div className="card border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10">
        The diagnostic isn't connected on this deployment yet — it turns on automatically
        once the learning engine is enabled. Meanwhile you can pick any course and start.
      </div>
    );
  }

  if (phase === "pick") {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium">What do you want to be assessed on?</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Spanish, Calculus I, the AWS exam, Python…"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 dark:bg-white/5"
        />
        <div className="flex flex-wrap gap-2">
          {["Spanish", "Calculus I", "Python", "Business Strategy"].map((s) => (
            <button key={s} type="button" onClick={() => setSubject(s)} className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs">
              {s}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={start} disabled={busy || subject.trim().length < 2} className="btn-primary px-6 py-2.5">
          {busy ? "Building your check-up…" : "Start diagnostic"}
        </button>
      </div>
    );
  }

  if (phase === "quiz") {
    return (
      <div className="space-y-4">
        <p className="text-xs text-ink-500">{answeredCount}/{questions.length} answered · {subject}</p>
        {questions.map((q, i) => (
          <div key={i} className="card">
            <p className="text-sm font-medium">{i + 1}. {q.prompt}</p>
            <div className="mt-2 space-y-1.5">
              {q.options.map((opt, j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                  className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    answers[i] === j ? "border-brand-500 bg-brand-50 dark:bg-brand-500/15" : "border-black/10 bg-white dark:bg-white/5"
                  }`}
                >
                  {String.fromCharCode(65 + j)}. {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={submit} disabled={busy || answeredCount < questions.length} className="btn-primary px-6 py-2.5">
          {busy ? "Analyzing…" : "See my results"}
        </button>
      </div>
    );
  }

  // done
  return (
    <div className="space-y-3">
      <div className="card border-brand-500/20 bg-gradient-to-br from-brand-50 to-white dark:from-white/[0.08] dark:to-transparent">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Your level</p>
        <p className="mt-1 text-2xl font-bold">{model?.level}</p>
        <p className="mt-1 text-sm text-ink-700">{model?.recommendation}</p>
        {typeof model?.estimatedHours === "number" && (
          <p className="mt-1 text-xs text-ink-500">Estimated ~{model.estimatedHours} hours to your goal.</p>
        )}
      </div>
      <ModelList title="✅ Already solid" items={model?.masteredTopics} />
      <ModelList title="🟡 Developing" items={model?.developingTopics} />
      <ModelList title="🧩 Gaps to fill first" items={model?.gaps} />
      <ModelList title="⚠️ Misconceptions to fix" items={model?.misconceptions} />

      {placement && (
        <div className="card border-brand-500/30 bg-brand-50/60 dark:bg-brand-500/10">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Start here</p>
          <p className="mt-1 text-base font-semibold text-ink-900">{placement.title}</p>
          {placement.reason && <p className="mt-0.5 text-sm text-ink-600">{placement.reason}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={enrollAndStart} disabled={enrolling} className="btn-primary px-5 py-2.5">
              {enrolling ? "Enrolling…" : "Enroll & start learning"}
            </button>
            <Link href={`/learn/${placement.courseId}`} className="btn-ghost px-5 py-2.5">Preview course</Link>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        {!placement && <Link href="/learn" className="btn-primary px-5 py-2.5">Start my path</Link>}
        <button
          onClick={() => { setPhase("pick"); setModel(null); setPlacement(null); setSubject(""); setError(null); }}
          className="btn-ghost px-5 py-2.5"
        >
          Assess another subject
        </button>
      </div>
    </div>
  );
}

function ModelList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}
