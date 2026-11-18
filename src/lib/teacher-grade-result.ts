import {z} from 'zod';
const Criterion=z.object({name:z.string().min(1).max(160),score:z.number().finite().nonnegative(),max:z.number().finite().positive(),feedback:z.string().max(4000)}).refine(c=>c.score<=c.max);
const Grade=z.object({criteria:z.array(Criterion).min(1).max(30),score:z.number().finite().nonnegative(),max_score:z.number().finite().positive(),feedback_md:z.string().min(1).max(8000),confidence:z.number().min(0).max(1)});
export function parseTeacherGrade(raw:unknown,maximum:number){const grade=Grade.parse(raw);if(grade.max_score!==maximum||grade.score>maximum)throw new Error('Grade scale does not match the assignment.');return grade;}
