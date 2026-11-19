"use client";
import { useRef, useState } from "react";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";

type Result = {
  translation: string;
  alternatives: string[];
  notes: string;
  detectedSource?: string;
};

export function TranslateClient({
  defaultTarget = "es",
}: { defaultTarget?: LanguageCode }) {
  const [source, setSource] = useState<LanguageCode | "auto">("auto");
  const [target, setTarget] = useState<LanguageCode>(defaultTarget);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const request = useRef(0);
  function invalidate() { request.current++; setResult(null); setNotice(null); setLoading(false); }
  function swap() {
    const detected = source === "auto" ? result?.detectedSource : source;
    if (!detected || !Object.hasOwn(LANGUAGES, detected)) return;
    const translated = result?.translation;
    invalidate(); setSource(target); setTarget(detected as LanguageCode);
    if (translated) setText(translated);
  }

  async function translate() {
    if (!text.trim()) return;
    const current = ++request.current;
    setLoading(true); setResult(null); setNotice(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, source, target }),
      });
      const data = await res.json().catch(() => ({}));
      if (current !== request.current) return;
      if (!res.ok) {
        setNotice(
          data.offline
            ? "Translation isn't connected on this deployment yet — it goes live once the system key is configured."
            : "Something went wrong — try again.",
        );
        setResult(null);
        return;
      }
      setNotice(null);
      setResult(data);
    } catch {
      if (current === request.current) setNotice("Could not connect. Your text is still here — please try again.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }

  function speak(t: string) {
    if (typeof window === "undefined") return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = target;
    speechSynthesis.speak(u);
  }

  function startVoice() {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input not supported in this browser.");
      return;
    }
    const rec = new SR();
    rec.lang = source === "auto" ? "en-US" : source;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      invalidate(); setText(e.results[0][0].transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Translate</h1>
      <p className="text-sm text-ink-500">
        Voice or text. Each translation feeds your learner model — words you look up resurface in lessons.
      </p>
      {notice && (
        <p role="status" className="card border-amber-200 bg-amber-50 text-sm text-amber-800">{notice}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Source language"
          value={source}
          onChange={(e) => { invalidate(); setSource(e.target.value as LanguageCode | "auto"); }}
          className="rounded-xl border border-black/10 bg-white px-3 py-2"
        >
          <option value="auto">Detect</option>
          {Object.entries(LANGUAGES).map(([c, l]) => (
            <option key={c} value={c}>{l.flag} {l.label}</option>
          ))}
        </select>
        <select
          aria-label="Target language"
          value={target}
          onChange={(e) => { invalidate(); setTarget(e.target.value as LanguageCode); }}
          className="rounded-xl border border-black/10 bg-white px-3 py-2"
        >
          {Object.entries(LANGUAGES).map(([c, l]) => (
            <option key={c} value={c}>{l.flag} {l.label}</option>
          ))}
        </select>
      </div>

      <button type="button" className="btn-ghost" disabled={loading || (source === "auto" && !Object.hasOwn(LANGUAGES, result?.detectedSource ?? ""))} onClick={swap}>Swap languages</button>

      <textarea
        aria-label="Text to translate"
        value={text}
        onChange={(e) => { invalidate(); setText(e.target.value); }}
        rows={4}
        placeholder="Type or speak…"
        className="w-full rounded-xl border border-black/10 bg-white p-3"
      />

      <div className="flex gap-2">
        <button onClick={startVoice} className="btn-ghost flex-1">
          {listening ? "Listening…" : "🎙️ Speak"}
        </button>
        <button onClick={translate} disabled={loading || !text.trim()} className="btn-primary flex-1">
          {loading ? "…" : "Translate"}
        </button>
      </div>

      {result && (
        <div className="card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-lg">{result.translation}</p>
            <div className="flex gap-1">
              <button aria-label="Listen to translation" onClick={() => speak(result.translation)} className="btn-ghost px-3 py-1 text-sm">
                🔊
              </button>
              <button
                onClick={() => {
                  fetch("/api/vocab/capture", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      language: target,
                      items: [{ term: result.translation, translation: text, example: null }],
                    }),
                  }).catch(() => {});
                }}
                className="btn-ghost px-3 py-1 text-sm"
                title="Save to my SRS"
              >
                ＋
              </button>
            </div>
          </div>
          {result.alternatives?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-ink-500">Alternatives</p>
              <ul className="mt-1 space-y-1 text-sm">
                {result.alternatives.map((a, i) => <li key={i}>• {a}</li>)}
              </ul>
            </div>
          )}
          {result.notes && (
            <p className="rounded-lg bg-brand-50 p-2 text-xs text-brand-700">💡 {result.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
