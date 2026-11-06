-- Paid tutoring is paused until payment authorization is implemented.
-- Participants may read sessions but must never edit provider IDs or amounts.
drop policy if exists "session participants" on public.tutor_sessions;
create policy "session participants read" on public.tutor_sessions
  for select to authenticated using (auth.uid() = student_id or auth.uid() = tutor_id);
revoke insert, update, delete on public.tutor_sessions from anon, authenticated;
grant select, update on public.tutor_sessions to service_role;
grant select, insert on public.payments to service_role;

create table public.tutor_settlements (
  session_id uuid primary key references public.tutor_sessions(id) on delete cascade,
  stripe_payment_intent text unique,
  state text not null default 'pending' check (state in ('pending','review_required','captured','cancelled')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  ended_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.tutor_settlements enable row level security;
revoke all on public.tutor_settlements from public, anon, authenticated;
grant all on public.tutor_settlements to service_role;

-- SECURITY INVOKER: service_role is the sole caller. Owner checks are also
-- enforced here so an application bug cannot freeze another user's session.
create function public.begin_tutor_settlement(p_session uuid, p_actor uuid)
returns public.tutor_settlements language plpgsql security invoker set search_path = '' as $$
declare s public.tutor_sessions; result public.tutor_settlements;
begin
  select * into s from public.tutor_sessions where id=p_session for update;
  if not found or p_actor is null or (p_actor <> s.student_id and p_actor <> s.tutor_id) then
    raise exception 'session not found';
  end if;
  select * into result from public.tutor_settlements where session_id=p_session;
  if found then return result; end if;
  insert into public.tutor_settlements(session_id,stripe_payment_intent,ended_at)
    values(s.id,s.stripe_payment_intent,coalesce(s.ended_at,now())) returning * into result;
  update public.tutor_sessions set status='ended',ended_at=result.ended_at where id=s.id;
  return result;
end $$;
revoke all on function public.begin_tutor_settlement(uuid,uuid) from public, anon, authenticated;
grant execute on function public.begin_tutor_settlement(uuid,uuid) to service_role;

-- Receipt and session accounting commit together. Replayed or concurrent
-- reconciliation cannot duplicate a payment or downgrade a confirmed result.
create function public.finish_tutor_settlement(p_session uuid,p_state text,p_amount integer)
returns public.tutor_settlements language plpgsql security invoker set search_path = '' as $$
declare s public.tutor_sessions; result public.tutor_settlements;
begin
  if p_state is null or p_amount is null or p_state not in ('review_required','captured','cancelled') or p_amount < 0
    or (p_state <> 'captured' and p_amount <> 0) then raise exception 'invalid outcome'; end if;
  select * into result from public.tutor_settlements where session_id=p_session for update;
  if not found then raise exception 'missing settlement'; end if;
  if result.state in ('captured','cancelled') then return result; end if;
  select * into s from public.tutor_sessions where id=p_session;
  if p_state='captured' and (s.max_budget_cents is null or p_amount > s.max_budget_cents) then
    raise exception 'receipt exceeds approved budget';
  end if;
  -- Old payment rows were not reliably provider-verified. Keep them for
  -- reconciliation; never silently create a second receipt for that session.
  if exists(select 1 from public.payments where session_id=p_session and id<>p_session) then
    p_state := 'review_required'; p_amount := 0;
  end if;
  if p_state='captured' then
    insert into public.payments(id,user_id,session_id,stripe_payment_intent,amount_cents,status)
      values(s.id,s.student_id,s.id,result.stripe_payment_intent,p_amount,'captured');
  end if;
  update public.tutor_settlements set state=p_state,amount_cents=p_amount,updated_at=now()
    where session_id=p_session returning * into result;
  update public.tutor_sessions set cents_charged=p_amount where id=p_session;
  return result;
end $$;
revoke all on function public.finish_tutor_settlement(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.finish_tutor_settlement(uuid,text,integer) to service_role;
