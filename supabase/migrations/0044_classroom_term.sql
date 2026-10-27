-- Academic term on a classroom (e.g. "Fall 2026", "Spring 2026", "Q1").
-- Lets teachers organize and filter their classes by term. Idempotent.
alter table public.classrooms add column if not exists term text;
create index if not exists idx_classrooms_term on public.classrooms (org_id, term);
