"use client";
import { useEffect, useState } from "react";
import { getMonitorData } from "../../actions";

type Row = {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  focusLost: number;
  lastActivity: string | null;
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function MonitorClient({ classroomId, assessmentId }: { classroomId: string; assessmentId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [updated, setUpdated] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const d = (await getMonitorData(classroomId, assessmentId)) as Row[];
        if (alive) { setRows(d); setUpdated(new Date().toLocaleTimeString()); setLoaded(true); }
      } catch { /* keep last data */ }
    }
    poll();
    const t = setInterval(poll, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [classroomId, assessmentId]);

  const inProgress = rows.filter((r) => r.status === "in_progress");

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-400">{loaded ? `${inProgress.length} in progress · updated ${updated}` : "Loading…"}</p>
      {rows.length === 0 ? (
        <p className="card text-sm text-ink-500">No one has started this assessment.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-center">Tab switches</th>
                <th className="px-3 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      r.status === "in_progress" ? "bg-amber-50 text-amber-700" : r.status === "submitted" ? "bg-black/5 text-ink-600" : "bg-green-100 text-green-700"
                    }`}>
                      {r.status === "in_progress" ? "Taking" : r.status === "submitted" ? "Submitted" : "Graded"}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-center ${r.focusLost > 0 ? "font-semibold text-red-600" : "text-ink-400"}`}>
                    {r.focusLost > 0 ? `⚠️ ${r.focusLost}` : "0"}
                  </td>
                  <td className="px-3 py-2 text-ink-500">{r.status === "in_progress" ? ago(r.lastActivity) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
