import {expect,it} from 'vitest';
import {courseFromPath} from './course-context';
import {courseArt} from './course-art';
const id='bbbb0004-0000-4000-8000-000000000001';
it('keeps course context for lessons and assessments, without guessing a default language',()=>{expect(courseFromPath(`/learn/${id}/lesson`)).toBe(id);expect(courseFromPath(`/assessments/course/${id}/exam-1`)).toBe(id);expect(courseFromPath('/review')).toBeNull();});
it('uses distinct relevant artwork for the six science topics in the reported catalog',()=>{expect(new Set(['Concepts of Biology','Introduction to Psychology','Introduction to Chemistry','Introduction to Sociology','Introduction to Physics','Anatomy & Physiology'].map(t=>courseArt(t,'science').index)).size).toBe(6);});
