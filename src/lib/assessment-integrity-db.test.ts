import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest';
const student='11111111-1111-4111-8111-111111111111', teacher='22222222-2222-4222-8222-222222222222', outsider='33333333-3333-4333-8333-333333333333';
const classroom='cccccccc-cccc-4ccc-8ccc-cccccccccccc', assessment='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', question='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db:PGlite, attempt:string;
const sql=(name:string)=>readFileSync(`supabase/migrations/${name}`,'utf8');
async function user(id:string) { await db.exec(`reset role; set role authenticated; set test.uid='${id}'`); }
async function owner() { await db.exec('reset role'); }
async function submit(written=false) {
 await owner(); await db.exec('set role service_role');
 const result=[{question_id:question,response:{text:'answer'},points_awarded:written?null:2,is_correct:written?null:true}];
 return db.query('select submit_assessment_result($1,$2,$3)',[attempt,student,JSON.stringify(result)]);
}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create table profiles(id uuid primary key); insert into profiles values('${student}'),('${teacher}'),('${outsider}');
 create table classrooms(id uuid primary key); insert into classrooms values('${classroom}');
 create function public.is_classroom_teacher(uuid) returns boolean language sql as $$select auth.uid()='${teacher}'::uuid and $1='${classroom}'::uuid$$;
 create function public.is_classroom_member(uuid) returns boolean language sql as $$select auth.uid()='${student}'::uuid and $1='${classroom}'::uuid$$;`);
 await db.exec(sql('0030_mastery_engine.sql'));
 await db.exec(sql('0046_assessment_engine.sql'));
 await db.exec(`create table grade_items(id uuid primary key default gen_random_uuid(),classroom_id uuid,assessment_id uuid references assessments(id) on delete cascade,name text,type text,max_points numeric,published boolean,unique(classroom_id,assessment_id));
 create table grade_entries(id uuid primary key default gen_random_uuid(),grade_item_id uuid references grade_items(id) on delete cascade,student_id uuid,points numeric,graded_by uuid,graded_at timestamptz default now(),unique(grade_item_id,student_id));
 grant all on all tables in schema public to authenticated,service_role;
 grant usage on all sequences in schema public to authenticated,service_role;`);
 await db.exec(sql('0049_assessment_integrity.sql'));
},30000);
beforeEach(async()=>{
 await owner(); await db.exec(`truncate assessments,mastery_events,skill_states,misconceptions cascade;
 insert into assessments(id,classroom_id,created_by,title,status) values('${assessment}','${classroom}','${teacher}','Exam','published');
 insert into assessment_questions(id,assessment_id,kind,prompt,points) values('${question}','${assessment}','short','Question',2);
 insert into assessment_answer_keys(question_id,correct_text) values('${question}','answer');`);
 await user(student);
 const r=await db.query<{id:string}>(`select start_assessment_attempt('${assessment}') as id`);attempt=r.rows[0].id;
});
afterAll(async()=>{await db?.close();});
describe('assessment transactions and access',()=>{
 it('denies client score/status forgery and keeps answer keys secret',async()=>{
  await expect(db.exec(`update assessment_attempts set score=100,published=true`)).rejects.toThrow();
  await expect(db.exec(`insert into assessment_responses(attempt_id,question_id,points_awarded) values('${attempt}','${question}',2)`)).rejects.toThrow();
  expect((await db.query('select * from assessment_answer_keys')).rows).toEqual([]);
  await expect(db.query(`select submit_assessment_result('${attempt}','${student}','[]')`)).rejects.toThrow();
  await expect(db.query(`select commit_assessment_result('${attempt}')`)).rejects.toThrow();
 });
 it('rejects outsider start, save, score and publish',async()=>{
  await user(outsider);
  for(const stmt of [`select start_assessment_attempt('${assessment}')`,`select save_assessment_response('${attempt}','${question}','{}')`,`select score_assessment_written('${classroom}','${attempt}','${question}',1,null)`,`select publish_assessment_result('${classroom}','${attempt}')`]) await expect(db.query(stmt)).rejects.toThrow();
 });
 it('autosaves only matching questions while open and submission includes latest snapshot',async()=>{
  await db.query(`select save_assessment_response('${attempt}','${question}','{"text":"old"}')`);
  await expect(db.query(`select save_assessment_response('${attempt}','${outsider}','{}')`)).rejects.toThrow();
  await submit(); await user(student);
  await expect(db.query(`select save_assessment_response('${attempt}','${question}','{"text":"late"}')`)).rejects.toThrow();
  expect((await db.query('select response from assessment_responses')).rows).toEqual([{response:{text:'answer'}}]);
 });
 it('freezes keys and question definitions once an attempt exists',async()=>{
  await user(teacher);
  await expect(db.query(`update assessment_questions set points=99 where id='${question}'`)).rejects.toThrow();
  await expect(db.query(`update assessment_answer_keys set correct_text='different'`)).rejects.toThrow();
 });
 it('rolls the complete submission back if gradebook persistence fails',async()=>{
  await owner(); await db.exec('alter table grade_entries add constraint simulated_failure check(points<1)');
  await expect(submit()).rejects.toThrow();
  expect((await db.query('select status,published from assessment_attempts')).rows).toEqual([{status:'in_progress',published:false}]);
  for(const table of ['assessment_responses','grade_items','grade_entries','mastery_events','skill_states']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  await owner();await db.exec('alter table grade_entries drop constraint simulated_failure');
 });
 it('rejects mismatched trusted actor and incomplete result sets',async()=>{
  await owner();await db.exec('set role service_role');
  await expect(db.query(`select submit_assessment_result('${attempt}','${outsider}','[]')`)).rejects.toThrow();
  await expect(db.query(`select submit_assessment_result('${attempt}','${student}','[]')`)).rejects.toThrow();
 });
 it('repeat submission and publication produce one grade and one mastery event',async()=>{
  await submit();await submit();await user(teacher);
  await Promise.all([db.query(`select publish_assessment_result('${classroom}','${attempt}')`),db.query(`select publish_assessment_result('${classroom}','${attempt}')`)]);
  await owner();expect((await db.query('select * from grade_entries')).rows).toHaveLength(1);
  expect((await db.query('select * from mastery_events')).rows).toHaveLength(1);
  expect((await db.query('select attempts,status from skill_states')).rows).toEqual([{attempts:1,status:'proficient'}]);
 });
 it('students cannot alter formal mastery evidence or derived state',async()=>{
  await submit(); await user(student);
  expect((await db.query('select * from mastery_events')).rows).toHaveLength(1);
  await db.query('update mastery_events set score=0');await db.query('update skill_states set attempts=100');
  await owner(); expect((await db.query('select score from mastery_events')).rows).toEqual([{score:1}]);
  expect((await db.query('select attempts from skill_states')).rows).toEqual([{attempts:1}]);
 });
 it('permits parent deletion cascades without bypassing direct definition locks',async()=>{
  await submit();await owner();await db.exec(`delete from assessments where id='${assessment}'`);
  expect((await db.query('select * from assessment_attempts')).rows).toHaveLength(0);
  expect((await db.query('select * from assessment_responses')).rows).toHaveLength(0);
 });
 it('requires all written scores and rejects missing rows, wrong class, non-written and published edits',async()=>{
  // Build a fresh written assessment before creating its attempt.
  await owner();await db.exec(`delete from assessment_attempts; update assessment_questions set kind='written'`);
  await user(student);attempt=(await db.query<{id:string}>(`select start_assessment_attempt('${assessment}') as id`)).rows[0].id;
  await submit(true);await user(teacher);
  await expect(db.query(`select publish_assessment_result('${classroom}','${attempt}')`)).rejects.toThrow('Every answer');
  await expect(db.query(`select score_assessment_written('${outsider}','${attempt}','${question}',1,null)`)).rejects.toThrow();
  await expect(db.query(`select score_assessment_written('${classroom}','${attempt}','${outsider}',1,null)`)).rejects.toThrow();
  await owner();await db.exec(`delete from assessment_responses`);await user(teacher);
  await expect(db.query(`select score_assessment_written('${classroom}','${attempt}','${question}',1,null)`)).rejects.toThrow('Response not found');
  await owner();await db.exec(`insert into assessment_responses(attempt_id,question_id,response) values('${attempt}','${question}','{"text":"answer"}')`);await user(teacher);
  await db.query(`select score_assessment_written('${classroom}','${attempt}','${question}',1,'Feedback')`);
  await owner();await db.exec('alter table grade_entries add constraint publish_failure check(points<1)');await user(teacher);
  await expect(db.query(`select publish_assessment_result('${classroom}','${attempt}')`)).rejects.toThrow();
  await owner();expect((await db.query('select status,published from assessment_attempts')).rows).toEqual([{status:'submitted',published:false}]);
  expect((await db.query('select * from mastery_events')).rows).toHaveLength(0);
  await db.exec('alter table grade_entries drop constraint publish_failure');await user(teacher);
  await db.query(`select publish_assessment_result('${classroom}','${attempt}')`);
  await expect(db.query(`select score_assessment_written('${classroom}','${attempt}','${question}',2,null)`)).rejects.toThrow('Only submitted');
  await owner();expect((await db.query('select score from assessment_attempts')).rows).toEqual([{score:'1'}]);
 });
});
