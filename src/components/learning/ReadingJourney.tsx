"use client";
import {useRef,useState} from 'react';
import {readingSteps,studySheet,type ReadingStep} from '@/lib/reading-steps';

function Activity({step,large}:{step:ReadingStep;large:boolean}){
 const [revealed,setRevealed]=useState(false);
 const [draft,setDraft]=useState('');
 const [reflection,setReflection]=useState('');
 const [selected,setSelected]=useState<number|null>(null);
 const multiple=!!step.options;
 return <div className="space-y-5">
  <div className={`whitespace-pre-wrap break-words leading-8 text-ink-800 dark:text-slate-100 ${large?'text-xl':'text-lg'}`}>{step.text}</div>
  {step.answer && <>
   {multiple ? <fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold">Choose one answer</legend>{step.options!.map((option,i)=><label key={i} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 leading-7 ${selected===i?'border-brand-600 bg-brand-50 text-slate-900':'border-black/15'}`}><input className="mt-2" type="radio" name={`practice-${step.text}`} checked={selected===i} disabled={revealed} onChange={()=>setSelected(i)}/><span>{option}</span></label>)}</fieldset> : <><label className="block text-sm font-semibold">Your thinking<textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={3} placeholder="Try an answer in your own words…" className="mt-2 w-full resize-y rounded-2xl border border-black/15 bg-transparent p-4 text-base font-normal focus:border-brand-500 focus:outline-none dark:border-white/20"/></label>
   <p className="text-xs text-ink-500">Optional scratch work for this step. It isn’t saved or graded.</p></>}
   <button type="button" disabled={multiple&&selected===null} aria-expanded={revealed} onClick={()=>setRevealed(!revealed)} className="btn-primary">{revealed?(multiple?'Try again':'Hide explanation'):(multiple?'Check answer':'Reveal explanation')}</button>
   {revealed && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
    <p className="mb-2 text-xs font-bold uppercase tracking-widest">{multiple?(selected===step.correct?'Correct — check the reasoning':'Not quite — review the explanation'):'Compare your reasoning'}</p><p className="whitespace-pre-wrap leading-7">{step.answer}</p>
    <fieldset className="mt-5"><legend className="mb-2 text-sm font-semibold">How did it go?</legend><div className="flex flex-wrap gap-2">{['I understand','I want to revisit'].map(value=><button type="button" key={value} aria-pressed={reflection===value} onClick={()=>setReflection(value)} className={`rounded-full border px-3 py-2 text-sm ${reflection===value?'bg-emerald-800 text-white':'border-emerald-300'}`}>{value}</button>)}</div></fieldset>
    {reflection && <p role="status" className="mt-3 text-sm">{reflection==='I understand'?'Ready for the next step.':'You can return to this step using the lesson map.'} This is a self-check, not a grade.</p>}
   </div>}
  </>}
 </div>;
}
export function ReadingJourney({body,title,large}:{body:any;title:string;large:boolean}){
 const allSteps=readingSteps(body);
 const [practiceOnly,setPracticeOnly]=useState(false);
 const steps=practiceOnly?allSteps.filter(step=>step.answer):allSteps;
 const [index,setIndex]=useState(0);
 const [full,setFull]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null);
 const current=steps[index]??steps[0];
 function go(next:number){setIndex(next);requestAnimationFrame(()=>{heading.current?.focus();heading.current?.scrollIntoView({block:'start',behavior:'auto'});});}
 if(!current)return <p className="card">This lesson has no reading content yet.</p>;
 function download(withAnswers:boolean){const url=URL.createObjectURL(new Blob([studySheet(title,body,withAnswers)],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${title.replace(/[^a-z0-9]+/gi,'-').slice(0,70)}${withAnswers?'-explanations':'-practice'}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const labels={read:'Explore',example:'Worked example',practice:'Your turn'};
 return <div className="space-y-5" data-testid="reading-journey">
  <nav aria-label="This lesson" className="flex gap-2 border-b border-black/10 pb-3">{['Learn','Practice','Review'].map(mode=><button type="button" key={mode} disabled={mode==='Practice'&&!allSteps.some(s=>s.answer)} aria-pressed={mode==='Review'?full:mode==='Practice'?practiceOnly&&!full:!full&&!practiceOnly} onClick={()=>{setPracticeOnly(mode==='Practice');setFull(mode==='Review');setIndex(0);}} className={`rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-40 ${(mode==='Review'?full:mode==='Practice'?practiceOnly&&!full:!full&&!practiceOnly)?'bg-brand-600 text-white':'bg-black/5 dark:bg-white/10'}`}>{mode}</button>)}</nav>
  <div className="rounded-3xl border border-brand-500/15 bg-gradient-to-br from-brand-50 via-white to-violet-50 p-5 dark:from-brand-500/15 dark:via-slate-900 dark:to-violet-500/10 sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-widest text-brand-700 dark:text-blue-300">Learn · Think · Apply</span><button type="button" onClick={()=>setFull(!full)} aria-pressed={full} className="text-sm font-semibold text-brand-700 underline underline-offset-4 dark:text-blue-300">{full?'Guided steps':'Full lesson'}</button></div>
   <p className="mt-3 text-sm leading-6 text-ink-600 dark:text-slate-300">Take one idea at a time. Try the questions before revealing the explanation.</p>
   <div className="mt-4 flex items-center justify-between text-xs text-ink-500"><span>{full?'Reading view':`Step ${index+1} of ${steps.length}`}</span><span>At your pace</span></div>
   <progress value={index+1} max={steps.length} aria-label="Position in lesson" className="mt-2 h-1.5 w-full accent-blue-600"/>
  </div>
  <details className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5"><summary className="cursor-pointer text-sm font-semibold">Study materials · take this lesson with you</summary><p className="mt-3 text-sm text-ink-500">Download the course text and questions for offline study. Your scratch work is not included.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>download(false)} className="btn-ghost">Download practice sheet</button><button type="button" onClick={()=>download(true)} className="btn-ghost">Download explanations</button></div></details>
  <details className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5"><summary className="cursor-pointer text-sm font-semibold">Lesson map · jump to any step</summary><ol className="mt-3 grid gap-2 sm:grid-cols-2">{steps.map((step,i)=><li key={i}><button type="button" onClick={()=>{setFull(false);go(i);}} aria-current={!full&&index===i?'step':undefined} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${index===i?'bg-brand-50 font-semibold text-brand-700':'hover:bg-black/5'}`}>{i+1}. {step.title}</button></li>)}</ol></details>
  {full ? <div className="space-y-5">{steps.map((step,i)=><section key={i} className="rounded-3xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-white/5 sm:p-8"><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-600">{labels[step.kind]} · {i+1}</p><h2 className="mb-5 text-xl font-bold">{step.title}</h2><Activity key={`full-${i}`} step={step} large={large}/></section>)}</div> : <section className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
   <div className={`border-b border-black/5 px-5 py-4 sm:px-8 ${current.kind==='practice'?'bg-violet-50 dark:bg-violet-500/10':current.kind==='example'?'bg-amber-50 dark:bg-amber-500/10':'bg-blue-50 dark:bg-blue-500/10'}`}><p className="text-xs font-bold uppercase tracking-widest text-ink-600 dark:text-slate-300">{labels[current.kind]} · {current.section}</p></div>
   <div className="p-5 sm:p-8"><h2 ref={heading} tabIndex={-1} className="mb-6 scroll-mt-6 text-2xl font-bold leading-tight outline-none">{current.title}</h2><Activity key={`${title}-${practiceOnly}-${index}`} step={current} large={large}/></div>
   <div className="flex items-center justify-between gap-3 border-t border-black/5 p-5 sm:px-8"><button type="button" className="btn-ghost" disabled={index===0} onClick={()=>go(index-1)}>Back</button><span className="text-xs text-ink-500">{index+1} / {steps.length}</span>{index<steps.length-1?<button type="button" className="btn-primary" onClick={()=>go(index+1)}>Next step →</button>:<span className="text-sm font-semibold text-brand-700 dark:text-blue-300">Ready to finish ↓</span>}</div>
  </section>}
 </div>;
}
