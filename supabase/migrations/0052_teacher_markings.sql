-- Original work is private and immutable; teacher marks are a separate layer.
alter table public.paper_gradings add column if not exists original_path text;
alter table public.paper_gradings add column if not exists original_mime text;
create unique index if not exists paper_original_path_unique on public.paper_gradings(original_path) where original_path is not null;
insert into storage.buckets(id,name,public) values ('paper-originals','paper-originals',false)
on conflict(id) do update set public=false;

create or replace function public.guard_paper_original() returns trigger
language plpgsql set search_path=public as $$
begin
  if TG_OP='UPDATE' then
    if new.original_path is distinct from old.original_path or new.original_mime is distinct from old.original_mime then
      raise exception 'Original work cannot be replaced';
    end if;
  elsif new.original_path is not null then
    if auth.uid() is null or split_part(new.original_path,'/',1) <> auth.uid()::text then
      raise exception 'Invalid original owner';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists guard_paper_original on public.paper_gradings;
create trigger guard_paper_original before insert or update on public.paper_gradings
for each row execute function public.guard_paper_original();

drop policy if exists "upload private paper original" on storage.objects;
create policy "upload private paper original" on storage.objects for insert to authenticated
with check(bucket_id='paper-originals' and split_part(name,'/',1)=auth.uid()::text);
drop policy if exists "read visible paper original" on storage.objects;
create policy "read visible paper original" on storage.objects for select to authenticated
using(bucket_id='paper-originals' and exists(select 1 from public.paper_gradings p where p.original_path=name));
-- No UPDATE/DELETE policy: a submitted original cannot be overwritten by a user.

create table if not exists public.grading_markings (
 id uuid primary key default gen_random_uuid(),
 paper_id uuid references public.paper_gradings(id) on delete cascade,
 submission_id uuid references public.submissions(id) on delete cascade,
 source_key text not null,
 source_text text,
 source_file text,
 source_mime text,
 marks jsonb not null default '[]'::jsonb,
 version integer not null default 1,
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),
 check ((paper_id is null) <> (submission_id is null)),
 check (jsonb_typeof(marks)='array' and jsonb_array_length(marks)<=500 and octet_length(marks::text)<=200000),
 unique(paper_id,source_key), unique(submission_id,source_key)
);
alter table public.grading_markings enable row level security;
drop policy if exists "read visible grading marks" on public.grading_markings;
create policy "read visible grading marks" on public.grading_markings for select to authenticated using (
 exists(select 1 from public.paper_gradings p where p.id=paper_id)
 or exists(select 1 from public.submissions s where s.id=submission_id)
);
revoke all on public.grading_markings from anon, authenticated;
grant select on public.grading_markings to authenticated;

