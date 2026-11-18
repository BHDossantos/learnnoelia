"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Celebrate } from "@/components/Celebrate";
import { awardMatchXp } from "./actions";

type Pair = { id: string; term: string; translation: string };
type Tile = { key: string; pairId: string; text: string };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTiles(pairs: Pair[]): Tile[] {
  const tiles: Tile[] = [];
  for (const p of pairs) {
    tiles.push({ key: `${p.id}-t`, pairId: p.id, text: p.term });
    tiles.push({ key: `${p.id}-d`, pairId: p.id, text: p.translation });
  }
  return shuffle(tiles);
}

export function MatchGame({
  pairs, courseId, lessonId, title,
}: {
  pairs: Pair[];
  courseId: string;
  lessonId: string;
  title: string;
}) {
  const [round, setRound] = useState(0);
  const tiles = useMemo(() => buildTiles(pairs), [pairs, round]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [startMs] = useMemo(() => [Date.now()], [round]);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [xp, setXp] = useState<number | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startMs) / 1000)), 250);
    return () => clearInterval(t);
  }, [done, startMs]);

  const byKey = useMemo(() => new Map(tiles.map((t) => [t.key, t])), [tiles]);

  function tap(key: string) {
    if (lockRef.current || done) return;
    const tile = byKey.get(key)!;
    if (matched.has(tile.pairId) || key === selected) return;

    if (selected === null) { setSelected(key); return; }
    const first = byKey.get(selected)!;
    if (first.pairId === tile.pairId) {
      // Match.
      const next = new Set(matched).add(tile.pairId);
      setMatched(next);
      setSelected(null);
      if (next.size === pairs.length) {
        setDone(true);
        awardMatchXp().then((r) => setXp(r?.xp ?? null)).catch(() => {});
      }
    } else {
      // Wrong — flash both briefly.
      lockRef.current = true;
      setWrong(new Set([selected, key]));
      setTimeout(() => { setWrong(new Set()); setSelected(null); lockRef.current = false; }, 650);
    }
  }

  function playAgain() {
    setMatched(new Set()); setSelected(null); setWrong(new Set()); setElapsed(0); setDone(false); setXp(null);
    setRound((r) => r + 1);
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (done) {
    return (
      <div className="mx-auto max-w-md space-y-3 text-center">
        <div className="card space-y-2 py-8">
          <Celebrate xp={xp ?? 0} />
          <h1 className="text-xl font-bold">Matched them all! 🎉</h1>
          <p className="text-5xl font-extrabold tracking-tight text-brand-600">{mm}:{ss}</p>
          <p className="text-sm text-ink-500">{pairs.length} pairs{xp ? ` · +${xp} XP` : ""}</p>
          <div className="flex justify-center gap-2 pt-1">
            <button onClick={playAgain} className="btn-primary">Play again</button>
            <Link href={`/learn/${courseId}/${lessonId}`} className="btn-ghost">Back to lesson</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Match · {title}</h1>
          <p className="text-xs text-ink-500">Tap a term and its translation. {matched.size}/{pairs.length} matched.</p>
        </div>
        <span className="rounded-full bg-black/5 px-3 py-1 text-sm font-semibold text-ink-700">⏱ {mm}:{ss}</span>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => {
          const isMatched = matched.has(t.pairId);
          const isSelected = selected === t.key;
          const isWrong = wrong.has(t.key);
          return (
            <button
              key={t.key}
              onClick={() => tap(t.key)}
              disabled={isMatched}
              className={
                "grid min-h-[72px] place-items-center rounded-xl border px-3 py-3 text-center text-sm font-medium transition " +
                (isMatched
                  ? "invisible"
                  : isWrong
                    ? "border-red-400 bg-red-50 text-red-700 ring-1 ring-red-400"
                    : isSelected
                      ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500"
                      : "border-black/10 bg-white text-ink-800 hover:border-brand-500/40 dark:bg-white/5")
              }
            >
              {t.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
