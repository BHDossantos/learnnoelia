"use client";
import Link from "next/link";
import { useState } from "react";
export type CatalogTopic = { id: string; title: string; description: string | null; cefr_level: string | null; goal_tag: string | null; total: number; done: number; minutes: number; nextId: string | null };
export function TopicCatalog({ topics, icon, accent = "bg-brand-50" }: { topics: CatalogTopic[]; icon: string; accent?: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recommended");
  const visible = topics.filter(t => (t.title + " " + (t.description ?? "") + " " + (t.goal_tag ?? "")).toLowerCase().includes(query.trim().toLowerCase()) &&
    (status === "all" || (status === "started" && t.done > 0 && t.done < t.total) || (status === "new" && t.done === 0) || (status === "complete" && t.total > 0 && t.done === t.total)));
  if (sort === "title") visible.sort((a,b) => a.title.localeCompare(b.title));
  if (sort === "progress") visible.sort((a,b) => (b.total ? b.done/b.total : 0) - (a.total ? a.done/a.total : 0));
  return <section className="space-y-4">
    <div className="card grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <label className="text-sm font-medium">Find your next topic<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search within this school" className="mt-1 w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5" /></label>
      <label className="text-sm font-medium">Progress<select className="mt-1 block w-full rounded-xl border bg-white p-2.5 text-ink-900" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All topics</option><option value="started">In progress</option><option value="new">Not started</option><option value="complete">Completed</option></select></label>
      <label className="text-sm font-medium">Sort by<select className="mt-1 block w-full rounded-xl border bg-white p-2.5 text-ink-900" value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">Course order</option><option value="title">Title A–Z</option><option value="progress">Most completed</option></select></label>
    </div>
    <p role="status" className="text-sm text-ink-500">{visible.length} topics · choose a path, then learn at your pace</p>
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(t => {
      const pct=t.total ? Math.round(t.done/t.total*100) : 0;
      return <li key={t.id} className="card flex flex-col overflow-hidden p-0 transition hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-md">
        <div className="flex items-center justify-between border-b border-black/5 bg-gradient-to-br from-brand-50 to-violet-50 p-4 dark:from-brand-500/20 dark:to-violet-500/10"><span aria-hidden="true" className={`grid h-11 w-11 place-items-center rounded-xl text-3xl ${accent}`}>{icon}</span><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink-700">{t.cefr_level ?? "Self-paced"}</span></div>
        <div className="flex flex-1 flex-col p-5"><Link href={`/learn/${t.id}`} className="text-lg font-bold leading-snug hover:text-brand-600">{t.title}</Link><p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-500">{t.description}</p>
          {t.goal_tag && <p className="mt-3 text-xs font-medium text-brand-700 dark:text-blue-300">{t.goal_tag.replace(/_/g," ")}</p>}
          <div className="mt-auto pt-5"><div className="flex justify-between text-xs text-ink-500"><span>{t.done}/{t.total} lessons</span><span>{pct}% completed</span></div><progress value={t.done} max={Math.max(1,t.total)} aria-label={t.title+" completion"} className="mt-2 h-1.5 w-full accent-blue-600" />
          <div className="mt-4 flex items-center justify-between gap-2"><span className="text-xs text-ink-500">{t.minutes > 0 ? `~${t.minutes} min of content` : "Explore the curriculum"}</span><Link href={t.done > 0 && t.nextId ? `/learn/${t.id}/${t.nextId}` : `/learn/${t.id}`} className="text-sm font-semibold text-brand-600">{t.done > 0 && t.nextId ? "Continue" : t.total > 0 && t.done === t.total ? "Revisit" : "Explore"} →</Link></div></div>
        </div>
      </li>;
    })}</ul>
    {visible.length === 0 && <div className="card py-10 text-center"><p className="font-semibold">No topics match these filters</p><button onClick={()=>{setQuery("");setStatus("all");}} className="btn-ghost mt-3">Clear search and filters</button></div>}
  </section>;
}
