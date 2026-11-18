import 'server-only';
import {supabaseServer} from '@/lib/supabase/server';
import {requireOnboardedUser} from '@/lib/auth';
import {allRows} from './all-rows';
import {courseAssessmentPlan,type StudyLesson} from './course-assessments';
export async function studyCourse(courseId:string){
 await requireOnboardedUser();const db=await supabaseServer();
 const {data:course}=await db.from('courses').select('id,title,school').eq('id',courseId).eq('published',true).maybeSingle();
 if(!course)return null;
 const lessons=await allRows((from,to)=>db.from('lessons').select('id,title,kind,body,position').eq('course_id',courseId).order('position').order('id').range(from,to));
 return {course,...courseAssessmentPlan(lessons as StudyLesson[])};
}
