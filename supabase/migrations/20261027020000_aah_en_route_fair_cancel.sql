-- 「我去緊」公平取消規則：
--  * 一條規則：配對咗之後，對方已經到咗或者喺路上，你無故取消就記一次臨時取消；配對頭 2 分鐘反悔唔計
--  * 去緊嘅人遲到（過咗講好時間 5 分鐘）被取消：同樣當臨時取消（唔再當冇出現停用 30 日）；30 日內兩次先停用一個月
--  * 「接受去緊嘅人」預設改做關，出 post 嘅人自己開先有
--  * 個 post 重新放出時，之前因為配對而收到「已經俾咗人」嘅人變返等緊覆，並收到通知

alter table public.aah_posts alter column accept_en_route set default false;

create or replace function public.aah_create_post(p jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  me aah_profiles%rowtype;
  new_id uuid;
  v_scenario text := p->>'scenario';
  v_leave timestamptz := (p->>'leave_at')::timestamptz;
begin
  select * into me from aah_profiles where id = auth.uid();
  if me.id is null then raise exception 'not registered'; end if;
  if me.banned_until is not null and me.banned_until > now() then raise exception 'banned'; end if;
  if v_leave is null or v_leave <= now() then raise exception 'bad leave time'; end if;
  if v_scenario = 'dining' and (
    select count(*) from aah_posts where author_id = me.id and scenario = 'dining'
      and created_at > date_trunc('day', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong'
  ) >= 3 then raise exception 'dining daily limit'; end if;
  if not coalesce((p->>'verified_on_site')::boolean, false) and not public.aah_setting('allow_test_location') then
    raise exception 'not on site';
  end if;
  insert into aah_posts (scenario, direction, mall_id, mall_name, shop, fields, price, pay_methods, leave_at,
                         author_id, author_name, verified_on_site, auto_accept, need_count, pushed_count, accept_en_route)
  values (
    v_scenario, p->>'direction', p->>'mall_id', p->>'mall_name', p->>'shop',
    coalesce(p->'fields', '{}'::jsonb),
    nullif(p->>'price', '')::int,
    coalesce(array(select jsonb_array_elements_text(p->'pay_methods')), '{}'),
    v_leave, me.id, me.nickname,
    coalesce((p->>'verified_on_site')::boolean, false),
    coalesce((p->>'auto_accept')::boolean, false),
    nullif(p->>'need_count', '')::int,
    public.aah_mall_audience(p->>'mall_id', v_scenario),
    v_scenario <> 'groupbuy' and coalesce((p->>'accept_en_route')::boolean, false)
  ) returning id into new_id;
  return new_id;
end $function$;

-- 重新放出：之前因為配對而被拒絕嘅人變返等緊覆
create or replace function public.aah__restore_interests(p_post uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  v_author uuid;
begin
  select author_id into v_author from aah_posts where id = p_post;
  for r in select id from aah_interests where post_id = p_post and status = 'declined' and declined_by_match loop
    update aah_interests set status = 'pending', declined_by_match = false where id = r.id;
    insert into aah_interest_messages (interest_id, from_id, text) values (r.id, v_author, '個着數重新放出，我再揀緊');
  end loop;
end $function$;

revoke all on function public.aah__restore_interests(uuid) from public, anon, authenticated;

-- 臨時取消記錄（扣分、補償、30 日內第二次停用一個月）
create or replace function public.aah__record_late_cancel(p_match uuid, p_user uuid, p_name text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ded int;
  v_count int;
begin
  select least(30, points) into v_ded from aah_profiles where id = p_user;
  update aah_profiles set points = points - coalesce(v_ded, 0) where id = p_user;
  insert into aah_point_ledger (user_id, match_id, pts, reason) values (p_user, p_match, -coalesce(v_ded, 0), 'late_cancel');
  select count(*) into v_count from aah_point_ledger
    where user_id = p_user and reason = 'late_cancel' and created_at > now() - interval '30 days';
  if v_count >= 2 then
    update aah_profiles set banned_until = greatest(coalesce(banned_until, now()), now()) + interval '30 days', no_shows = no_shows + 1
      where id = p_user;
    insert into aah_reports (match_id, reporter_id, accused_id, kind, note)
      select p_match, user_id, p_user, 'noshow', '30 日內第二次臨時取消（系統自動停用）'
      from aah_match_participants where match_id = p_match and user_id <> p_user limit 1;
    insert into aah_messages (match_id, from_id, text)
      values (p_match, null, coalesce(p_name, '對方') || ' 30 日內第二次臨時取消，帳戶停用一個月。');
  end if;
end $function$;

revoke all on function public.aah__record_late_cancel(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.aah_cancel_match(p_match uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m aah_matches%rowtype;
  v_me_arrived timestamptz;
  v_name text;
  v_late_arrived boolean;
  v_late_en_route boolean;
  v_late boolean;
  v_reopened int := 0;
  r record;
begin
  select * into m from aah_matches where id = p_match for update;
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;

  select arrived_at, display_name into v_me_arrived, v_name
    from aah_match_participants where match_id = p_match and user_id = auth.uid();
  -- 對方已經到咗，自己未到
  v_late_arrived := v_me_arrived is null and exists (
    select 1 from aah_match_participants where match_id = p_match and user_id <> auth.uid() and arrived_at is not null
  );
  -- 去緊嘅配對：配對咗 2 分鐘之後，去緊嘅人未到，邊個取消都算
  v_late_en_route := m.en_route_user is not null
    and now() > m.created_at + interval '2 minutes'
    and exists (select 1 from aah_match_participants where match_id = p_match and user_id = m.en_route_user and arrived_at is null);
  v_late := v_late_arrived or v_late_en_route;

  -- 先寫低原因，再改狀態（推送會讀最新一句做內容）
  insert into aah_messages (match_id, from_id, text) values (p_match, auth.uid(), left(p_reason, 80));
  update aah_matches set status = 'cancelled', ended_at = now(), cancelled_by = auth.uid(), late_cancel = v_late where id = p_match;

  if v_late then
    for r in select user_id from aah_match_participants
             where match_id = p_match and user_id <> auth.uid() and (arrived_at is not null or user_id = m.en_route_user) loop
      update aah_profiles set points = points + 20 where id = r.user_id;
      insert into aah_point_ledger (user_id, partner_id, match_id, pts, reason) values (r.user_id, auth.uid(), p_match, 20, 'late_cancel_comp');
    end loop;

    insert into aah_messages (match_id, from_id, text)
      values (p_match, null, coalesce(v_name, '對方') || case
        when v_late_arrived then ' 喺對方到咗之後取消，記一次臨時取消。'
        when auth.uid() = m.en_route_user then ' 中途取消，記一次臨時取消。'
        else ' 喺對方去緊嘅時候取消，記一次臨時取消。' end);

    perform public.aah__record_late_cancel(p_match, auth.uid(), v_name);

    if m.author_id = auth.uid() then
      update aah_posts set status = 'cancelled', match_id = null, pinned_until = null where id = m.post_id;
    else
      update aah_posts set status = 'open', match_id = null where id = m.post_id and leave_at > now() and status = 'matched';
      get diagnostics v_reopened = row_count;
    end if;
  else
    insert into aah_messages (match_id, from_id, text) values (p_match, null, '配對已取消。配對頭 2 分鐘、或者對方未到又唔係喺路上，取消唔會被罰。');
    update aah_posts set status = 'open', match_id = null where id = m.post_id and leave_at > now() and status = 'matched';
    get diagnostics v_reopened = row_count;
  end if;

  update aah_interests set status = 'declined' where post_id = m.post_id and status = 'accepted';
  if v_reopened > 0 then
    perform public.aah__restore_interests(m.post_id);
  end if;
end $function$;

-- 去緊嘅人遲到：當臨時取消（唔再當冇出現）
create or replace function public.aah_release_late(p_match uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m aah_matches%rowtype;
  p aah_posts%rowtype;
  me_arrived timestamptz;
  them_arrived timestamptz;
  v_late_name text;
  v_status text;
begin
  select * into m from aah_matches where id = p_match for update;
  if m.id is null or m.status <> 'active' then raise exception 'match not active'; end if;
  if m.en_route_user is null then raise exception 'not en route'; end if;
  if not public.aah_is_participant(p_match) or auth.uid() = m.en_route_user then raise exception 'not participant'; end if;
  if now() < m.eta_at + interval '5 minutes' then raise exception 'too early'; end if;
  select arrived_at into me_arrived from aah_match_participants where match_id = p_match and user_id = auth.uid();
  if me_arrived is null then raise exception 'reporter has not arrived'; end if;
  select arrived_at, display_name into them_arrived, v_late_name from aah_match_participants where match_id = p_match and user_id = m.en_route_user;
  if them_arrived is not null then raise exception 'accused arrived'; end if;

  insert into aah_messages (match_id, from_id, text)
    values (p_match, auth.uid(), '你過咗講好嘅時間都未到，我取消咗，個 post 重新放出');
  update aah_matches set status = 'cancelled', ended_at = now(), cancelled_by = auth.uid(), late_cancel = false where id = p_match;
  insert into aah_messages (match_id, from_id, text)
    values (p_match, null, coalesce(v_late_name, '對方') || ' 過咗講好嘅時間 5 分鐘都未到，記一次臨時取消。');
  update aah_profiles set points = points + 20 where id = auth.uid();
  insert into aah_point_ledger (user_id, partner_id, match_id, pts, reason) values (auth.uid(), m.en_route_user, p_match, 20, 'late_cancel_comp');
  perform public.aah__record_late_cancel(p_match, m.en_route_user, v_late_name);

  select * into p from aah_posts where id = m.post_id for update;
  v_status := case when p.leave_at > now() + interval '2 minutes' then 'open' else 'expired' end;
  update aah_posts set status = v_status, match_id = null where id = p.id;
  update aah_interests set status = 'declined', declined_by_match = false where post_id = p.id and user_id = m.en_route_user;
  if v_status = 'open' then
    perform public.aah__restore_interests(p.id);
  end if;
  return v_status;
end $function$;

-- 一般「冇出現」報告唔用喺去緊嘅人（佢哋用「取消並重新放出」，記臨時取消）
create or replace function public.aah_report_no_show(p_match uuid, p_accused uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m aah_matches%rowtype;
  me_arrived timestamptz;
  them_arrived timestamptz;
  them_confirmed timestamptz;
  v_ded int;
begin
  select * into m from aah_matches where id = p_match for update;
  if m.status <> 'active' or now() < m.meet_at then raise exception 'too early'; end if;
  if m.en_route_user = p_accused then raise exception 'en route use release'; end if;
  select arrived_at into me_arrived from aah_match_participants where match_id = p_match and user_id = auth.uid();
  select arrived_at, confirmed_at into them_arrived, them_confirmed from aah_match_participants where match_id = p_match and user_id = p_accused;
  if me_arrived is null then raise exception 'reporter has not arrived'; end if;
  if them_arrived is not null then raise exception 'accused arrived'; end if;
  if them_confirmed is null then raise exception 'accused not confirmed'; end if;
  insert into aah_reports (match_id, reporter_id, accused_id, kind) values (p_match, auth.uid(), p_accused, 'noshow');
  update aah_matches set status = 'noshow', ended_at = now() where id = p_match;
  select least(50, points) into v_ded from aah_profiles where id = p_accused;
  update aah_profiles set no_shows = no_shows + 1, banned_until = now() + interval '30 days', points = points - v_ded
    where id = p_accused;
  insert into aah_point_ledger (user_id, match_id, pts, reason) values (p_accused, p_match, -v_ded, 'noshow');
end $function$;
