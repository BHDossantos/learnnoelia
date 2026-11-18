import {expect,it} from 'vitest';
import {teacherWorklist,type ReviewSubmission} from './teacher-worklist';
import {parseTeacherGrade} from './teacher-grade-result';
const student=[{id:'s',name:'Alex'}],assignment=[{id:'a',course_id:'c',title:'Test',max_score:100,due_at:'2026-01-01'}],enrollment=[{user_id:'s',course_id:'c'}];
const submission:ReviewSubmission={id:'work',assignment_id:'a',student_id:'s',status:'submitted',text:'My answer',ai_grades:[],teacher_reviews:[]};
it('does not create missing-work or failing-grade claims for unenrolled students',()=>{expect(teacherWorklist(student,assignment,[],[])).toEqual([]);expect(teacherWorklist(student,assignment,[],enrollment,Date.parse('2026-02-01'))[0]).toMatchObject({state:'overdue',score:null,canPrepare:false});});
it('uses latest grade, keeps draft separate from returned work and never batches a student draft',()=>{
 const s={...submission,ai_grades:[{score:20,max_score:100,feedback_md:'Old',created_at:'2026-01-01'},{score:80,max_score:100,feedback_md:'New',created_at:'2026-01-02'}]};
 expect(teacherWorklist(student,assignment,[s],enrollment)[0]).toMatchObject({state:'ready',score:80,feedback:'New',canPrepare:false});
 expect(teacherWorklist(student,assignment,[{...s,status:'draft'}],enrollment)[0]).toMatchObject({state:'draft',score:null,canPrepare:false});
 expect(teacherWorklist(student,assignment,[{...s,status:'returned',teacher_reviews:[{final_score:85,reviewed_at:'2026-01-03'}]}],enrollment)[0]).toMatchObject({state:'returned',score:85});
});
it('only offers batch preparation for text submissions lacking a valid grade',()=>{expect(teacherWorklist(student,assignment,[submission],enrollment)[0].canPrepare).toBe(true);expect(teacherWorklist(student,assignment,[{...submission,text:null}],enrollment)[0].canPrepare).toBe(false);});
it('rejects invalid provider scores and rubric marks before saving',()=>{
 const g={score:80,max_score:100,feedback_md:'Useful feedback',confidence:.8,criteria:[{name:'Reasoning',score:8,max:10,feedback:'Explain why.'}]};
 expect(parseTeacherGrade(g,100).score).toBe(80);
 for(const bad of [{...g,score:101},{...g,max_score:10},{...g,confidence:2},{...g,criteria:[{...g.criteria[0],score:11}]}])expect(()=>parseTeacherGrade(bad,100)).toThrow();
});
