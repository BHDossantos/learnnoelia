"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Tutor = {
  display_name: string;
  rate_cents_per_minute: number;
  languages: string[];
  dialects: string[] | null;
  is_online: boolean;
};

export function ConnectClient({ tutorId, tutor }: { tutorId: string; tutor: Tutor }) {
  const router = useRouter();
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratePerMin = tutor.rate_cents_per_minute / 100;
  const budget = (ratePerMin * maxMinutes).toFixed(2);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tutor-sessions/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tutorId, maxMinutes, shareLearnerSnapshot: share }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      router.push(`/tutors/${tutorId}/session/${data.sessionId}`);
    } catch (e: any) {
      setError(e?.message ?? "Could not start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Connect with {tutor.display_name}</h1>

      <div className="card space-y-2 text-sm">
        <p><span className="font-semibold">Rate:</span> ${ratePerMin.toFixed(2)}/minute</p>
        <p><span className="font-semibold">Languages:</span> {tutor.languages.join(", ")}</p>
        <p><span className="font-semibold">Dialects:</span> {tutor.dialects?.join(", ") || "—"}</p>
      </div>

      <div className="card space-y-3">
        <label className="block text-sm">
          <span className="font-medium">Max session length</span>
          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(Number(e.target.value))}
            className="mt-2 w-full"
          />
          <span className="text-xs text-ink-500">
            {maxMinutes} min · cap ${budget}. Paid sessions are temporarily unavailable; no authorization or charge will be requested.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-1" />
          <span>
            Share my learner snapshot (CEFR, recent errors, last reviews) so the tutor doesn't need to re-assess me.
          </span>
        </label>
      </div>

      <button
        onClick={start}
        disabled={true}
        className="btn-primary w-full"
      >
        Paid tutoring temporarily unavailable
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Link href="/tutors" className="btn-ghost block text-center">Cancel</Link>
    </div>
  );
}
