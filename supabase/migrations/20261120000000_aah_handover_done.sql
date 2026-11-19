-- 「我到咗」唔再即刻完成配對：兩邊都到咗之後對話照開，交收完成先撳「交收完成」
-- - 新版 app 用 aah_mark_arrived_v2／aah_confirm_partner_met_v2（全部到齊回 'all_arrived'，唔完成）
-- - 舊版 app 照用 aah_mark_arrived／aah_confirm_partner_met（行為唔變），新舊版本可以同時用
-- - aah_complete_handover：任何一方撳就完成（要全部人到齊）
-- - 冇人撳：全部到齊 60 分鐘後自動完成（cron 每 5 分鐘）
-- - 審批示範用戶：到咗唔再自動完成，等審批人員撳「交收完成」

create or replace function public.aah__all_arrived_note(p_match uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from aah_match_participants where match_id = p_match and arrived_at is null) then
    return 'waiting';
  end if;
  if not exists (select 1 from aah_messages where match_id = p_match and from_id is null and text like '兩位都到咗%') then
    insert into aah_messages (match_id, from_id, text) values (p_match, null, '兩位都到咗。交收完成之後撳「交收完成」。');
  end if;
  return 'all_arrived';
end $$;
revoke execute on function public.aah__all_arrived_note(uuid) from public, anon, authenticated;

create or replace function public.aah_mark_arrived_v2(p_match uuid, p_lat double precision, p_lng double precision)
returns text language plpgsql security definer set search_path = public as $$
declare
  m aah_matches%rowtype;
  v_lat double precision;
  v_lng double precision;
  v_dist double precision;
begin
  select * into m from aah_matches where id = p_match;
  if m.status <> 'active' then raise exception 'match not active'; end if;
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  if public.aah_setting('enforce_gps') and not public.aah__gps_exempt() then
    begin
      execute 'select lat::double precision, lng::double precision from public.malls where id::text = $1' into v_lat, v_lng using m.mall_id;
    exception when undefined_table or undefined_column then v_lat := null;
    end;
    if v_lat is not null then
      if p_lat is null or p_lng is null then raise exception 'gps required'; end if;
      v_dist := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - v_lat) / 2), 2) + cos(radians(v_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_lng) / 2), 2)));
      if v_dist > 400 then raise exception 'not at mall'; end if;
    end if;
  end if;
  if not exists (select 1 from aah_match_participants where match_id = p_match and user_id = auth.uid() and arrived_at is not null) then
    update aah_match_participants set arrived_at = now() where match_id = p_match and user_id = auth.uid();
    insert into aah_messages (match_id, from_id, text) values (p_match, auth.uid(), '我到咗');
  end if;
  if (select status from aah_matches where id = p_match) <> 'active' then return 'completed'; end if;
  return public.aah__all_arrived_note(p_match);
end $$;

create or replace function public.aah_confirm_partner_met_v2(p_match uuid, p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  if (select status from aah_matches where id = p_match) <> 'active' then raise exception 'match not active'; end if;
  if not exists (select 1 from aah_match_participants where match_id = p_match and user_id = auth.uid() and arrived_at is not null) then
    raise exception 'reporter has not arrived';
  end if;
  update aah_match_participants set arrived_at = coalesce(arrived_at, now()) where match_id = p_match and user_id = p_user;
  insert into aah_messages (match_id, from_id, text) values (p_match, null, '已確認見到面');
  return public.aah__all_arrived_note(p_match);
end $$;

create or replace function public.aah_complete_handover(p_match uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  if (select status from aah_matches where id = p_match) <> 'active' then raise exception 'match not active'; end if;
  if exists (select 1 from aah_match_participants where match_id = p_match and arrived_at is null) then
    raise exception 'not all arrived';
  end if;
  perform public.aah__complete_match(p_match);
  return 'completed';
end $$;

revoke execute on function public.aah_mark_arrived_v2(uuid, double precision, double precision) from public, anon;
revoke execute on function public.aah_confirm_partner_met_v2(uuid, uuid) from public, anon;
revoke execute on function public.aah_complete_handover(uuid) from public, anon;
grant execute on function public.aah_mark_arrived_v2(uuid, double precision, double precision) to authenticated;
grant execute on function public.aah_confirm_partner_met_v2(uuid, uuid) to authenticated;
grant execute on function public.aah_complete_handover(uuid) to authenticated;

-- 全部到齊 60 分鐘都冇人撳「交收完成」：自動完成
create or replace function public.aah__auto_complete_handover()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select m.id from aah_matches m
    where m.status = 'active'
      and not exists (select 1 from aah_match_participants p where p.match_id = m.id and p.arrived_at is null)
      and (select max(p2.arrived_at) from aah_match_participants p2 where p2.match_id = m.id) < now() - interval '60 minutes'
  loop
    perform public.aah__complete_match(r.id);
  end loop;
end $$;
revoke execute on function public.aah__auto_complete_handover() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'aah-auto-complete-handover') then
    perform cron.unschedule('aah-auto-complete-handover');
  end if;
  perform cron.schedule('aah-auto-complete-handover', '*/5 * * * *', 'select public.aah__auto_complete_handover()');
end $$;

-- 審批示範用戶：到咗唔再自動完成
create or replace function public.aah__review_bot_arrive()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_bot uuid := public.aah__review_bot();
begin
  if new.arrived_at is null or old.arrived_at is not null or new.user_id = v_bot then return null; end if;
  if not exists (select 1 from aah_match_participants where match_id = new.match_id and user_id = v_bot) then return null; end if;
  if (select status from aah_matches where id = new.match_id) <> 'active' then return null; end if;
  update aah_match_participants set arrived_at = now(), confirmed_at = coalesce(confirmed_at, now())
   where match_id = new.match_id and user_id = v_bot and arrived_at is null;
  return null;
exception when others then
  raise warning 'review bot arrive failed: %', sqlerrm;
  return null;
end $$;
