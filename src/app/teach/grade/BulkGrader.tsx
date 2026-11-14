"use client";
import { useRef, useState } from "react";

type Student = { id: string; name: string };
type Classroom = { id: string; name: string };

type EmailState = { busy?: boolean; msg?: string; needInput?: "student" | "guardian" };

type Item = {
  key: string;
  file: File;
  status: "pending" | "grading" | "done" | "needsStudent" | "error";
  error?: string;
  paperId?: string;
  studentName?: string;
  created?: boolean;
  score?: number | null;
  maxScore?: number | null;
  focus?: string[];
  assignStudentId?: string;
  email?: EmailState;
};

const ACCEPT =
  "image/*,.pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function BulkGrader({ classrooms, students }: { classrooms: Classroom[]; students: Student[] }) {
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [maxScore, setMaxScore] = useState(100);
  const [answerKey, setAnswerKey] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [offline, setOffline] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Item[] = Array.from(list).map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      status: "pending",
    }));
    setItems((cur) => [...cur, ...next]);
  }

  function patch(key: string, p: Partial<Item>) {
    setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }

  async function gradeOne(it: Item, studentId?: string) {
    patch(it.key, { status: "grading", error: undefined });
    const fd = new FormData();
    fd.set("file", it.file);
    fd.set("classroomId", classroomId);
    if (subject.trim()) fd.set("subject", subject.trim());
    if (title.trim()) fd.set("title", title.trim());
    fd.set("maxScore", String(maxScore));
    if (answerKey.trim()) fd.set("answerKey", answerKey.trim());
    if (studentId) fd.set("studentId", studentId);

    try {
      const res = await fetch("/api/teach/grade-file", { method: "POST", body: fd });
      if (res.status === 503) {
        const j = await res.json().catch(() => ({}));
        if (j.offline) setOffline(true);
        patch(it.key, { status: "error", error: j.error ?? "Grading is offline (no API key)." });
        return;
      }
      const j = await res.json();
      if (!res.ok) {
        patch(it.key, { status: "error", error: j.error ?? "Grading failed." });
        return;
      }
      if (j.needsStudent) {
        patch(it.key, { status: "needsStudent", score: j.grade?.score ?? null, maxScore: j.grade?.max_score ?? maxScore });
        return;
      }
      patch(it.key, {
        status: "done",
        paperId: j.id,
        studentName: j.student?.displayName ?? "Student",
        created: !!j.student?.created,
        score: j.grade?.score ?? null,
        maxScore: j.grade?.max_score ?? maxScore,
        focus: Array.isArray(j.grade?.focus_areas) ? j.grade.focus_areas : [],
      });
    } catch (err: any) {
      patch(it.key, { status: "error", error: err?.message ?? "Network error." });
    }
  }

  async function gradeAll() {
    if (!classroomId || running) return;
    setRunning(true);
    // Grade sequentially so progress is visible and rate limits are respected.
    for (const it of items) {
      if (it.status === "pending") {
        // read latest copy each loop isn't needed; file is stable
        // eslint-disable-next-line no-await-in-loop
        await gradeOne(it);
      }
    }
    setRunning(false);
  }

  async function sendEmail(it: Item, audience: "student" | "guardian", to?: string) {
    if (!it.paperId) return;
    patch(it.key, { email: { busy: true } });
    try {
      const res = await fetch(`/api/papers/${it.paperId}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience, ...(to ? { to } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.needsEmail) {
        patch(it.key, { email: { needInput: audience } });
        return;
      }
      if (j.fallback && j.mailto) {
        window.location.href = j.mailto;
        patch(it.key, { email: { msg: `Opening your mail app for ${j.to}` } });
        return;
      }
      if (j.sent) {
        patch(it.key, { email: { msg: `Sent to ${j.to}` } });
        return;
      }
      patch(it.key, { email: { msg: j.error ?? "Could not send." } });
    } catch (err: any) {
      patch(it.key, { email: { msg: err?.message ?? "Network error." } });
    }
  }

  const pending = items.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-4">
      {offline && (
        <p className="card border-amber-300 bg-amber-50 text-sm text-amber-800">
          Grading needs an ANTHROPIC_API_KEY on the server. Add it and try again.
        </p>
      )}

      {classrooms.length === 0 ? (
        <p className="card text-sm text-ink-500">
          You don't have a classroom yet. Create one in your school workspace first — bulk grading
          enrolls new students into the classroom you pick.
        </p>
      ) : (
        <>
          <div className="card space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Classroom</span>
                <select
                  value={classroomId}
                  onChange={(e) => setClassroomId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 dark:bg-white/5"
                >
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Subject (optional)</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Algebra, Biology"
                  className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 dark:bg-white/5"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Assignment title (optional)</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Unit 3 Test"
                  className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 dark:bg-white/5"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Out of</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 dark:bg-white/5"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Answer key / rubric (optional)</span>
              <textarea
                value={answerKey}
                onChange={(e) => setAnswerKey(e.target.value)}
                rows={2}
                placeholder="Paste the answer key or rubric to grade against. Leave blank to grade on expertise."
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:bg-white/5"
              />
            </label>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="card flex flex-col items-center justify-center gap-2 border-2 border-dashed border-black/15 py-8 text-center"
          >
            <p className="text-sm text-ink-600">Drop student papers here, or</p>
            <button onClick={() => fileRef.current?.click()} className="btn-ghost text-sm">
              Choose files
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <p className="text-xs text-ink-400">Photos (even a napkin or whiteboard), scans, PDFs, or PowerPoint. One paper per file.</p>
          </div>

          {items.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-500">{items.length} file{items.length === 1 ? "" : "s"} · {pending} to grade</p>
              <div className="flex gap-2">
                <button onClick={() => setItems([])} className="btn-ghost text-sm" disabled={running}>Clear</button>
                <button onClick={gradeAll} className="btn-primary text-sm" disabled={running || pending === 0}>
                  {running ? "Grading…" : `Grade ${pending || ""} paper${pending === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.key} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.file.name}</p>
                    {it.status === "done" && (
                      <p className="text-xs text-ink-500">
                        {it.studentName}
                        {it.created && (
                          <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                            new account
                          </span>
                        )}
                      </p>
                    )}
                    {it.status === "error" && <p className="text-xs text-red-600">{it.error}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    {it.status === "grading" && <span className="text-xs text-ink-500">Grading…</span>}
                    {it.status === "pending" && <span className="text-xs text-ink-400">Queued</span>}
                    {(it.status === "done" || it.status === "needsStudent") && it.score != null && (
                      <span className="text-lg font-bold text-brand-600">
                        {it.score}
                        <span className="text-xs font-normal text-ink-500">/{it.maxScore}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* No name detected: let the teacher assign a student, then file it. */}
                {it.status === "needsStudent" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-amber-700">No name found on the paper. Assign a student:</span>
                    <select
                      value={it.assignStudentId ?? ""}
                      onChange={(e) => patch(it.key, { assignStudentId: e.target.value })}
                      className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5"
                    >
                      <option value="">Select…</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => it.assignStudentId && gradeOne(it, it.assignStudentId)}
                      disabled={!it.assignStudentId}
                      className="btn-ghost text-xs"
                    >
                      File grade
                    </button>
                  </div>
                )}

                {it.status === "done" && (
                  <>
                    {it.focus && it.focus.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {it.focus.map((f, i) => (
                          <span key={i} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">{f}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button onClick={() => sendEmail(it, "student")} className="btn-ghost text-xs" disabled={it.email?.busy}>
                        ✉️ Email student
                      </button>
                      <button onClick={() => sendEmail(it, "guardian")} className="btn-ghost text-xs" disabled={it.email?.busy}>
                        ✉️ Email parent
                      </button>
                      <a href={`/papers/${it.paperId}/print`} target="_blank" rel="noreferrer" className="btn-ghost text-xs">
                        🖨️ Print report
                      </a>
                      <a href={`/papers/${it.paperId}`} target="_blank" rel="noreferrer" className="text-xs text-brand-500">
                        Mark & view
                      </a>
                      {it.email?.busy && <span className="text-xs text-ink-500">Sending…</span>}
                      {it.email?.msg && <span className="text-xs text-green-700">{it.email.msg}</span>}
                    </div>
                    {it.email?.needInput && <EmailInput it={it} audience={it.email.needInput} onSend={sendEmail} />}
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EmailInput({
  it,
  audience,
  onSend,
}: {
  it: Item;
  audience: "student" | "guardian";
  onSend: (it: Item, audience: "student" | "guardian", to?: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-500">
        No {audience === "guardian" ? "parent" : "student"} email on file. Enter one:
      </span>
      <input
        type="email"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="name@example.com"
        className="rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:bg-white/5"
      />
      <button onClick={() => val && onSend(it, audience, val)} className="btn-ghost text-xs" disabled={!val}>
        Send
      </button>
    </div>
  );
}
