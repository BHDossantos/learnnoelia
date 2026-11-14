"use client";

import { useEffect, useRef, useState } from "react";
import { markingTextLines, markLabel, normalizedPoint, type Mark, type MarkingDocument, type MarkingSource } from "@/lib/markings";

type Loaded = { source: MarkingSource; documents: MarkingDocument[]; urls: Record<string, string> };

export function MarkingWorkspace({ kind, targetId, readOnly = false }: { kind: "paper" | "submission"; targetId: string; readOnly?: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setError("");
    fetch(`/api/markings?kind=${kind}&id=${targetId}`, { cache: "no-store" })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; })
      .then(data => { if (!cancelled) setLoaded(data); })
      .catch(e => { if (!cancelled) setError(e.message || "Could not load markings"); });
    return () => { cancelled = true; };
  }, [kind, targetId, attempt]);
  if (error) return <section className="card"><p role="alert">{error}</p><button type="button" className="btn-ghost" onClick={() => setAttempt(n => n + 1)}>Retry loading markings</button></section>;
  if (!loaded) return <p role="status" className="text-sm">Loading teacher markings…</p>;
  return <MarkingEditor key={`${kind}:${targetId}:${attempt}`} kind={kind} targetId={targetId} loaded={loaded} readOnly={readOnly} />;
}

