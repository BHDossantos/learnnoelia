export type ReviewGrade={score:number|null;max_score:number|null;feedback_md:string|null;created_at:string;criteria?:unknown};
export type ReviewSubmission={id:string;assignment_id:string;student_id:string;status:string;text:string|null;ai_grades:ReviewGrade[];teacher_reviews:{final_score:number|null;reviewed_at:string}[]};
export type ReviewAssignment={id:string;course_id:string;title:string;max_score:number;due_at:string|null};
export type WorkItem={studentId:string;studentName:string;assignmentId:string;assignmentTitle:string;submissionId?:string;state:'overdue'|'not-submitted'|'draft'|'needs-grading'|'ready'|'returned';score:number|null;maxScore:number;feedback:string|null;canPrepare:boolean};
export function teacherWorklist(students:{id:string;name:string}[],assignments:ReviewAssignment[],submissions:ReviewSubmission[],enrollments:{user_id:string;course_id:string}[],now=Date.now()):WorkItem[]{
 const enrolled=new Set(enrollments.map(e=>`${e.user_id}:${e.course_id}`));
 const submitted=new Map(submissions.map(s=>[`${s.student_id}:${s.assignment_id}`,s]));
 return students.flatMap(student=>assignments.filter(a=>enrolled.has(`${student.id}:${a.course_id}`)).map(a=>{
  const s=submitted.get(`${student.id}:${a.id}`);
  const grade=s?.ai_grades?.slice().sort((x,y)=>y.created_at.localeCompare(x.created_at))[0];
  const review=s?.teacher_reviews?.slice().sort((x,y)=>y.reviewed_at.localeCompare(x.reviewed_at))[0];
  const usable=!!grade&&typeof grade.score==='number'&&grade.max_score===a.max_score&&grade.score>=0&&grade.score<=a.max_score;
  const state:WorkItem['state']=!s?(a.due_at&&Date.parse(a.due_at)<now?'overdue':'not-submitted'):s.status==='draft'?'draft':s.status==='returned'?'returned':usable?'ready':'needs-grading';
  return {studentId:student.id,studentName:student.name,assignmentId:a.id,assignmentTitle:a.title,submissionId:s?.id,state,score:state==='returned'?review?.final_score??null:state==='ready'?grade!.score:null,maxScore:a.max_score,feedback:state==='ready'?grade?.feedback_md??null:null,canPrepare:state==='needs-grading'&&!!s?.text?.trim()};
 })).sort((a,b)=>({overdue:0,ready:1,'needs-grading':2,draft:3,'not-submitted':4,returned:5}[a.state]-{overdue:0,ready:1,'needs-grading':2,draft:3,'not-submitted':4,returned:5}[b.state])||a.studentName.localeCompare(b.studentName));
}
