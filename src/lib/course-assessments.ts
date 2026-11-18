import {readingSteps} from './reading-steps';
export type StudyQuestion={id:string;lessonId:string;lessonTitle:string;prompt:string;options?:string[];answer:string|number;explanation:string};
export type StudyAssessment={key:string;title:string;description:string;questions:StudyQuestion[];ready:boolean};
export type StudyLesson={id:string;title:string;kind:string;body:any;position:number};
export function courseQuestionBank(lessons:StudyLesson[]):StudyQuestion[]{
 const bank:StudyQuestion[]=[];const seen=new Set<string>();
 function add(lesson:StudyLesson,prompt:string,answer:string|number,explanation:string,options?:string[]){
  const normalized=prompt.trim().toLocaleLowerCase().replace(/\s+/g,' ');if(!normalized||seen.has(normalized))return;seen.add(normalized);
  bank.push({id:`${lesson.id}:${bank.length}`,lessonId:lesson.id,lessonTitle:lesson.title,prompt:prompt.trim(),answer,explanation, ...(options?{options}:{})});
 }
 for(const lesson of [...lessons].sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))){
  for(const q of Array.isArray(lesson.body?.questions)?lesson.body.questions:[]){
   if(typeof q?.prompt==='string'&&Array.isArray(q.options)&&q.options.length>=2&&q.options.every((o:unknown)=>typeof o==='string')&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length)add(lesson,q.prompt,q.answer,typeof q.explanation==='string'?q.explanation:'Review the linked lesson for the reasoning.',q.options);
  }
  for(const step of readingSteps(lesson.body))if(step.answer)add(lesson,step.text,step.answer,step.answer);
  for(const item of Array.isArray(lesson.body?.items)?lesson.body.items:[]){
   if(typeof item?.term==='string'&&typeof item.translation==='string'&&item.translation.trim())add(lesson,`Explain or translate “${item.term}” in the context of ${lesson.title}.`,item.translation,item.translation);
  }
 }
 return bank;
}
export function courseAssessmentPlan(lessons:StudyLesson[]){
 const bank=courseQuestionBank(lessons);const quizzes:StudyAssessment[]=[];
 // Distribute source questions through course order. Short banks explicitly
 // reuse questions for retrieval practice; no invented questions or keys.
 for(let i=0;i<12;i++){
  const start=Math.floor(i*bank.length/12);
  const count=Math.min(5,Math.max(3,Math.floor(bank.length/12)));
  const questions=bank.length>=12?Array.from({length:count},(_,j)=>bank[(start+j)%bank.length]):[];
  quizzes.push({key:`quiz-${i+1}`,title:`Quiz ${i+1}`,description:questions.length?`Quick retrieval practice · ${[...new Set(questions.map(q=>q.lessonTitle))].join(' / ')}`:'More authored questions are needed before this quiz opens.',questions,ready:questions.length>=3});
 }
 const exams:StudyAssessment[]=[];
 for(let i=0;i<3;i++){
  const pool=bank.slice(Math.floor(i*bank.length/3),Math.floor((i+1)*bank.length/3));
  const questions=sample(pool,12);
  exams.push({key:`exam-${i+1}`,title:`Exam ${i+1} · ${['Foundations','Developing understanding','Connecting ideas'][i]}`,description:`Course question bank, part ${i+1} of 3. Coverage: ${[...new Set(questions.map(q=>q.lessonTitle))].join(' / ')}`,questions,ready:questions.length>=4});
 }
 const final=sample(bank,20);
 exams.push({key:'exam-4',title:'Exam 4 · Cumulative review',description:'A balanced sample from across the course question bank. Revisit the linked lessons after reviewing your answers.',questions:final,ready:bank.length>=12});
 return {bank,quizzes,exams};
}
function sample(pool:StudyQuestion[],max:number){return pool.length<=max?pool:Array.from({length:max},(_,i)=>pool[Math.floor(i*pool.length/max)]);}
export function publicQuestions(questions:StudyQuestion[]){return questions.map(({answer,explanation,...question})=>question);}
export function gradeStudyAssessment(assessment:StudyAssessment,responses:Record<string,string|number>){
 let correct=0,total=0,written=0;
 const feedback=assessment.questions.map(q=>{
  const selected=responses[q.id];let isCorrect:boolean|undefined;
  if(q.options){total++;isCorrect=typeof selected==='number'&&selected===q.answer;if(isCorrect)correct++;}else written++;
  return {id:q.id,lessonId:q.lessonId,prompt:q.prompt,correct:isCorrect,answer:q.options?q.options[q.answer as number]:q.answer,explanation:q.explanation};
 });
 return {correct,total,written,feedback};
}
