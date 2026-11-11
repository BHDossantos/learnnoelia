"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ImportQuestions({ classroomId, assessmentId }: { classroomId: string; assessmentId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function go() {
    const file = fileRef.current?.files?.[0];
    if (!file && !text.trim()) { setNote("Upload a file or paste the test text."); return; }
    setBusy(true); setNote(null);
    const fd = new FormData();
    fd.set("classroomId", classroomId);
    fd.set("assessmentId", assessmentId);
    if (file) fd.set("file", file);
    if (text.trim()) fd.set("text", text.trim());
    try {
      const r = await fetch("/api/teach/assessments/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) setNote(d.error ?? "Import failed.");
      else {
        setNote(`✓ Imported ${d.added} question${d.added === 1 ? "" : "s"} — review the keys below.`);
        setText("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch { setNote("Import failed — try again."); }
    setBusy(false);
  }

  return (
    <div className="card space-y-2 border-black/10">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">📄 Import from an existing test</p>
      <p className="text-xs text-ink-500">Upload a PDF, image, or PowerPoint of a test — or paste its text — and AI turns it into questions with keys.</p>
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pptx,.txt" className="block w-full text-sm" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="…or paste the test text here" className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:bg-white/5" />
      <div className="flex items-center gap-2">
        <button type="button" onClick={go} disabled={busy} className="btn-ghost border border-black/10 text-sm dark:border-white/10">
          {busy ? "Importing…" : "Import questions"}
        </button>
        {note && <span className="text-xs text-ink-600">{note}</span>}
      </div>
    </div>
  );
}
