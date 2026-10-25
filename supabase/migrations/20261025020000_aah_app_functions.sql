-- 啱啱好：app 接駁 Supabase 用嘅 function、設定同在場人數
-- 要喺 20261025000000 同 20261025010000 之後執行。

-- ============ 設定（admin 改，大家讀得） ============
create table if not exists public.aah_settings (
  key text primary key,
  value jsonb not null
);
alter table public.aah_settings enable row level security;
create policy aah_settings_read on public.aah_settings for select using (true);
create policy aah_settings_admin_write on public.aah_settings for all using (public.aah_is_admin()) with check (public.aah_is_admin());

insert into public.aah_settings (key, value) values
  ('allow_test_location', 'true'),   -- 試用期：唔喺商場都可以揀測試位置；正式上線前改 false
  ('enforce_gps', 'false'),          -- 「我到咗」要 GPS 喺商場 400 米內；正式上線前改 true
  ('free_pin_trial', 'true')         -- 試用期置頂唔收錢；接咗 Google Play 付款之後改 false
on conflict (key) do nothing;

create or replace function public.aah_setting(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text::boolean from aah_settings where key = p_key), false);
$$;

-- ============ 補欄位：名同可以直接顯示，唔使開放其他人嘅 profile ============
alter table public.aah_posts add column if not exists author_name text;
alter table public.aah_interests add column if not exists display_name text;

-- ============ 在場人數（用嚟計「附近用戶」，唔儲存確實位置） ============
create table if not exists public.aah_presence (
  user_id uuid primary key references public.aah_profiles(id) on delete cascade,
  mall_id text not null,
  seen_at timestamptz not null default now()
);
alter table public.aah_presence enable row level security;
-- 冇 select policy：只可以經 function 攞人數

create or replace function public.aah_touch_presence(p_mall text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from aah_profiles where id = auth.uid()) then return; end if;
  insert into aah_presence (user_id, mall_id, seen_at) values (auth.uid(), p_mall, now())
  on conflict (user_id) do update set mall_id = excluded.mall_id, seen_at = now();
end $$;

