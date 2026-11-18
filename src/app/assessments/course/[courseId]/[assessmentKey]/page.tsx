import {notFound} from 'next/navigation';
import {studyCourse} from '@/lib/study-course-server';
import {publicQuestions} from '@/lib/course-assessments';
import {StudyExam} from './StudyExam';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{courseId:string;assessmentKey:string}>}){
 const {courseId,assessmentKey}=await params;const data=await studyCourse(courseId);if(!data)notFound();
 const assessment=[...data.exams,...data.quizzes].find(a=>a.key===assessmentKey);if(!assessment?.ready)notFound();
 return <StudyExam courseId={courseId} courseTitle={data.course.title} assessmentKey={assessmentKey} title={assessment.title} questions={publicQuestions(assessment.questions)}/>;
}
