import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table public.tutor_sessions(id uuid primary key,student_id uuid,tutor_id uuid,status text default 'live',ended_at timestamptz,stripe_payment_intent text,max_budget_cents int,cents_charged int default 0);
    create table public.payments(id uuid primary key,user_id uuid,session_id uuid,stripe_payment_intent text,amount_cents int,status text);
    alter table tutor_sessions enable row level security;
    create policy "session participants" on tutor_sessions for all using(auth.uid()=student_id or auth.uid()=tutor_id) with check(auth.uid()=student_id or auth.uid()=tutor_id);
    grant all on tutor_sessions,payments to authenticated,service_role;
    insert into tutor_sessions values('${sid}','${a}','${b}','live',null,'pi_test',1000,0);`);
  await db.exec(readFileSync('supabase/migrations/0047_tutor_settlement_integrity.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
describe('settlement SQL and RLS',()=>{
  it('participants can read but cannot forge session billing or call settlement RPCs',async()=>{
    await db.exec(`set role authenticated; set test.uid='${a}'`);
    expect((await db.query('select * from tutor_sessions')).rows).toHaveLength(1);
    await expect(db.exec(`update tutor_sessions set cents_charged=0`)).rejects.toThrow();
    await expect(db.exec(`delete from tutor_sessions`)).rejects.toThrow();
    await expect(db.exec(`insert into tutor_sessions(id,student_id,tutor_id) values('${c}','${a}','${b}')`)).rejects.toThrow();
    await expect(db.query(`select begin_tutor_settlement('${sid}','${a}')`)).rejects.toThrow();
    await expect(db.query('select * from tutor_settlements')).rejects.toThrow();
    await db.exec(`set test.uid='${c}'`);
    expect((await db.query('select * from tutor_sessions')).rows).toHaveLength(0);
    await db.exec('reset role');
  });
  it('checks actor even for privileged callers, freezes once, and uses one receipt per intent',async()=>{
    await db.exec('set role service_role');
    await expect(db.query(`select begin_tutor_settlement('${sid}','${c}')`)).rejects.toThrow();
    const first=await db.query(`select (begin_tutor_settlement('${sid}','${a}')).*`);
    const replay=await db.query(`select (begin_tutor_settlement('${sid}','${b}')).*`);
    expect(replay.rows).toEqual(first.rows);
    expect((await db.query(`select status from tutor_sessions where id='${sid}'`)).rows).toEqual([{status:'ended'}]);
    await db.exec(`insert into tutor_sessions values('${c}','${a}','${b}','live',null,'pi_test',1000,0)`);
    await expect(db.query(`select begin_tutor_settlement('${c}','${a}')`)).rejects.toThrow();
    expect((await db.query(`select status from tutor_sessions where id='${c}'`)).rows).toEqual([{status:'live'}]);
    await db.exec('reset role');
  });
  it('rolls back receipt/session accounting if any write fails',async()=>{
    await db.exec("alter table payments add constraint simulated_failure check(amount_cents < 500)");
    await db.exec('set role service_role');
    await expect(db.query(`select finish_tutor_settlement('${sid}','captured',700)`)).rejects.toThrow();
    expect((await db.query('select state from tutor_settlements')).rows).toEqual([{state:'pending'}]);
    expect((await db.query('select * from payments')).rows).toHaveLength(0);
    await db.exec('reset role; alter table payments drop constraint simulated_failure');
  });
  it('rejects out-of-budget receipts and conflicting payment IDs without claiming success',async()=>{
    await db.exec('set role service_role');
    await expect(db.query(`select finish_tutor_settlement('${sid}','captured',1001)`)).rejects.toThrow();
    await db.exec(`insert into payments(id,session_id,amount_cents,status) values('${sid}','${c}',100,'captured')`);
    await expect(db.query(`select finish_tutor_settlement('${sid}','captured',700)`)).rejects.toThrow();
    expect((await db.query('select state from tutor_settlements')).rows).toEqual([{state:'pending'}]);
    await db.exec(`reset role; delete from payments where id='${sid}'`);
  });
  it('replays concurrent receipt finalization once and never downgrades captured',async()=>{
    await db.exec('set role service_role');
    await Promise.all([db.query(`select finish_tutor_settlement('${sid}','captured',700)`),db.query(`select finish_tutor_settlement('${sid}','captured',700)`)]);
    await db.query(`select finish_tutor_settlement('${sid}','review_required',0)`);
    expect((await db.query('select state,amount_cents from tutor_settlements')).rows).toEqual([{state:'captured',amount_cents:700}]);
    expect((await db.query('select amount_cents,status from payments')).rows).toEqual([{amount_cents:700,status:'captured'}]);
    await db.exec('reset role');
  });
});
