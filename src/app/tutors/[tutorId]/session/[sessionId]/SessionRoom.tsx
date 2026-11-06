"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";

export function SessionRoom({
  sessionId, room, livekitUrl, token, ratePerMinute, maxBudgetCents, tutorName, initialStatus,
}: {
  sessionId: string;
  room: string | null;
  livekitUrl: string | null;
  token: string | null;
  ratePerMinute: number;
  maxBudgetCents: number;
  tutorName: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(0);
  const [cents, setCents] = useState(0);
  const [status, setStatus] = useState(initialStatus);
  const [ending, setEnding] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "live") return;
    let stopped = false;
    async function tick() {
      const res = await fetch("/api/tutor-sessions/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) return;
      const d = await res.json();
      if (stopped) return;
      if (d.ended) { setStatus("ended"); setPaymentStatus("pending"); return; }
      setMinutes(d.minutes ?? 0);
      if (d.overBudget) end();
    }
    tick();
    intervalRef.current = window.setInterval(tick, 30_000);
    return () => {
      stopped = true;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [sessionId, status]);

  async function end() {
    setEnding(true);
    setEndError(null);
    try {
      const res = await fetch("/api/tutor-sessions/end", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const d = await res.json();
      if (!res.ok || !d.ended) throw new Error(d.error ?? "Could not confirm the end request.");
      setMinutes(d.minutes ?? minutes);
      if (typeof d.cents === "number") setCents(d.cents);
      setPaymentStatus(d.paymentStatus);
      setStatus("ended");
      if (!d.roomClosed) setEndError("The call room could not be closed. Disconnect and retry the end request.");
    } catch (e) {
      setEndError(e instanceof Error ? e.message : "Could not confirm the end request. Please retry.");
    } finally {
      setEnding(false);
    }
  }

  const cap = maxBudgetCents / 100;
  const used = cents / 100;
  const pct = maxBudgetCents > 0 ? Math.min(100, (cents / maxBudgetCents) * 100) : 0;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Session with {tutorName}</h1>
        <span className={`text-xs ${status === "live" ? "text-green-600" : "text-ink-500"}`}>
          {status === "live" ? "● Live" : status}
        </span>
      </header>

      <div className="card space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>{minutes} min{paymentStatus === "captured" ? ` · confirmed payment $${used.toFixed(2)}` : " · payment not confirmed"}</span>
          <span className="text-ink-500">cap ${cap.toFixed(2)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
          <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-ink-500">
          Billing is under review. Ending or disconnecting the call does not confirm a payment.
        </p>
      </div>

      {token && livekitUrl && room && status === "live" ? (
        <div className="overflow-hidden rounded-2xl border border-black/5" style={{ height: "60vh" }}>
          <LiveKitRoom
            token={token}
            serverUrl={livekitUrl}
            connect={true}
            audio={true}
            video={true}
            onDisconnected={() => { setStatus("disconnected"); setPaymentStatus("pending"); }}
            data-lk-theme="default"
            style={{ height: "100%" }}
          >
            <VideoConference />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </div>
      ) : (
        <div className="card text-sm text-ink-500">
          {status === "ended"
            ? "Session ended."
            : "Video unavailable — set LIVEKIT_* env vars."}
        </div>
      )}

      {endError && <p role="alert" className="text-sm text-red-600">{endError}</p>}
      {paymentStatus && paymentStatus !== "captured" && paymentStatus !== "cancelled" && (
        <p role="status" className="text-sm">The session has ended. Payment requires reconciliation; no charge is confirmed. Contact support if this persists.</p>
      )}
      {(status === "live" || status === "disconnected" || endError || paymentStatus === "pending" || paymentStatus === "review_required") ? (
        <button onClick={end} disabled={ending} className="btn-primary w-full">
          {ending ? "Checking…" : status === "live" ? "End session" : "Retry end/payment check"}
        </button>
      ) : (
        <button onClick={() => router.push("/tutors")} className="btn-primary w-full">
          Done — back to tutors
        </button>
      )}
    </div>
  );
}
