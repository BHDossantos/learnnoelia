-- Live exam monitoring: a lightweight event log so teachers can see who's taking
-- an exam right now and flag suspicious focus loss (tab switching). Idempotent.
create table if not exists public.assessment_monitor_events (
  id bigserial primary key,
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  event_type text not null check (event_type in ('start', 'focus_lost', 'focus_gained', 'submit')),
  created_at timestamptz not null default now()
);
create index if not exists idx_monitor_events_attempt on public.assessment_monitor_events (attempt_id, created_at desc);
alter table public.assessment_monitor_events enable row level security;

-- The attempt's student may log their own events; the assessment's teacher reads.
drop policy if exists "monitor student insert" on public.assessment_monitor_events;
create policy "monitor student insert" on public.assessment_monitor_events for insert
  with check (exists (select 1 from public.assessment_attempts at where at.id = attempt_id and at.student_id = auth.uid()));
drop policy if exists "monitor teacher read" on public.assessment_monitor_events;
create policy "monitor teacher read" on public.assessment_monitor_events for select
  using (public.is_assessment_teacher((select at.assessment_id from public.assessment_attempts at where at.id = attempt_id)));
