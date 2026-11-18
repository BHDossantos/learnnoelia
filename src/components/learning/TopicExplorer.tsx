"use client";
import Link from "next/link";
import { useState } from "react";
import { filterTopicLessons, needsReview, shortSession, topicUnits, type TopicLesson, type LessonFilter } from "@/lib/topic-experience";

export function TopicExplorer({ courseId, lessons, nextId }: { courseId: string; lessons: TopicLesson[]; nextId: string | null }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LessonFilter>("all");
  const [minutes, setMinutes] = useState(0);
  const [budget, setBudget] = useState(15);
  const visible = new Set(filterTopicLessons(lessons, query, filter, minutes).map(l => l.id));
  const plan = shortSession(lessons, budget);
  return <section className="space-y-5" data-testid="learning-path">
    <div className="rounded-2xl border border-brand-500/20 bg-brand-50 p-5 dark:bg-brand-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-brand-700 dark:text-blue-300">Make room for learning</p><h3 className="mt-1 text-lg font-semibold">Your next study session</h3></div>
        <label className="text-sm">Time available <select className="ml-2 rounded-lg border bg-white p-2 text-ink-900" value={budget} onChange={e => setBudget(Number(e.target.value))}>
          {[10,15,30].map(n => <option key={n} value={n}>{n} minutes</option>)}
        </select></label>
      </div>
      {plan.length ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-medium">{plan[0].title}</p><p className="mt-1 text-sm text-ink-500">{plan.length} lesson{plan.length !== 1 && "s"} · about {plan.reduce((n,l) => n + (l.estimated_minutes ?? 0),0)} min · in course order</p></div>
        <Link href={`/learn/${courseId}/${plan[0].id}`} className="btn-primary">Start session →</Link>
      </div> : <p className="mt-3 text-sm text-ink-500">{lessons.some(l => !l.completed) ? "Your next lesson needs more time or has no time estimate. Choose any lesson below at your own pace." : "All lessons completed. Revisit a topic or use Review to keep it fresh."}</p>}
      <p className="mt-3 text-xs text-ink-500">A suggested plan, not a timer or deadline. Completion is recorded by the lesson itself.</p>
    </div>
    <div className="card space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="text-sm font-medium">Find a lesson<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search topics or activity types" className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5" /></label>
        <label className="text-sm font-medium">Lesson length<select value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="mt-1 block w-full rounded-xl border bg-white p-2.5 text-ink-900">
          <option value={0}>Any length</option><option value={10}>Up to 10 min</option><option value={20}>Up to 20 min</option>
        </select></label>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Lesson status">
        {(["all","unfinished","review","completed"] as const).map(key => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-full px-3 py-2 text-sm ${filter === key ? "bg-brand-600 text-white" : "bg-black/5 dark:bg-white/10"}`}>{({all:"All lessons",unfinished:"To learn",review:"Needs practice",completed:"Completed"})[key]}</button>)}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs"><p role="status">{visible.size} of {lessons.length} lessons</p><button className="text-brand-600 underline" onClick={() => { setQuery(""); setFilter("all"); setMinutes(0); }}>Clear filters</button></div>
    </div>
    {topicUnits(lessons).map(unit => {
      const matches = unit.lessons.filter(l => visible.has(l.id));
      if (!matches.length) return null;
      const done = unit.lessons.filter(l => l.completed).length;
      return <section key={unit.title} className="space-y-2">
        <div className="flex items-center justify-between gap-3 px-1"><h3 className="font-semibold">{unit.title}</h3><span className="text-xs text-ink-500">{done}/{unit.lessons.length} complete</span></div>
        <progress aria-label={unit.title + " completion"} value={done} max={unit.lessons.length} className="h-1.5 w-full accent-blue-600" />
        <ol className="space-y-2">{matches.map(l => <li key={l.id}>
          <Link href={`/learn/${courseId}/${l.id}`} className={`card flex items-start gap-3 transition hover:border-brand-500/50 ${l.id === nextId ? "border-brand-500/50 bg-brand-50/50" : ""}`}>
            <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold ${l.completed ? "bg-emerald-100 text-emerald-800" : "bg-brand-50 text-brand-700"}`}>{l.completed ? "✓" : l.kind === "quiz" ? "?" : "↗"}</span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">{l.id === nextId && <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">Up next</span>}<span className="text-xs capitalize text-ink-500">{l.kind}</span></div>
              <p className="mt-1 font-semibold">{l.title}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-500"><span>{l.estimated_minutes && l.estimated_minutes > 0 ? `~${l.estimated_minutes} min` : "Self-paced"}</span><span>·</span><span>{l.completed ? "Completed" : "Not completed"}</span>{l.mastery && <span className={needsReview(l) ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>· {l.mastery}</span>}</div>
            </div><span aria-hidden="true" className="pt-3 text-brand-600">→</span>
          </Link>
        </li>)}</ol>
      </section>;
    })}
    {visible.size === 0 && <div className="card py-10 text-center"><h3 className="font-semibold">No lessons match yet</h3><p className="mt-2 text-sm text-ink-500">Try another search or clear the filters to see the whole topic.</p></div>}
  </section>;
}
