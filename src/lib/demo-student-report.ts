// Authored fictional records. Never joined to a real profile or gradebook.
export const demoCourses = [
 {name:'Biology',teacher:'Ms. Rivera',completed:8,total:12,earned:160,possible:200,missing:0,note:'Strong identification of variables. Explain why the control is needed.',focus:'Design a fair comparison and qualify conclusions.'},
 {name:'Mathematics',teacher:'Mr. Chen',completed:6,total:12,earned:116,possible:200,missing:1,note:'Shows useful working but loses signs when rearranging equations.',focus:'Practice negative signs and check solutions by substitution.'},
 {name:'English',teacher:'Ms. Patel',completed:9,total:12,earned:172,possible:200,missing:0,note:'Clear topic sentences. Use a quotation and explain how it supports the claim.',focus:'Connect evidence to the argument.'},
];
export const demoDays = Array.from({length:10},(_,i)=>({
 date:`2026-11-${String(i<5?2+i:4+i).padStart(2,'0')}`,
 attendance:(i===3?'absent':i===7?'excused':i===1?'late':'present') as 'present'|'absent'|'excused'|'late',
 completed:[2,1,3,0,2,2,1,0,0,3][i],
 note:i===3?'Recorded absence; arrange catch-up.':i===7?'Excused absence recorded.':i===8?'Attended; no lesson completion recorded.':'',
}));
export function reportSummary(courses=demoCourses,days=demoDays){
 const earned=courses.reduce((s,c)=>s+c.earned,0),possible=courses.reduce((s,c)=>s+c.possible,0);
 return {percent:possible?Math.round(earned/possible*100):null,
 completed:courses.reduce((s,c)=>s+c.completed,0),total:courses.reduce((s,c)=>s+c.total,0),
 studyDays:days.filter(d=>d.completed>0).length,noCompletionDays:days.filter(d=>d.completed===0).length,
 present:days.filter(d=>d.attendance==='present'||d.attendance==='late').length,
 absent:days.filter(d=>d.attendance==='absent').length,excused:days.filter(d=>d.attendance==='excused').length,
 missing:courses.reduce((s,c)=>s+c.missing,0)};
}
