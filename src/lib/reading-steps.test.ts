import {expect,it} from 'vitest';
import {readingSteps} from './reading-steps';
const section=(text:string,heading='Your turn')=>({sections:[{heading,text}]});
it('separates inline biology questions from answers',()=>{
 const steps=readingSteps(section('Answer, then check. (1) Is a flame alive? Answer: No, it has no cells. (2) What is a control? Answer: The untreated comparison.'));
 expect(steps).toHaveLength(3);expect(steps[1]).toMatchObject({text:'Is a flame alive?',answer:'No, it has no cells.',kind:'practice'});expect(steps[2].answer).toBe('The untreated comparison.');
});
it('matches ordered question and answer lists',()=>{
 const steps=readingSteps(section('1) What is N? 2) What is L? Answers: 1) Civilizations. 2) Lifetime.'));
 expect(steps.map(s=>[s.text,s.answer])).toEqual([['What is N?','Civilizations.'],['What is L?','Lifetime.']]);
});
it('keeps an ambiguous answer key together instead of mismatching answers',()=>{
 const steps=readingSteps(section('1) First? 2) Second? Answers: one answer only'));
 expect(steps).toHaveLength(1);expect(steps[0].text).toContain('2) Second?');expect(steps[0].answer).toBe('one answer only');
});
it('hides warm-up sample answers and preserves surrounding content',()=>{
 const steps=readingSteps(section('Think about living things. Sample answers: A dog grows.','Warm-up'));
 expect(steps[0]).toMatchObject({text:'Think about living things.',answer:'A dog grows.'});
});
it('preserves unfamiliar formats, code and decimals without inventing exercises',()=>{
 const text='A value is 3.14. Use x = 2. Example: console.log(x).';
 expect(readingSteps({content:text}).map(s=>s.text).join(' ')).toBe(text);
 expect(readingSteps({content:text}).every(s=>!s.answer)).toBe(true);
});
it('breaks long prose into smaller steps without deleting sentences',()=>{
 const text=Array.from({length:30},(_,i)=>`Sentence ${i} describes a concept in this lesson.`).join(' ');
 const steps=readingSteps(section(text,'The idea'));expect(steps.length).toBeGreaterThan(1);expect(steps.map(s=>s.text).join(' ')).toBe(text);
});
it('preserves content and sections and tolerates malformed optional data',()=>{
 expect(readingSteps({content:'Introduction.',sections:[null,{text:123},{heading:'Idea',text:'Details.'}]}).map(s=>s.text)).toEqual(['Introduction.','Details.']);
});
it('exports a study sheet separately from its explanation key',async()=>{
 const {studySheet}=await import('./reading-steps');const body=section('What is a control? Answer: The untreated comparison.');
 expect(studySheet('Biology',body)).not.toContain('The untreated comparison.');expect(studySheet('Biology',body,true)).toContain('The untreated comparison.');
});
it('adds reviewed biology choices and supports authored practice question options',()=>{
 const steps=readingSteps({sections:[{heading:'Your turn',text:'Which life property lets a plant bend toward a window? Answer: Responding to the environment.'}],practice_questions:[{prompt:'Select the control.',options:['Untreated group','Treated group'],answer:0,explanation:'The untreated group provides the comparison.'}]});
 expect(steps[0].options?.[steps[0].correct!]).toBe('Responding to the environment');
 expect(steps[1]).toMatchObject({correct:0,options:['Untreated group','Treated group']});
});
