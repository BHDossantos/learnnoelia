import { describe,it,expect } from 'vitest';
import { validateLessonBody } from './lesson-schema';
describe('stored lesson body validation',()=>{
  it.each(['vocab','quiz','roleplay','reading','grammar','listening','writing','code'])('rejects JSON of wrong shape for %s',kind=>{
    expect(()=>validateLessonBody(kind,{wrong:true})).toThrow();
  });
  it('rejects quiz answers beyond the options',()=>{
    expect(()=>validateLessonBody('quiz',{questions:[{prompt:'Choose one',options:['A','B'],answer:2}]})).toThrow();
  });
  it('preserves supported extra content instead of stripping it on save',()=>{
    const body={content:'Read this',image_url:'/image.png'};
    expect(validateLessonBody('reading',body)).toEqual(body);
  });
  it('accepts sections used by seeded content',()=>{
    expect(validateLessonBody('reading',{sections:[{heading:'Topic',text:'Explanation'}]})).toBeTruthy();
  });
  it('accepts actual code runner test shapes',()=>{
    expect(validateLessonBody('code',{language:'python',prompt:'Return 2',tests:[{label:'result',expr:'result == 2'}]})).toBeTruthy();
  });
  it('rejects unknown kinds rather than writing unchecked data',()=>{
    expect(()=>validateLessonBody('unknown',{})).toThrow();
  });
});