-- Invoker read: the existing paper/submission RLS remains authoritative.
create or replace function public.marking_source(p_kind text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public as $$
declare v_text text; v_file text; v_mime text; v_revision text; v_edit boolean;
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_kind='paper' then
   select raw_text,original_path,original_mime,created_at::text,public.teaches_student(student_id)
   into v_text,v_file,v_mime,v_revision,v_edit from paper_gradings where id=p_id;
 elsif p_kind='submission' then
   select s.text,s.file_url,null,s.submitted_at::text,a.teacher_id=auth.uid()
   into v_text,v_file,v_mime,v_revision,v_edit from submissions s join assignments a on a.id=s.assignment_id where s.id=p_id;
 else raise exception 'invalid target'; end if;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 return jsonb_build_object('text',v_text,'file',v_file,'mime',v_mime,'can_edit',coalesce(v_edit,false),
   'source_key',md5(jsonb_build_array(v_text,v_file,v_mime,v_revision)::text));
end; $$;
revoke all on function public.marking_source(text,uuid) from public;
grant execute on function public.marking_source(text,uuid) to authenticated;

create or replace function public.save_grading_markings(p_kind text,p_id uuid,p_source_key text,p_version integer,p_marks jsonb)
returns public.grading_markings
language plpgsql security definer set search_path=public as $$
declare v_source jsonb; v_row grading_markings; m jsonb; n integer;
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 -- Lock the target too: edits cannot race a student resubmission.
 if p_kind='paper' then
   perform 1 from paper_gradings where id=p_id and public.teaches_student(student_id) for update;
 elsif p_kind='submission' then
   perform 1 from submissions s join assignments a on a.id=s.assignment_id
    where s.id=p_id and a.teacher_id=auth.uid() for update of s;
 else raise exception 'invalid target'; end if;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 v_source := public.marking_source(p_kind,p_id);
 if v_source->>'source_key' is distinct from p_source_key then raise exception 'Source changed; reload before marking' using errcode='PT409'; end if;
 if p_version is null or p_version<0 or p_marks is null or jsonb_typeof(p_marks)<>'array' then raise exception 'Invalid markings'; end if;
 if jsonb_array_length(p_marks)>500 or octet_length(p_marks::text)>200000 then raise exception 'Too many markings'; end if;
 n:=0;
 for m in select value from jsonb_array_elements(p_marks) loop
   if jsonb_typeof(m)<>'object' or m->>'kind' not in ('check','cross','score') or m->>'kind' is null
     or m->>'surface' not in ('text','image') or m->>'surface' is null
     or coalesce(m->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(jsonb_typeof(m->'x'),'null')<>'number' or coalesce(jsonb_typeof(m->'y'),'null')<>'number'
     or (m->>'x')::numeric not between 0 and 1 or (m->>'y')::numeric not between 0 and 1 then raise exception 'Invalid mark'; end if;
   if m->>'kind'='score' and (coalesce(jsonb_typeof(m->'earned'),'null')<>'number' or coalesce(jsonb_typeof(m->'possible'),'null')<>'number'
     or (m->>'earned')::numeric not between 0 and 10000 or (m->>'possible')::numeric<=0 or (m->>'possible')::numeric>10000) then raise exception 'Invalid score'; end if;
   if m->>'surface'='text' and coalesce(v_source->>'text','')='' then raise exception 'Missing text surface'; end if;
   if m->>'surface'='image' and coalesce(v_source->>'file','')='' then raise exception 'Missing image surface'; end if;
   n:=n+1;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_marks))<>n then raise exception 'Duplicate marks'; end if;
 select * into v_row from grading_markings where source_key=p_source_key
  and ((p_kind='paper' and paper_id=p_id) or (p_kind='submission' and submission_id=p_id)) for update;
 if found then
   if v_row.version<>p_version then raise exception 'Markings changed; reload before saving' using errcode='PT409'; end if;
   update grading_markings set marks=p_marks,version=version+1,updated_by=auth.uid(),updated_at=now()
    where id=v_row.id returning * into v_row;
 else
   if p_version<>0 then raise exception 'Markings changed; reload before saving' using errcode='PT409'; end if;
   insert into grading_markings(paper_id,submission_id,source_key,source_text,source_file,source_mime,marks,updated_by)
    values(case when p_kind='paper' then p_id end,case when p_kind='submission' then p_id end,p_source_key,
      v_source->>'text',v_source->>'file',v_source->>'mime',p_marks,auth.uid()) returning * into v_row;
 end if;
 return v_row;
end; $$;
revoke all on function public.save_grading_markings(text,uuid,text,integer,jsonb) from public;
grant execute on function public.save_grading_markings(text,uuid,text,integer,jsonb) to authenticated;

-- Keep current and historically marked assignment attachments available.
-- There is no submission-object UPDATE policy; uploads already use new paths.
drop policy if exists "submissions student delete own" on storage.objects;
create policy "submissions student delete own" on storage.objects for delete to authenticated
using(bucket_id='submissions' and split_part(name,'/',1)=auth.uid()::text
 and not exists(select 1 from public.submissions s where s.file_url=name)
 and not exists(select 1 from public.grading_markings g where g.submission_id is not null and g.source_file=name));
