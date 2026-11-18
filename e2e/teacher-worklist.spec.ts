import {test,expect} from './fixtures';
import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,TEST_USER} from './env';
import {randomUUID} from 'node:crypto';
test('teacher daily review uses real status and opens prepared feedback and paper markings',async({page})=>{
 if(!['localhost','127.0.0.1'].includes(new URL(SUPABASE_URL).hostname))throw new Error('Synthetic fixtures require a local Supabase instance.');
 const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const login=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 const {data:auth,error:authError}=await login.auth.signInWithPassword(TEST_USER);if(authError||!auth.user)throw authError??new Error('No teacher fixture');
 const teacher=auth.user.id,org=randomUUID(),classroom=randomUUID(),course=randomUUID(),assignment=randomUUID(),missing=randomUUID(),submission=randomUUID(),paper=randomUUID();
 const {data:newUser,error:userError}=await admin.auth.admin.createUser({email:`review-${randomUUID()}@test.local`,password:'test-password-123',email_confirm:true});if(userError||!newUser.user)throw userError??new Error('No student fixture');const student=newUser.user.id;
 async function insert(table:string,value:Record<string,unknown>|Record<string,unknown>[]){const {error}=await admin.from(table).insert(value);if(error)throw new Error(`${table}: ${error.message}`);}
 try{
  await admin.from('profiles').update({display_name:'Review Student'}).eq('id',student);
  await insert('organizations',{id:org,name:'Review test school',invite_code:randomUUID().slice(0,8),owner_id:teacher});
  await insert('org_members',[{org_id:org,user_id:teacher,role:'teacher'},{org_id:org,user_id:student,role:'student'}]);
  await insert('classrooms',{id:classroom,org_id:org,name:'Daily review test',homeroom_teacher_id:teacher});
  await insert('classroom_members',[{classroom_id:classroom,user_id:teacher,role:'teacher'},{classroom_id:classroom,user_id:student,role:'student'}]);
  await insert('courses',{id:course,title:'Review course',language:'en',kind:'science',teacher_id:teacher,published:true});
  const lesson=randomUUID();
  await insert('lessons',[{id:lesson,course_id:course,title:'Completed lesson',position:1,kind:'reading',body:{content:'Read the evidence.'}},{course_id:course,title:'Next lesson',position:2,kind:'reading',body:{content:'Compare the evidence.'}}]);
  await insert('lesson_progress',{user_id:student,lesson_id:lesson,completed_at:new Date().toISOString(),score:90});
  await insert('classroom_courses',{classroom_id:classroom,course_id:course,assigned_by:teacher});
  await insert('enrollments',{user_id:student,course_id:course,role:'student'});
  await insert('assignments',[{id:assignment,course_id:course,teacher_id:teacher,title:'Fair test',instructions_md:'Explain a control group.',max_score:100,published:true},{id:missing,course_id:course,teacher_id:teacher,title:'Missing task',instructions_md:'Explain the outcome.',max_score:100,published:true,due_at:'2020-01-01T00:00:00Z'}]);
  await insert('submissions',{id:submission,assignment_id:assignment,student_id:student,text:'The control group receives no treatment.',status:'graded'});
  await insert('ai_grades',{submission_id:submission,score:80,max_score:100,feedback_md:'Explain why the control enables a fair comparison.',criteria:[{name:'Explanation',score:8,max:10,feedback:'Explain the comparison.'}],confidence:.9});
  await insert('paper_gradings',{id:paper,student_id:student,graded_by:teacher,title:'Marked test',source:'typed',score:80,max_score:100,annotations:[{label:'Q1',correct:false,detail:'The control was omitted.',correct_answer:'Use an untreated comparison.'}]});
  await page.goto(`/teach/classrooms/${classroom}/review`);
  await expect(page.getByRole('heading',{name:'Daily review test'})).toBeVisible();
  await expect(page.getByText('Overdue · not submitted',{exact:true}).last()).toBeVisible();
  await expect(page.getByText('1/2 lessons',{exact:true})).toBeVisible();
  await expect(page.getByText('80/100',{exact:true})).toBeVisible();
  await expect(page.getByText('Explain why the control enables a fair comparison.',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Review prefilled grade & return →'}).click();
  await expect(page.locator('input[name=finalScore]')).toHaveValue('80');
  await expect(page.locator('textarea[name=comments]')).toHaveValue('Explain why the control enables a fair comparison.');
  await expect(page.getByText('Review · Explanation:',{exact:true})).toBeVisible();
  await page.goto(`/papers/${paper}`);
  await expect(page.getByRole('heading',{name:'Question-by-question markings'})).toBeVisible();
  await expect(page.getByLabel('Marked incorrect')).toBeVisible();
  await expect(page.getByText('Use an untreated comparison.',{exact:false})).toBeVisible();
  await page.goto(`/teach/classrooms/${randomUUID()}/review`);await expect(page.getByText(/could not be found|not found/i).first()).toBeVisible();
 }finally{await admin.from('courses').delete().eq('id',course);await admin.from('organizations').delete().eq('id',org);await admin.auth.admin.deleteUser(student);}
});
