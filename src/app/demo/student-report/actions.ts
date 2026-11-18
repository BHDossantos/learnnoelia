'use server';
import {requireUser} from '@/lib/auth';
import {demoCourses,demoDays,reportSummary} from '@/lib/demo-student-report';
export async function analyzeDemoReport(){
 const user=await requireUser();
 if(!process.env.ANTHROPIC_API_KEY)return {error:'AI analysis is unavailable in this environment. The evidence and teacher focus plan remain available.'};
 const {takeRateLimit}=await import('@/lib/rate-limit');
 if(!await takeRateLimit(`demo-report:${user.id}`,5,3600))return {error:'Analysis limit reached. Please try again later.'};
 try{
  const {anthropic,MODEL}=await import('@/lib/anthropic');
  const result=await anthropic.messages.create({model:MODEL,max_tokens:1200,system:'Analyze only this fictional student report. Return plain text with Overall, Strengths, Priorities, Next week, and Limitations. Cite course percentages and dated records for each conclusion. The demo passing threshold is 60%, based on graded points only; unfinished work is not zero. Completion is not mastery. No completion is not absence. Do not infer causes, diagnoses, future outcomes or missing grades. Do not change grades. Say teacher review is required. This is a demo, not a real student.',messages:[{role:'user',content:JSON.stringify({courses:demoCourses,days:demoDays,summary:reportSummary(),period:'2–13 November 2026',passingThreshold:60})}]},{timeout:30000});
  const text=result.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');
  return text?{text}:{error:'No analysis was returned. Please retry.'};
 }catch{return {error:'AI analysis could not finish. Please retry; the report has not changed.'};}
}
