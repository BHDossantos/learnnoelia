import {expect,it} from 'vitest';
import {courseAssessmentPlan,courseQuestionBank,publicQuestions,gradeStudyAssessment,type StudyLesson} from './course-assessments';
const lessons:StudyLesson[]=Array.from({length:12},(_,i)=>({id:`l${i}`,title:`Topic ${i}`,kind:'quiz',position:i,body:{questions:Array.from({length:5},(_,j)=>({prompt:`Topic ${i} question ${j}?`,options:['Yes','No'],answer:1,explanation:`Topic ${i} explanation ${j}`}))}}));
it('builds four exams and twelve quizzes from real course questions without within-test duplicates',()=>{
 const p=courseAssessmentPlan(lessons);expect(p.exams).toHaveLength(4);expect(p.quizzes).toHaveLength(12);
 for(const a of [...p.exams,...p.quizzes]){expect(a.ready).toBe(true);expect(new Set(a.questions.map(q=>q.id)).size).toBe(a.questions.length);expect(a.questions.every(q=>p.bank.includes(q))).toBe(true);}
 expect(new Set(p.exams[3].questions.map(q=>q.lessonId)).size).toBe(12);
});
it('does not fill an empty course with fabricated assessments',()=>{
 const p=courseAssessmentPlan([]);expect(p.bank).toHaveLength(0);expect([...p.exams,...p.quizzes].every(a=>!a.ready)).toBe(true);
});
it('skips broken answer keys and duplicate prompts',()=>{
 const p=courseQuestionBank([{...lessons[0],body:{questions:[...lessons[0].body.questions,...lessons[0].body.questions,{prompt:'Broken',options:['x','y'],answer:9}]}}]);expect(p).toHaveLength(5);
});
it('withholds answer keys before submission and distinguishes written self-review',()=>{
 const p=courseAssessmentPlan(lessons);const a={...p.exams[0],questions:[p.bank[0],{id:'w',lessonId:'l',lessonTitle:'Writing',prompt:'Explain why?',answer:'Model response',explanation:'Reasoning'}]};
 expect(publicQuestions(a.questions).every(q=>!('answer' in q)&&!('explanation' in q))).toBe(true);
 const result=gradeStudyAssessment(a,{[p.bank[0].id]:1,w:'My response'});expect(result).toMatchObject({correct:1,total:1,written:1});expect(result.feedback[1].correct).toBeUndefined();
});
it('includes authored written practice without generating a new answer',()=>{
 const p=courseQuestionBank([{id:'b',title:'Biology',kind:'reading',position:1,body:{sections:[{heading:'Your turn',text:'What is a control? Answer: The untreated comparison.'}]}}]);
 expect(p[0]).toMatchObject({prompt:'What is a control?',answer:'The untreated comparison.'});
});
