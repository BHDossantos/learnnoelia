"use client";
import { useRef, useState } from "react";
import Link from "next/link";

type Student = { id: string; name: string };

// Teacher tool: grade a student's paper — typed, or a scan/photo of a physical
// test — on the student's behalf. The result is filed to the student's account
// and the student, their teachers, and their guardians are notified automatically.
export function PaperGrader({ students }: { students: Student[] }) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [maxScore, setMaxScore] = useState(100);
  const [answerKey, setAnswerKey] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ media_type: string; data: string; preview: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<null | "error">(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<any>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onFile(file: File) {
    setStatus(null); setErrorMsg(""); setImage(null);
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setStatus("error"); setErrorMsg("Choose a PDF, JPEG, PNG, WebP, or GIF. For PowerPoint, use Bulk upload."); return;
    }
    if (!file.size || file.size > 3 * 1024 * 1024) {
      setStatus("error"); setErrorMsg("Choose a non-empty file up to 3 MB. Compress larger PDFs or upload fewer pages."); return;
    }
    const reader = new FileReader();
    reader.onerror = () => { setStatus("error"); setErrorMsg("Could not read this file. Please select it again."); };
    reader.onload = () => {
      const url = String(reader.result);
      const data = url.split(",")[1] ?? "";
      const media_type = (url.match(/^data:(.*?);/)?.[1] ?? file.type) || "image/jpeg";
      setImage({ media_type, data, preview: url, name: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (busy || !studentId || (!text.trim() && !image)) return;
    setBusy(true); setStatus(null); setErrorMsg(""); setResult(null); setSavedId(null);
    try {
      const res = await fetch("/api/grade/paper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId,
          title: title.trim() || undefined,
          subject: subject.trim() || undefined,
          maxScore,
          answerKey: answerKey.trim() || undefined,
          text: text.trim() || undefined,
          image: image && image.media_type !== "application/pdf" ? { media_type: image.media_type, data: image.data } : undefined,
          document: image?.media_type === "application/pdf" ? { media_type: "application/pdf", data: image.data } : undefined,
        }),
      });
      const data = await res.json().catch(() => ({ error: res.status === 413 ? "This upload is too large. Please use a smaller file." : "The grading service did not respond. Please try again; your paper is still selected." }));
      if (!res.ok) { setStatus("error"); setErrorMsg(typeof data.error === "string" ? data.error : "Grading failed."); return; }
      setResult(data.grade);
      setSavedId(data.id);
    } catch (e: any) {
      setStatus("error"); setErrorMsg(e?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  if (students.length === 0) {
    return (
      <div className="card text-sm text-ink-500">
        No students found in your classrooms yet. Add students to a classroom first, then grade their papers here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Student</span>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Algebra" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 4 Test" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Out of</span>
          <input type="number" min={1} value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value) || 100)} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />
        </label>
      </div>

      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Answer key / rubric (optional)</span>
        <textarea value={answerKey} onChange={(e) => setAnswerKey(e.target.value)} rows={2} placeholder="Paste the correct answers or marking scheme to grade against. Leave blank to grade on expertise." className="mt-1 w-full rounded-xl border border-black/10 bg-white px-4 py-2 text-sm" />
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold">Upload a PDF or photograph of the work (up to 3 MB)</p>
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="block w-full text-sm" />
        {image && (
          <div className="flex items-center gap-3">
            {image.media_type === "application/pdf" ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm"><strong>PDF ready to grade</strong><p>{image.name}</p></div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.preview} alt="Uploaded paper" className="h-24 rounded-lg border border-black/10" />
            )}
            <button onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ""; }} className="btn-ghost text-xs">Remove</button>
          </div>
        )}
        <p className="text-center text-xs text-ink-500">— or —</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="…type or paste the student's answers instead." className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm" />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy || (!text.trim() && !image)} className="btn-primary px-5 py-2 text-sm">
          {busy ? "Grading…" : "Grade & notify"}
        </button>
        <span className="text-xs text-ink-500">The student, their teachers, and their parents are notified automatically.</span>
      </div>

      {status === "error" && <div role="alert" className="card border border-red-200 bg-red-50 text-sm text-red-700">{errorMsg}</div>}

      {result && (
        <div className="card space-y-3 border-brand-500/30">
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-bold">Graded</p>
            <p className="text-2xl font-extrabold text-brand-600">{result.score}/{result.max_score}</p>
          </div>
          {result.summary_md && <p className="text-sm text-ink-700">{result.summary_md}</p>}
          {Array.isArray(result.focus_areas) && result.focus_areas.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Focus areas</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {result.focus_areas.map((f: string, i: number) => (
                  <span key={i} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">{f}</span>
                ))}
              </div>
            </div>
          )}
          {savedId && <Link href={`/papers/${savedId}`} className="btn-ghost inline-block text-sm">View full feedback & plan →</Link>}
        </div>
      )}
    </div>
  );
}
