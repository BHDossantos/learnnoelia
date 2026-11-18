'use server';
import {z} from 'zod';
import {studyCourse} from '@/lib/study-course-server';
import {gradeStudyAssessment} from '@/lib/course-assessments';
const Input=z.object({courseId:z.string().uuid(),key:z.string().regex(/^(quiz|exam)-\d{1,2}$/),responses:z.record(z.string().max(100),z.union([z.string().max(5000),z.number().int().min(0).max(100)]))});
export async function checkStudyAttempt(input:unknown){
 const parsed=Input.parse(input);if(Object.keys(parsed.responses).length>100)throw new Error('Too many responses');
 const data=await studyCourse(parsed.courseId);const assessment=data&&[...data.exams,...data.quizzes].find(a=>a.key===parsed.key);
 if(!assessment?.ready)throw new Error('This course assessment is not available.');
 return gradeStudyAssessment(assessment,parsed.responses);
}
