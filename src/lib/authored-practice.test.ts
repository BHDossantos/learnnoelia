import {expect,it} from 'vitest';
import {authoredPractice} from './authored-practice';
import {readingSteps,studySheet} from './reading-steps';
import {courseQuestionBank,gradeStudyAssessment} from './course-assessments';
const question={prompt:'Which group is the control?',options:['Untreated','Treated'],answer:0,explanation:'Compare against the untreated group.'};
it('accepts both authored formats and rejects ambiguous or malformed choices',()=>{
 expect(authoredPractice({practice_questions:[null,{...question,options:['Same',' same ']},{...question,answer:2}],questions:[question]})).toEqual([question]);
 expect(authoredPractice({practice_questions:[question],questions:[{...question,prompt:' Which  group is the control? ',answer:1}]})).toEqual([question]);
});
it('upgrades matching inline practice without duplicating the question',()=>{
 const steps=readingSteps({sections:[{heading:'Your turn',text:'Which group is the control? Answer: Untreated.'}],questions:[question]});
 expect(steps.filter(s=>s.text===question.prompt)).toHaveLength(1);
 expect(steps.find(s=>s.text===question.prompt)).toMatchObject({options:question.options,correct:0,answer:question.explanation});
});
it('preserves choices and scoring when reading practice becomes a study assessment',()=>{
 const questions=courseQuestionBank([{id:'lesson',title:'Biology',kind:'reading',position:1,body:{practice_questions:[question]}}]);
 expect(questions).toHaveLength(1);
 expect(gradeStudyAssessment({key:'quiz',title:'Quiz',description:'',ready:true,questions},{[questions[0].id]:0})).toMatchObject({correct:1,total:1,written:0});
 expect(gradeStudyAssessment({key:'quiz',title:'Quiz',description:'',ready:true,questions},{[questions[0].id]:1})).toMatchObject({correct:0,total:1,written:0});
});
it('exports choices without exposing the answer key in the practice sheet',()=>{
 const sheet=studySheet('Biology',{questions:[question]});
 expect(sheet).toContain('A. Untreated');expect(sheet).toContain('B. Treated');
 expect(sheet).not.toContain('Correct answer:');expect(sheet).not.toContain(question.explanation);
 expect(studySheet('Biology',{questions:[question]},true)).toContain('Correct answer: Untreated');
});