// Exported to exercise the actual editor with synthetic work in browser tests.
export function MarkingEditor({ kind, targetId, loaded, readOnly = false }: { kind: "paper" | "submission"; targetId: string; loaded: Loaded; readOnly?: boolean }) {
  const [documents, setDocuments] = useState(loaded.documents);
  const [sourceKey, setSourceKey] = useState(loaded.source.source_key);
  const currentDocument = documents.find(d => d.source_key === sourceKey);
  const initial = loaded.documents.find(d => d.source_key === loaded.source.source_key);
  const [marks, setMarks] = useState<Mark[]>(initial?.marks ?? []);
  const [saved, setSaved] = useState(JSON.stringify(initial?.marks ?? []));
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [past, setPast] = useState<Mark[][]>([]);
  const [future, setFuture] = useState<Mark[][]>([]);
  const [tool, setTool] = useState<Mark["kind"]>("check");
  const [earned, setEarned] = useState("3");
  const [possible, setPossible] = useState("6");
  const [zoom, setZoom] = useState(0.75);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const dirty = JSON.stringify(marks) !== saved;
  const historical = sourceKey !== loaded.source.source_key;
  const editable = loaded.source.can_edit && !readOnly && !historical;
  const source = historical ? { text: currentDocument?.source_text, file: currentDocument?.source_file, mime: currentDocument?.source_mime } : loaded.source;
  const image = !!source.file && (/^image\/(jpeg|png|gif|webp)$/.test(source.mime ?? "") || /\.(jpe?g|png|gif|webp)$/i.test(source.file));
  const fileUrl = source.file ? loaded.urls[source.file] : undefined;
  const validScore = earned.trim() !== "" && possible.trim() !== "" && Number.isFinite(Number(earned)) && Number(earned) >= 0 && Number(earned) <= 10000 && Number.isFinite(Number(possible)) && Number(possible) > 0 && Number(possible) <= 10000;

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]") && !window.confirm("Leave without saving your markings?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);

  function change(next: Mark[]) {
    if (!editable || busy) return;
    setPast(p => [...p.slice(-49), marks]); setFuture([]); setMarks(next); setMessage("");
  }
  function add(surface: Mark["surface"], x: number, y: number) {
    if (!editable || busy || marks.length >= 500 || (tool === "score" && !validScore)) return;
    const position = { id: crypto.randomUUID(), surface, x, y };
    change([...marks, tool === "score" ? { ...position, kind: "score", earned: Number(earned), possible: Number(possible) } : { ...position, kind: tool }]);
  }
  function switchSource(key: string) {
    if (dirty && !window.confirm("Discard unsaved markings before switching versions?")) return;
    const document = documents.find(d => d.source_key === key);
    setSourceKey(key); setMarks(document?.marks ?? []); setSaved(JSON.stringify(document?.marks ?? []));
    setVersion(document?.version ?? 0); setPast([]); setFuture([]); setMessage("");
  }
  async function save() {
    if (!editable || busy || !dirty) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/markings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id: targetId, sourceKey, version, marks }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save markings");
      setVersion(data.document.version); setSaved(JSON.stringify(marks));
      setDocuments(d => [...d.filter(x => x.source_key !== sourceKey), data.document]);
      setMessage("Markings saved. Students can now see them.");
    } catch (e) { setFailed(true); setMessage(e instanceof Error ? e.message : "Save failed. Your edits are still here."); }
    finally { setBusy(false); }
  }
  return <section className="card space-y-3" aria-label="Teacher markings">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Teacher markings</h2>
      <label className="text-sm print:hidden">Zoom <select aria-label="Marking zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="rounded border p-1">
        {[0.5, 0.75, 1, 1.25, 1.5].map(z => <option key={z} value={z}>{z * 100}%</option>)}
      </select></label>
    </div>
    {documents.some(d => d.source_key !== loaded.source.source_key) && <label className="block text-sm">Work version <select aria-label="Work version" disabled={busy} value={sourceKey} onChange={e => switchSource(e.target.value)} className="ml-2 rounded border p-1">
      <option value={loaded.source.source_key}>Current submission</option>
      {documents.filter(d => d.source_key !== loaded.source.source_key).map(d => <option key={d.source_key} value={d.source_key}>Previous work · {new Date(d.updated_at).toLocaleString()}</option>)}
    </select></label>}
    {historical && <p className="text-sm text-amber-800">These marks belong to an earlier submission. Switch to the current submission to grade the new work.</p>}
    {editable && <div className="space-y-2 print:hidden">
      <p className="text-sm text-ink-500">Choose a mark, then click or tap the work. Fraction scores are entered by you and do not change the final grade.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Marking tools">
        {([['check', '✓ Correct'], ['cross', '✕ Incorrect'], ['score', 'Earned / possible']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={tool === value} disabled={busy} onClick={() => setTool(value)} className={`rounded-lg border px-3 py-2 text-sm ${tool === value ? "border-red-600 bg-red-50 text-red-700" : "border-black/15"}`}>{label}</button>)}
      </div>
      {tool === "score" && <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>Earned <input aria-label="Earned points" type="number" min="0" max="10000" step="any" value={earned} onChange={e => setEarned(e.target.value)} className="w-24 rounded border p-2" /></label>
        <span>/</span><label>Possible <input aria-label="Possible points" type="number" min="0.01" max="10000" step="any" value={possible} onChange={e => setPossible(e.target.value)} className="w-24 rounded border p-2" /></label>
        {!validScore && <span role="alert" className="text-red-700">Enter nonnegative earned points and a positive possible score.</span>}
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost text-sm" disabled={busy || !past.length} onClick={() => { setFuture(f => [marks, ...f]); setMarks(past[past.length - 1]); setPast(p => p.slice(0, -1)); }}>Undo</button>
        <button type="button" className="btn-ghost text-sm" disabled={busy || !future.length} onClick={() => { setPast(p => [...p, marks]); setMarks(future[0]); setFuture(f => f.slice(1)); }}>Redo</button>
        <button type="button" className="btn-primary text-sm" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save markings"}</button>
        <span className="text-xs" role="status">{dirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>
    </div>}
    {message && <p role={failed ? "alert" : "status"} className={`text-sm ${failed ? "text-red-700" : "text-green-700"}`}>{message}</p>}
    {source.file && fileUrl && <p className="text-sm"><a href={fileUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">Open original file</a>{!image && " · Mark the text below. PDF and presentation page overlays are not supported yet."}</p>}
    {image && fileUrl && <MarkingSurface key={sourceKey + ":image"} surface="image" imageUrl={fileUrl} marks={marks} editable={editable && !busy} zoom={zoom} onAdd={add} onRemove={id => change(marks.filter(m => m.id !== id))} />}
    {source.text && <MarkingSurface key={sourceKey + ":text"} surface="text" text={source.text} marks={marks} editable={editable && !busy} zoom={zoom} onAdd={add} onRemove={id => change(marks.filter(m => m.id !== id))} />}
    {!source.text && !image && <p className="text-sm text-ink-500">The original is not available for on-page marking. Older scans were not retained; upload the original again to create a markable paper.</p>}
    {marks.length > 0 && <details className="text-sm print:hidden"><summary>Marks ({marks.length}) · review and correct</summary>
      <ol className="mt-2 space-y-1">{marks.map((m, i) => <li key={m.id} className="flex flex-wrap items-center gap-2"><span>{i + 1}. {markLabel(m)} · {m.surface}</span>{editable && <>
        <button type="button" disabled={busy} onClick={() => change(marks.filter(x => x.id !== m.id))} className="text-red-700 underline" aria-label={`Remove mark ${i + 1}`}>Remove</button>
        {m.kind === "score" ? <button type="button" disabled={busy || !validScore} onClick={() => change(marks.map(x => x.id === m.id ? { ...m, earned: Number(earned), possible: Number(possible) } : x))} className="underline">Use entered score</button> : <button type="button" disabled={busy} onClick={() => change(marks.map(x => x.id === m.id ? { ...m, kind: m.kind === "check" ? "cross" : "check" } : x))} className="underline">Change to {m.kind === "check" ? "incorrect" : "correct"}</button>}
      </>}</li>)}</ol>
    </details>}
    {marks.length >= 500 && <p role="status">This work has reached the 500-mark limit.</p>}
  </section>;
}

function MarkingSurface({ surface, imageUrl, text, marks, editable, zoom, onAdd, onRemove }: { surface: Mark["surface"]; imageUrl?: string; text?: string; marks: Mark[]; editable: boolean; zoom: number; onAdd: (surface: Mark["surface"], x: number, y: number) => void; onRemove: (id: string) => void }) {
  const textLines = markingTextLines(text ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);
  const [ready, setReady] = useState(!imageUrl);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(() => setHeight(ref.current?.offsetHeight ?? 300));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div className="overflow-auto rounded-lg border border-black/10 bg-gray-100 p-2" aria-label={`${surface} marking canvas`}>
    {error && <p role="alert">Could not load the scan. Reload this page to renew its private link; save any text markings first.</p>}
    <div style={{ width: 800 * zoom, height: height * zoom }}>
      <div ref={ref} data-testid={`marking-${surface}`} style={{ position: "relative", width: 800, transform: `scale(${zoom})`, transformOrigin: "top left", background: "white", color: "#111827" }}>
        {/* Preserve the private original dimensions without an image proxy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageUrl ? <img src={imageUrl} alt="Original submitted work" draggable={false} onLoad={() => { setReady(true); setError(false); }} onError={() => { setReady(false); setError(true); }} style={{ display: "block", width: 800, height: "auto" }} /> : <svg width="800" height={Math.max(300, textLines.length * 32 + 96)} role="img" aria-label="Submitted text" style={{ display: "block" }}>
          {textLines.map((line, index) => <text key={index} x="72" y={72 + index * 32} xmlSpace="preserve" fontFamily="monospace" fontSize="18" textLength={Array.from(line).length * 10} lengthAdjust="spacingAndGlyphs">{line}</text>)}
        </svg>}
        {ready && <div role={editable ? "button" : "img"} aria-label={editable ? `Place ${surface} mark (Enter places at center)` : `Teacher marks on ${surface}`} tabIndex={editable ? 0 : undefined} style={{ position: "absolute", inset: 0, cursor: editable ? "crosshair" : "default" }}
          onClick={e => { if (!editable) return; const p = normalizedPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); onAdd(surface, p.x, p.y); }}
          onKeyDown={e => { if (editable && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onAdd(surface, 0.5, 0.5); } }}>
          {marks.filter(m => m.surface === surface).map(m => <button type="button" key={m.id} data-mark-id={m.id} aria-label={`${markLabel(m)}${editable ? " — remove mark" : ""}`} disabled={!editable} title={editable ? "Click to remove; Undo restores it" : markLabel(m)}
            onClick={e => { e.stopPropagation(); if (editable) onRemove(m.id); }}
            style={{ position: "absolute", left: `${m.x * 100}%`, top: `${m.y * 100}%`, transform: "translate(-50%, -50%) rotate(-7deg)", color: "#c62828", background: "transparent", border: 0, padding: 2, lineHeight: 1, font: "italic bold 32px/1 Georgia, serif", whiteSpace: "nowrap", cursor: editable ? "pointer" : "default" }}>
            {m.kind === "score" ? markLabel(m) : <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true"><path d={m.kind === "check" ? "M4 21 L15 33 L35 5" : "M8 6 L32 34 M33 7 L6 33"} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>)}
        </div>}
      </div>
    </div>
  </div>;
}
