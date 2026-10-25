-- 啱啱好 admin：權限、處理申訴／舉報／禮券、操作紀錄
-- 要喺 20261025000000_aam_aam_ho.sql 之後執行。
-- admin 身份沿用現有 public.user_roles（role = admin / super_admin）。

alter table public.aah_profiles add column if not exists warnings int not null default 0;

create or replace function public.aah_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id::text = auth.uid()::text and role::text in ('admin', 'super_admin')
  );
$$;

-- ============ admin 操作紀錄 ============
create table if not exists public.aah_admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  action text not null,        -- appeal_approve / appeal_reject / report_warn / report_ban / report_dismiss / voucher_approve / voucher_reject
  target_type text not null,   -- appeal / report / voucher
  target_id uuid not null,
  user_id uuid,                -- 受影響嘅用戶
  note text,
  created_at timestamptz not null default now()
);
alter table public.aah_admin_actions enable row level security;
create policy aah_admin_actions_read on public.aah_admin_actions for select using (public.aah_is_admin());

-- ============ admin 睇得晒所有啱啱好資料 ============
create policy aah_admin_read_profiles on public.aah_profiles for select using (public.aah_is_admin());
create policy aah_admin_read_posts on public.aah_posts for select using (public.aah_is_admin());
create policy aah_admin_read_interests on public.aah_interests for select using (public.aah_is_admin());
create policy aah_admin_read_interest_messages on public.aah_interest_messages for select using (public.aah_is_admin());
create policy aah_admin_read_matches on public.aah_matches for select using (public.aah_is_admin());
create policy aah_admin_read_participants on public.aah_match_participants for select using (public.aah_is_admin());
create policy aah_admin_read_messages on public.aah_messages for select using (public.aah_is_admin());
create policy aah_admin_read_ledger on public.aah_point_ledger for select using (public.aah_is_admin());
create policy aah_admin_read_reports on public.aah_reports for select using (public.aah_is_admin());
create policy aah_admin_read_appeals on public.aah_appeals for select using (public.aah_is_admin());
create policy aah_admin_read_vouchers on public.aah_voucher_requests for select using (public.aah_is_admin());

-- 申訴改為經 function 提交（檢查 48 小時期限），唔俾直接寫
alter policy aah_appeals_own on public.aah_appeals using (user_id = auth.uid()) with check (false);

create or replace function public.aah_submit_appeal(p_text text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r aah_reports%rowtype;
  a_id uuid;
begin
  select * into r from aah_reports
    where accused_id = auth.uid() and kind = 'noshow' and status = 'open'
    order by created_at desc limit 1;
  if r.id is null then raise exception 'no open no-show report'; end if;
  if r.created_at < now() - interval '48 hours' then raise exception 'appeal window closed'; end if;
  if exists (select 1 from aah_appeals where report_id = r.id) then raise exception 'already appealed'; end if;
  insert into aah_appeals (user_id, report_id, text) values (auth.uid(), r.id, left(p_text, 300)) returning id into a_id;
  return a_id;
end $$;

-- ============ 處理申訴 ============
-- 撤銷：解除停用、冇出現次數減一、還返實際扣咗嘅分；維持：舉報成立
create or replace function public.aah_admin_decide_appeal(p_appeal uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  a aah_appeals%rowtype;
  v_restore int;
begin
  if not public.aah_is_admin() then raise exception 'not admin'; end if;
  select * into a from aah_appeals where id = p_appeal for update;
  if a.status <> 'pending' then raise exception 'already decided'; end if;

  if p_approve then
    update aah_appeals set status = 'approved' where id = a.id;
    update aah_reports set status = 'dismissed' where id = a.report_id;
    select coalesce(-l.pts, 0) into v_restore from aah_point_ledger l join aah_reports r on r.match_id = l.match_id
      where r.id = a.report_id and l.user_id = a.user_id and l.reason = 'noshow' order by l.created_at desc limit 1;
    v_restore := coalesce(v_restore, 0);
    update aah_profiles set banned_until = null, no_shows = greatest(0, no_shows - 1), points = points + v_restore where id = a.user_id;
    insert into aah_point_ledger (user_id, pts, reason) values (a.user_id, v_restore, 'appeal_restore');
  else
    update aah_appeals set status = 'rejected' where id = a.id;
    update aah_reports set status = 'upheld' where id = a.report_id;
  end if;

  insert into aah_admin_actions (admin_id, action, target_type, target_id, user_id, note)
  values (auth.uid(), case when p_approve then 'appeal_approve' else 'appeal_reject' end, 'appeal', a.id, a.user_id, p_note);
end $$;

-- ============ 處理舉報（要求預先轉數、騷擾、假收據等） ============
create or replace function public.aah_admin_decide_report(p_report uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r aah_reports%rowtype;
begin
  if not public.aah_is_admin() then raise exception 'not admin'; end if;
  if p_action not in ('warn', 'ban', 'dismiss') then raise exception 'bad action'; end if;
  select * into r from aah_reports where id = p_report for update;
  if r.status <> 'open' then raise exception 'already decided'; end if;

  if p_action = 'warn' then
    update aah_profiles set warnings = warnings + 1 where id = r.accused_id;
    update aah_reports set status = 'upheld' where id = r.id;
  elsif p_action = 'ban' then
    update aah_profiles set banned_until = greatest(coalesce(banned_until, now()), now()) + interval '30 days' where id = r.accused_id;
    update aah_reports set status = 'upheld' where id = r.id;
  else
    update aah_reports set status = 'dismissed' where id = r.id;
  end if;

  insert into aah_admin_actions (admin_id, action, target_type, target_id, user_id, note)
  values (auth.uid(), 'report_' || p_action, 'report', r.id, r.accused_id, p_note);
end $$;

-- ============ 禮券批核 ============
-- 拒絕會還返積分
create or replace function public.aah_admin_decide_voucher(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v aah_voucher_requests%rowtype;
begin
  if not public.aah_is_admin() then raise exception 'not admin'; end if;
  select * into v from aah_voucher_requests where id = p_request for update;
  if v.status <> 'pending' then raise exception 'already decided'; end if;

  if p_approve then
    update aah_voucher_requests set status = 'approved' where id = v.id;
  else
    update aah_voucher_requests set status = 'rejected' where id = v.id;
    update aah_profiles set points = points + v.points where id = v.user_id;
    insert into aah_point_ledger (user_id, pts, reason) values (v.user_id, v.points, 'voucher_refund');
  end if;

  insert into aah_admin_actions (admin_id, action, target_type, target_id, user_id, note)
  values (auth.uid(), case when p_approve then 'voucher_approve' else 'voucher_reject' end, 'voucher', v.id, v.user_id, p_note);
end $$;

grant execute on function public.aah_submit_appeal(text) to authenticated;
grant execute on function public.aah_admin_decide_appeal(uuid, boolean, text) to authenticated;
grant execute on function public.aah_admin_decide_report(uuid, text, text) to authenticated;
grant execute on function public.aah_admin_decide_voucher(uuid, boolean, text) to authenticated;
