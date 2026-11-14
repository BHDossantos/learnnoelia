import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const student = "11111111-1111-4111-8111-111111111111", teacher = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333", guardian = "44444444-4444-4444-8444-444444444444";
const paper = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", submission = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let db: PGlite;
async function as(id: string) { await db.exec(`reset role; set role authenticated; set test.uid='${id}'`); }
async function source(kind: string, id: string) { return (await db.query<{ source: { source_key: string } }>("select marking_source($1,$2) as source", [kind, id])).rows[0].source; }
const marks = [{ id: paper, kind: "cross", surface: "image", x: 0.2, y: 0.3 }, { id: submission, kind: "score", surface: "text", x: 0.1, y: 0.2, earned: 6, possible: 6 }];
async function save(kind: string, id: string, key: string, version: number, value: unknown = marks) {
 return db.query<{ doc: { version: number; marks: unknown } }>("select to_jsonb(save_grading_markings($1,$2,$3,$4,$5)) as doc", [kind, id, key, version, JSON.stringify(value)]);
}
beforeAll(async () => {
 db = new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create schema storage;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated;
 create table profiles(id uuid primary key); insert into profiles values('${student}'),('${teacher}'),('${other}'),('${guardian}');
 create table paper_gradings(id uuid primary key,student_id uuid,raw_text text,created_at timestamptz default now());
 create table assignments(id uuid primary key,teacher_id uuid);
 create table submissions(id uuid primary key,assignment_id uuid,student_id uuid,text text,file_url text,submitted_at timestamptz default now());
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 create function teaches_student(uuid) returns boolean language sql as $$select auth.uid()='${teacher}'::uuid and $1='${student}'::uuid$$;
 alter table paper_gradings enable row level security;
 create policy paper_read on paper_gradings for select using(student_id=auth.uid() or teaches_student(student_id) or auth.uid()='${guardian}');
 create policy paper_update on paper_gradings for update using(student_id=auth.uid());
 create policy paper_insert on paper_gradings for insert with check(student_id=auth.uid() or teaches_student(student_id));
 alter table submissions enable row level security;
 create policy submission_read on submissions for select using(student_id=auth.uid() or exists(select 1 from assignments a where a.id=assignment_id and a.teacher_id=auth.uid()));
 alter table storage.objects enable row level security;
 create policy submission_object_read on storage.objects for select using(bucket_id='submissions' and split_part(name,'/',1)=auth.uid()::text);
 grant select,insert,update,delete on all tables in schema public,storage to authenticated;
 insert into paper_gradings(id,student_id,raw_text) values('${paper}','${student}','Original paper text');
 insert into assignments values('${paper}','${teacher}');
 insert into submissions(id,assignment_id,student_id,text,file_url) values('${submission}','${paper}','${student}','Original virtual work','${student}/test.png');`);
 await db.exec(readFileSync("supabase/migrations/0052_teacher_markings.sql", "utf8"));
 await db.exec(`set test.uid='${teacher}'; insert into paper_gradings(id,student_id,raw_text,original_path,original_mime) values('${other}','${student}','Scanned work','${teacher}/scan.png','image/png');
 insert into storage.objects(bucket_id,name) values('paper-originals','${teacher}/scan.png'),('submissions','${student}/test.png');`);
}, 30000);
afterAll(async () => { await db?.close(); });
describe("marking persistence and permissions (real Postgres engine)", () => {
 it("saves and reloads image and virtual markings without altering original text or scores", async () => {
  await as(teacher);
  for (const [kind, id] of [["paper", other], ["submission", submission]]) {
   const s = await source(kind, id);
   const result = await save(kind, id, s.source_key, 0);
   expect(result.rows[0].doc.version).toBe(1); expect(result.rows[0].doc.marks).toEqual(marks);
  }
  expect((await db.query("select text from submissions")).rows).toEqual([{ text: "Original virtual work" }]);
  expect((await db.query("select marks from grading_markings")).rows).toHaveLength(2);
 });
 it("rejects stale concurrent edits while allowing correction and saved removal", async () => {
  await as(teacher); const s = await source("submission", submission);
  await save("submission", submission, s.source_key, 1, []);
  await expect(save("submission", submission, s.source_key, 1)).rejects.toThrow(/changed/);
  expect((await save("submission", submission, s.source_key, 2)).rows[0].doc.version).toBe(3);
 });
 it("students and guardians can read their allowed marks but cannot forge or delete them", async () => {
  await as(student); expect((await db.query("select * from grading_markings")).rows).toHaveLength(2);
  const s = await source("submission", submission);
  await expect(save("submission", submission, s.source_key, 3)).rejects.toThrow(/forbidden/);
  await expect(db.exec("update grading_markings set marks='[]'")).rejects.toThrow();
  await expect(db.exec("delete from grading_markings")).rejects.toThrow();
  await as(guardian); expect((await db.query("select * from grading_markings")).rows).toHaveLength(1);
  await expect(save("paper", other, (await source("paper", other)).source_key, 1)).rejects.toThrow(/forbidden/);
 });
 it("outsiders cannot read originals, read marks or save marks; anonymous cannot call RPCs", async () => {
  await as(other); expect((await db.query("select * from grading_markings")).rows).toHaveLength(0);
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(0);
  await expect(source("paper", paper)).rejects.toThrow(/not found/);
  await expect(save("paper", paper, "a".repeat(32), 0)).rejects.toThrow(/forbidden/);
  await db.exec("reset role; set role anon"); await expect(source("paper", paper)).rejects.toThrow();
 });
 it("retains historical marks and snapshots and rejects a save against replaced work", async () => {
  await as(teacher); const old = await source("submission", submission);
  await db.exec(`reset role; update submissions set text='Revised work',file_url=null,submitted_at=now() where id='${submission}'`);
  await as(teacher); await expect(save("submission", submission, old.source_key, 3)).rejects.toThrow(/Source changed/);
  const next = await source("submission", submission);
  await save("submission", submission, next.source_key, 0, [{ ...marks[1], earned: 3, possible: 6 }]);
  const history = await db.query("select source_text,marks from grading_markings where submission_id=$1 order by version desc", [submission]);
  expect(history.rows).toHaveLength(2); expect(history.rows[0]).toEqual({ source_text: "Original virtual work", marks });
 });
 it("protects uploaded original bytes, references and historical assignment attachments", async () => {
  await as(student);
  expect((await db.query("select * from storage.objects where bucket_id='paper-originals'")).rows).toHaveLength(1);
  expect((await db.query("delete from storage.objects returning *")).rows).toHaveLength(0);
  expect((await db.query("update storage.objects set name='tampered' returning *")).rows).toHaveLength(0);
  await expect(db.exec(`update paper_gradings set original_path='${student}/fake.png' where id='${other}'`)).rejects.toThrow(/cannot be replaced/);
  await expect(db.exec(`insert into paper_gradings(id,student_id,original_path) values('${guardian}','${student}','${teacher}/scan.png')`)).rejects.toThrow(/Invalid original owner/);
 });
 it("validates direct RPC input instead of relying solely on the HTTP schema", async () => {
  await as(teacher); const s = await source("paper", other);
  for (const value of [[{ ...marks[0], x: -1 }], [{ ...marks[1], possible: 0 }], [marks[0], marks[0]], {}, null]) {
   await expect(save("paper", other, s.source_key, 1, value)).rejects.toThrow();
  }
 });
});