create or replace function public.aah_mall_audience(p_mall text, p_scenario text default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from aah_presence pr join aah_profiles p on p.id = pr.user_id
  where pr.mall_id = p_mall and pr.seen_at > now() - interval '30 minutes'
    and pr.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and (p_scenario is null or p_scenario = any (p.notify_cats));
$$;

-- ============ 出 post ============
create or replace function public.aah_create_post(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
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
                         author_id, author_name, verified_on_site, auto_accept, need_count, pushed_count)
  values (
    v_scenario, p->>'direction', p->>'mall_id', p->>'mall_name', p->>'shop',
    coalesce(p->'fields', '{}'::jsonb),
    nullif(p->>'price', '')::int,
    coalesce(array(select jsonb_array_elements_text(p->'pay_methods')), '{}'),
    v_leave, me.id, me.nickname,
    coalesce((p->>'verified_on_site')::boolean, false),
    coalesce((p->>'auto_accept')::boolean, false),
    nullif(p->>'need_count', '')::int,
    public.aah_mall_audience(p->>'mall_id', v_scenario)
  ) returning id into new_id;
  return new_id;
end $$;

create or replace function public.aah_view_post(p_post uuid)
returns void language sql security definer set search_path = public as $$
  update aah_posts set view_count = view_count + 1 where id = p_post and author_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
$$;

-- ============ 配對（內部 function，唔直接俾 client 用） ============
create or replace function public.aah__accept(p_interest uuid, p_price int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  i aah_interests%rowtype;
  p aah_posts%rowtype;
  m_id uuid;
  joined int;
begin
  select * into i from aah_interests where id = p_interest for update;
  select * into p from aah_posts where id = i.post_id for update;
  if p.status <> 'open' or p.leave_at < now() then raise exception 'post closed'; end if;
  if i.status <> 'pending' then raise exception 'interest not pending'; end if;

  if p.match_id is not null and p.scenario = 'groupbuy' then
    m_id := p.match_id;
    insert into aah_messages (match_id, from_id, text) values (m_id, null, coalesce(i.display_name, '有人') || ' 加入咗夾單');
  else
    insert into aah_matches (post_id, scenario, mall_id, mall_name, shop, price, pay_methods, author_id, meet_place, meet_at)
    values (p.id, p.scenario, p.mall_id, p.mall_name, p.shop, case when p.price is null then null else coalesce(p_price, i.offer, p.price) end,
            p.pay_methods, p.author_id,
            case when p.scenario = 'parking' then '客戶服務台' else p.shop || '門口' end,
            least(now() + interval '5 minutes', p.leave_at))
    returning id into m_id;
    insert into aah_match_participants (match_id, user_id, display_name) values (m_id, p.author_id, coalesce(p.author_name, '用戶'));
    insert into aah_messages (match_id, from_id, text) values (m_id, null, '配對成功！確認見面地點同時間，到咗撳「我到咗」。');
  end if;

  insert into aah_match_participants (match_id, user_id, display_name) values (m_id, i.user_id, coalesce(i.display_name, '用戶'))
  on conflict do nothing;
  update aah_interests set status = 'accepted' where id = i.id;
  insert into aah_interest_messages (interest_id, from_id, text)
    values (i.id, p.author_id, case when p.scenario = 'groupbuy' then '好呀，一齊夾' when p_price is not null and p_price <> p.price then 'OK，$' || p_price || ' 得' else '仲喺度，嚟啦' end);

  select count(*) - 1 into joined from aah_match_participants where match_id = m_id;
  if p.scenario <> 'groupbuy' or joined >= coalesce(p.need_count, 1) then
    update aah_posts set status = 'matched', match_id = m_id, pinned_until = null where id = p.id;
    insert into aah_interest_messages (interest_id, from_id, text)
      select id, p.author_id, '唔好意思，已經俾咗人' from aah_interests where post_id = p.id and status = 'pending';
    update aah_interests set status = 'declined' where post_id = p.id and status = 'pending';
  else
    update aah_posts set match_id = m_id where id = p.id;
  end if;
  return m_id;
end $$;
revoke all on function public.aah__accept(uuid, int) from public, authenticated, anon;

-- 出 post 嘅人揀人
create or replace function public.aah_accept_interest(p_interest uuid, p_price int default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from aah_interests i join aah_posts p on p.id = i.post_id where i.id = p_interest and p.author_id = auth.uid()) then
    raise exception 'not author';
  end if;
  return public.aah__accept(p_interest, p_price);
end $$;

-- 撳「有興趣」／「我夾」或者傳預設句子；開咗自動配對就即刻配對
create or replace function public.aah_express_interest(p_post uuid, p_text text, p_offer int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me aah_profiles%rowtype;
  p aah_posts%rowtype;
  i_id uuid;
  is_new boolean := false;
begin
  select * into me from aah_profiles where id = auth.uid();
  if me.id is null then raise exception 'not registered'; end if;
  if me.banned_until is not null and me.banned_until > now() then raise exception 'banned'; end if;
  select * into p from aah_posts where id = p_post;
  if p.id is null or p.status <> 'open' or p.leave_at < now() then raise exception 'post closed'; end if;
  if p.author_id = me.id then raise exception 'own post'; end if;

  select id into i_id from aah_interests where post_id = p_post and user_id = me.id;
  if i_id is null then
    insert into aah_interests (post_id, user_id, offer, display_name) values (p_post, me.id, p_offer, me.nickname) returning id into i_id;
    is_new := true;
  elsif p_offer is not null then
    update aah_interests set offer = p_offer where id = i_id;
  end if;
  insert into aah_interest_messages (interest_id, from_id, text) values (i_id, me.id, left(p_text, 80));

  if is_new and p.auto_accept then
    return public.aah__accept(i_id, p_offer);
  end if;
  return null;
end $$;

create or replace function public.aah_decline_interest(p_interest uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  select p.author_id into v_author from aah_interests i join aah_posts p on p.id = i.post_id where i.id = p_interest;
  if v_author is distinct from auth.uid() then raise exception 'not author'; end if;
  update aah_interests set status = 'declined' where id = p_interest and status = 'pending';
  insert into aah_interest_messages (interest_id, from_id, text) values (p_interest, auth.uid(), '唔好意思，已經俾咗人');
end $$;

-- ============ 置頂（每個商場最多 10 個） ============
create or replace function public.aah_pin_post(p_post uuid, p_use_credit boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  p aah_posts%rowtype;
  used int;
  v_until timestamptz;
begin
  select * into p from aah_posts where id = p_post for update;
  if p.author_id <> auth.uid() then raise exception 'not author'; end if;
  if p.status <> 'open' or p.leave_at < now() then raise exception 'post closed'; end if;
  select count(*) into used from aah_posts where mall_id = p.mall_id and status = 'open' and pinned_until > now() and id <> p.id;
  if used >= 10 then raise exception 'pin slots full'; end if;

  if p_use_credit then
    update aah_profiles set pin_credits = pin_credits - 1 where id = auth.uid() and pin_credits > 0;
    if not found then raise exception 'no pin credits'; end if;
  elsif not public.aah_setting('free_pin_trial') then
    raise exception 'payment required';   -- 正式版：由 Google Play / App Store 付款 webhook 寫入
  end if;

  v_until := least(greatest(coalesce(p.pinned_until, now()), now()) + interval '15 minutes', p.leave_at);
  update aah_posts set pinned_until = v_until where id = p.id;
  -- 試用期免費置頂記做 store + 'trial'；接咗 Google Play / App Store 之後由付款 webhook 寫入真交易編號
  insert into aah_pins (post_id, user_id, paid_with, store_txn_id, ends_at)
  values (p.id, auth.uid(), case when p_use_credit then 'credit' else 'store' end, case when p_use_credit then null else 'trial' end, v_until);
  return v_until;
end $$;

-- ============ 見面 ============
create or replace function public.aah_confirm_meet(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  update aah_match_participants set confirmed_at = coalesce(confirmed_at, now()) where match_id = p_match and user_id = auth.uid();
end $$;

create or replace function public.aah_change_meet(p_match uuid, p_place text, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  if not exists (select 1 from aah_matches where id = p_match and status = 'active') then raise exception 'match not active'; end if;
  update aah_matches set meet_place = left(p_place, 40), meet_at = p_at where id = p_match;
  -- 改咗之後，其他人要再確認一次
  update aah_match_participants set confirmed_at = case when user_id = auth.uid() then now() else null end where match_id = p_match;
  insert into aah_messages (match_id, from_id, text)
    values (p_match, null, '見面改咗：' || left(p_place, 40) || '・' || to_char(p_at at time zone 'Asia/Hong_Kong', 'HH24:MI'));
end $$;

create or replace function public.aah_cancel_match(p_match uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m aah_matches%rowtype;
begin
  select * into m from aah_matches where id = p_match for update;
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;
  update aah_matches set status = 'cancelled', ended_at = now() where id = p_match;
  insert into aah_messages (match_id, from_id, text) values (p_match, auth.uid(), left(p_reason, 80));
  insert into aah_messages (match_id, from_id, text) values (p_match, null, '配對已取消。約定時間之前取消唔會被罰。');
  -- post 未過期就重新開放
  update aah_posts set status = 'open', match_id = null
    where id = m.post_id and leave_at > now() and status = 'matched';
  update aah_interests set status = 'declined' where post_id = m.post_id and status = 'accepted';
end $$;

-- ============ 完成（內部）＋ 我到咗 ============
create or replace function public.aah__complete_match(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m aah_matches%rowtype;
  r record;
  v_pts int;
  v_repeated boolean;
  v_today int;
  v_partner uuid;
begin
  select * into m from aah_matches where id = p_match for update;
  if m.status <> 'active' then return; end if;
  update aah_matches set status = 'completed', ended_at = now() where id = p_match;
  for r in select user_id from aah_match_participants where match_id = p_match loop
    v_pts := case when m.scenario = 'groupbuy' then 20 when r.user_id = m.author_id and m.price is not null then 30 else 10 end;
    select user_id into v_partner from aah_match_participants where match_id = p_match and user_id <> r.user_id limit 1;
    select exists (
      select 1 from aah_point_ledger l
      where l.user_id = r.user_id and l.pts > 0 and l.reason = 'complete' and l.created_at > now() - interval '7 days'
        and l.partner_id in (select x.user_id from aah_match_participants x where x.match_id = p_match and x.user_id <> r.user_id)
    ) into v_repeated;
    select coalesce(sum(l2.pts), 0) into v_today from aah_point_ledger l2
      where l2.user_id = r.user_id and l2.reason = 'complete'
        and l2.created_at > date_trunc('day', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
    if v_repeated then v_pts := 0; end if;
    v_pts := greatest(0, least(v_pts, 100 - v_today));
    insert into aah_point_ledger (user_id, partner_id, match_id, pts, reason) values (r.user_id, v_partner, p_match, v_pts, 'complete');
    update aah_profiles set points = points + v_pts, lifetime_points = lifetime_points + v_pts, completed = completed + 1 where id = r.user_id;
  end loop;
  insert into aah_messages (match_id, from_id, text) values (p_match, null, '完成！積分已經入咗帳。');
end $$;
revoke all on function public.aah__complete_match(uuid) from public, authenticated, anon;

create or replace function public.aah_mark_arrived(p_match uuid, p_lat double precision, p_lng double precision)
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

  if public.aah_setting('enforce_gps') then
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

  update aah_match_participants set arrived_at = coalesce(arrived_at, now()) where match_id = p_match and user_id = auth.uid();
  insert into aah_messages (match_id, from_id, text) values (p_match, auth.uid(), '我到咗');
  if not exists (select 1 from aah_match_participants where match_id = p_match and arrived_at is null) then
    perform public.aah__complete_match(p_match);
    return 'completed';
  end if;
  return 'waiting';
end $$;

-- 「對方到咗未？」撳「到咗喇」：確認咗已經見到對方
create or replace function public.aah_confirm_partner_met(p_match uuid, p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  if not exists (select 1 from aah_match_participants where match_id = p_match and user_id = auth.uid() and arrived_at is not null) then
    raise exception 'reporter has not arrived';
  end if;
  update aah_match_participants set arrived_at = coalesce(arrived_at, now()) where match_id = p_match and user_id = p_user;
  insert into aah_messages (match_id, from_id, text) values (p_match, null, '已確認見到面');
  if not exists (select 1 from aah_match_participants where match_id = p_match and arrived_at is null) then
    perform public.aah__complete_match(p_match);
    return 'completed';
  end if;
  return 'waiting';
end $$;

-- ============ 積分換領 ============
create or replace function public.aah_redeem_pin()
returns void language plpgsql security definer set search_path = public as $$
begin
  update aah_profiles set points = points - 100, pin_credits = pin_credits + 1 where id = auth.uid() and points >= 100;
  if not found then raise exception 'not enough points'; end if;
  insert into aah_point_ledger (user_id, pts, reason) values (auth.uid(), -100, 'redeem_pin');
end $$;

create or replace function public.aah_request_voucher()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me aah_profiles%rowtype;
  v_id uuid;
begin
  select * into me from aah_profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'not registered'; end if;
  if me.created_at > now() - interval '30 days' then raise exception 'account too new'; end if;
  if me.points < 1000 then raise exception 'not enough points'; end if;
  if (select count(*) from aah_voucher_requests where status in ('pending', 'approved', 'sent')
      and created_at >= date_trunc('month', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong') >= 50 then
    raise exception 'monthly quota reached';
  end if;
  update aah_profiles set points = points - 1000 where id = me.id;
  insert into aah_point_ledger (user_id, pts, reason) values (me.id, -1000, 'redeem_voucher');
  insert into aah_voucher_requests (user_id, points) values (me.id, 1000) returning id into v_id;
  return v_id;
end $$;

-- ============ 權限 ============
grant execute on function public.aah_setting(text) to anon, authenticated;
grant execute on function public.aah_touch_presence(text) to authenticated;
grant execute on function public.aah_mall_audience(text, text) to anon, authenticated;
grant execute on function public.aah_create_post(jsonb) to authenticated;
grant execute on function public.aah_view_post(uuid) to anon, authenticated;
grant execute on function public.aah_accept_interest(uuid, int) to authenticated;
grant execute on function public.aah_express_interest(uuid, text, int) to authenticated;
grant execute on function public.aah_decline_interest(uuid) to authenticated;
grant execute on function public.aah_pin_post(uuid, boolean) to authenticated;
grant execute on function public.aah_confirm_meet(uuid) to authenticated;
grant execute on function public.aah_change_meet(uuid, text, timestamptz) to authenticated;
grant execute on function public.aah_cancel_match(uuid, text) to authenticated;
grant execute on function public.aah_mark_arrived(uuid, double precision, double precision) to authenticated;
grant execute on function public.aah_confirm_partner_met(uuid, uuid) to authenticated;
grant execute on function public.aah_redeem_pin() to authenticated;
grant execute on function public.aah_request_voucher() to authenticated;

-- post 只可以經 aah_create_post 建立（會計人數、檢查停用同每日上限）
alter policy aah_posts_insert on public.aah_posts with check (false);
-- 有興趣只可以經 aah_express_interest
alter policy aah_interests_insert on public.aah_interests with check (false);
alter policy aah_interest_messages_insert on public.aah_interest_messages with check (false);
