-- 啱啱好：即時配對資料表（草稿，正式執行前請喺 staging 測試）
-- 用法：Supabase Dashboard → SQL Editor → 貼上執行
-- 設計原則：
--   * 用戶只可以改自己嘅暱稱同設定；積分、停用、配對狀態只可以經 security definer function 改
--   * 平台唔經手用戶之間嘅錢，所以冇任何付款資料表；只有置頂（$5）嘅購買紀錄

-- ============ 用戶 ============
create table if not exists public.aah_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,                         -- +852XXXXXXXX，一個號碼一個帳戶
  nickname text check (char_length(nickname) between 1 and 12),
  points int not null default 0,
  lifetime_points int not null default 0,
  completed int not null default 0,
  no_shows int not null default 0,
  banned_until timestamptz,
  pin_credits int not null default 0,
  notify_cats text[] not null default array['parking','dining','offer','groupbuy'],
  notify_opportunities boolean not null default true,
  notify_promotions boolean not null default false,   -- 推廣通知要另外同意
  default_pay_methods text[] not null default array['cash','payme'],
  created_at timestamptz not null default now()
);

-- ============ Post ============
create table if not exists public.aah_posts (
  id uuid primary key default gen_random_uuid(),
  scenario text not null check (scenario in ('parking','dining','offer','groupbuy')),
  direction text not null check (direction in ('have','want','join')),
  mall_id text not null,
  mall_name text not null,
  shop text not null,
  fields jsonb not null default '{}'::jsonb,
  price int check (price is null or price >= 0),          -- null = 夾單；0 = 免費
  pay_methods text[] not null default '{}',
  leave_at timestamptz not null,                          -- 預計離開（食飯 = 預計叫號）
  author_id uuid not null references public.aah_profiles(id),
  verified_on_site boolean not null default false,        -- 發 post 時 GPS 確認
  status text not null default 'open' check (status in ('open','matched','expired','cancelled')),
  pinned_until timestamptz,
  pushed_count int not null default 0,                    -- 真實推送人數（唔可以虛報）
  view_count int not null default 0,
  auto_accept boolean not null default false,
  need_count int check (need_count is null or need_count between 1 and 3),  -- 夾單仲要幾多人
  match_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists aah_posts_feed_idx on public.aah_posts (mall_id, status, leave_at desc);
create index if not exists aah_posts_author_idx on public.aah_posts (author_id, created_at desc);

-- ============ 有興趣（配對前對話） ============
create table if not exists public.aah_interests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.aah_posts(id) on delete cascade,
  user_id uuid not null references public.aah_profiles(id),
  offer int check (offer is null or offer >= 0),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.aah_interest_messages (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references public.aah_interests(id) on delete cascade,
  from_id uuid not null references public.aah_profiles(id),
  text text not null check (char_length(text) <= 80),
  created_at timestamptz not null default now()
);

-- ============ 配對 ============
create table if not exists public.aah_matches (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.aah_posts(id),
  scenario text not null,
  mall_id text not null,
  mall_name text not null,
  shop text not null,
  price int,
  pay_methods text[] not null default '{}',
  author_id uuid not null references public.aah_profiles(id),
  meet_place text not null,
  meet_at timestamptz not null,
  status text not null default 'active' check (status in ('active','completed','cancelled','noshow')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.aah_match_participants (
  match_id uuid not null references public.aah_matches(id) on delete cascade,
  user_id uuid not null references public.aah_profiles(id),
  display_name text not null,
  confirmed_at timestamptz,          -- 確認見面（確認時已顯示冇出現警告）
  arrived_at timestamptz,            -- 撳「我到咗」+ GPS
  outfit jsonb,                      -- 公仔打扮
  rating text check (rating in ('up','down')),
  primary key (match_id, user_id)
);

create table if not exists public.aah_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.aah_matches(id) on delete cascade,
  from_id uuid references public.aah_profiles(id),   -- null = 系統訊息
  text text not null check (char_length(text) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists aah_messages_match_idx on public.aah_messages (match_id, created_at);

-- ============ 積分、舉報、申訴、置頂、禮券 ============
create table if not exists public.aah_point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.aah_profiles(id),
  partner_id uuid,
  match_id uuid references public.aah_matches(id),
  pts int not null,
  reason text not null,              -- complete / noshow / redeem_pin / redeem_voucher
  created_at timestamptz not null default now()
);

create table if not exists public.aah_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.aah_matches(id),
  reporter_id uuid not null references public.aah_profiles(id),
  accused_id uuid not null references public.aah_profiles(id),
  kind text not null check (kind in ('noshow','prepay','harass','fake','other')),
  note text,
  status text not null default 'open' check (status in ('open','upheld','dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.aah_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.aah_profiles(id),
  report_id uuid references public.aah_reports(id),
  text text not null check (char_length(text) <= 300),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.aah_pins (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.aah_posts(id),
  user_id uuid not null references public.aah_profiles(id),
  paid_with text not null check (paid_with in ('credit','store')),
  store_txn_id text,                 -- Google Play / App Store 交易編號
  started_at timestamptz not null default now(),
  ends_at timestamptz not null
);

create table if not exists public.aah_voucher_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.aah_profiles(id),
  points int not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','sent')),
  created_at timestamptz not null default now()
);

-- ============ RLS ============
alter table public.aah_profiles enable row level security;
alter table public.aah_posts enable row level security;
alter table public.aah_interests enable row level security;
alter table public.aah_interest_messages enable row level security;
alter table public.aah_matches enable row level security;
alter table public.aah_match_participants enable row level security;
alter table public.aah_messages enable row level security;
alter table public.aah_point_ledger enable row level security;
alter table public.aah_reports enable row level security;
alter table public.aah_appeals enable row level security;
alter table public.aah_pins enable row level security;
alter table public.aah_voucher_requests enable row level security;

create or replace function public.aah_is_participant(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from aah_match_participants where match_id = m and user_id = auth.uid());
$$;

create or replace function public.aah_not_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned_until is null or banned_until < now() from aah_profiles where id = auth.uid()), false);
$$;

-- profiles：只睇到自己；只可以改設定欄位
create policy aah_profiles_select_own on public.aah_profiles for select using (id = auth.uid());
create policy aah_profiles_insert_own on public.aah_profiles for insert with check (id = auth.uid());
create policy aah_profiles_update_own on public.aah_profiles for update using (id = auth.uid());
revoke update on public.aah_profiles from authenticated;
grant update (nickname, notify_cats, notify_opportunities, notify_promotions, default_pay_methods) on public.aah_profiles to authenticated;

-- posts：開放中嘅大家睇得（唔使登入都睇得）；自己出 post 要冇被停用
create policy aah_posts_select on public.aah_posts for select
  using (status = 'open' or author_id = auth.uid() or (match_id is not null and public.aah_is_participant(match_id)));
create policy aah_posts_insert on public.aah_posts for insert
  with check (author_id = auth.uid() and public.aah_not_banned());
create policy aah_posts_cancel_own on public.aah_posts for update using (author_id = auth.uid());
revoke update on public.aah_posts from authenticated;
grant update (status, leave_at) on public.aah_posts to authenticated;   -- 只可以取消／延長；其他經 function

-- interests：出 post 嘅人同有興趣嘅人睇得
create policy aah_interests_select on public.aah_interests for select
  using (user_id = auth.uid() or exists (select 1 from aah_posts p where p.id = post_id and p.author_id = auth.uid()));
create policy aah_interests_insert on public.aah_interests for insert
  with check (user_id = auth.uid() and public.aah_not_banned());

create policy aah_interest_messages_select on public.aah_interest_messages for select
  using (exists (select 1 from aah_interests i join aah_posts p on p.id = i.post_id
                 where i.id = interest_id and (i.user_id = auth.uid() or p.author_id = auth.uid())));
create policy aah_interest_messages_insert on public.aah_interest_messages for insert
  with check (from_id = auth.uid() and public.aah_not_banned() and exists (
    select 1 from aah_interests i join aah_posts p on p.id = i.post_id
    where i.id = interest_id and (i.user_id = auth.uid() or p.author_id = auth.uid())));

-- 配對：只有參與者睇得；訊息要配對進行中或者結束 30 分鐘內先傳得
create policy aah_matches_select on public.aah_matches for select using (public.aah_is_participant(id));
create policy aah_participants_select on public.aah_match_participants for select using (public.aah_is_participant(match_id));
create policy aah_participants_update_own on public.aah_match_participants for update using (user_id = auth.uid());
revoke update on public.aah_match_participants from authenticated;
grant update (outfit, rating) on public.aah_match_participants to authenticated;

create policy aah_messages_select on public.aah_messages for select using (public.aah_is_participant(match_id));
create policy aah_messages_insert on public.aah_messages for insert
  with check (from_id = auth.uid() and public.aah_is_participant(match_id) and exists (
    select 1 from aah_matches m where m.id = match_id
    and (m.status = 'active' or m.ended_at > now() - interval '30 minutes')));

create policy aah_ledger_select_own on public.aah_point_ledger for select using (user_id = auth.uid());
-- 冇出現只可以經 aah_report_no_show() 報告（會檢查時間同到場紀錄）
create policy aah_reports_insert on public.aah_reports for insert with check (reporter_id = auth.uid() and kind <> 'noshow');
create policy aah_reports_select_own on public.aah_reports for select using (reporter_id = auth.uid() or accused_id = auth.uid());
create policy aah_appeals_own on public.aah_appeals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy aah_pins_select_own on public.aah_pins for select using (user_id = auth.uid());
create policy aah_vouchers_select_own on public.aah_voucher_requests for select using (user_id = auth.uid());

-- ============ 狀態變更 function ============

-- 出 post 嘅人揀人 → 建立配對（夾單夠人先轉 matched）
create or replace function public.aah_accept_interest(p_interest uuid, p_price int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  i aah_interests%rowtype;
  p aah_posts%rowtype;
  m_id uuid;
  joined int;
begin
  select * into i from aah_interests where id = p_interest for update;
  select * into p from aah_posts where id = i.post_id for update;
  if p.author_id <> auth.uid() then raise exception 'not author'; end if;
  if p.status <> 'open' or p.leave_at < now() then raise exception 'post closed'; end if;

  if p.match_id is not null and p.scenario = 'groupbuy' then
    m_id := p.match_id;
  else
    insert into aah_matches (post_id, scenario, mall_id, mall_name, shop, price, pay_methods, author_id, meet_place, meet_at)
    values (p.id, p.scenario, p.mall_id, p.mall_name, p.shop, coalesce(p_price, i.offer, p.price), p.pay_methods, p.author_id,
            case when p.scenario = 'parking' then '客戶服務台' else p.shop || '門口' end,
            least(now() + interval '5 minutes', p.leave_at))
    returning id into m_id;
    insert into aah_match_participants (match_id, user_id, display_name)
      select m_id, p.author_id, nickname from aah_profiles where id = p.author_id;
  end if;

  insert into aah_match_participants (match_id, user_id, display_name)
    select m_id, i.user_id, nickname from aah_profiles where id = i.user_id
  on conflict do nothing;
  update aah_interests set status = 'accepted' where id = i.id;

  select count(*) - 1 into joined from aah_match_participants where match_id = m_id;
  if p.scenario <> 'groupbuy' or joined >= coalesce(p.need_count, 1) then
    update aah_posts set status = 'matched', match_id = m_id, pinned_until = null where id = p.id;
    update aah_interests set status = 'declined' where post_id = p.id and status = 'pending';
  else
    update aah_posts set match_id = m_id where id = p.id;
  end if;
  insert into aah_messages (match_id, from_id, text) values (m_id, null, '配對成功！確認見面地點同時間，到咗撳「我到咗」。');
  return m_id;
end $$;

-- 「我到咗」：要喺商場範圍（由 app 傳 GPS，喺 server 對照商場座標；呢度留空俾你接 malls 表）
create or replace function public.aah_mark_arrived(p_match uuid, p_lat double precision, p_lng double precision)
returns text language plpgsql security definer set search_path = public as $$
declare
  m aah_matches%rowtype;
  remaining int;
  r record;
  v_pts int;
  v_repeated boolean;
  v_today int;
begin
  select * into m from aah_matches where id = p_match for update;
  if m.status <> 'active' then raise exception 'match not active'; end if;
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  -- TODO：用 malls 表嘅 lat/lng 檢查 (p_lat, p_lng) 喺商場範圍之內
  update aah_match_participants set arrived_at = now() where match_id = p_match and user_id = auth.uid();
  insert into aah_messages (match_id, from_id, text) values (p_match, auth.uid(), '我到咗');

  select count(*) into remaining from aah_match_participants where match_id = p_match and arrived_at is null;
  if remaining > 0 then return 'waiting'; end if;

  update aah_matches set status = 'completed', ended_at = now() where id = p_match;
  -- 計分：有嘢俾人 30、接收 10、夾單 20；同一對人一星期內唔重複；每日上限 100
  for r in select user_id from aah_match_participants where match_id = p_match loop
    v_pts := case when m.scenario = 'groupbuy' then 20 when r.user_id = m.author_id and m.price is not null then 30 else 10 end;
    select exists (
      select 1 from aah_point_ledger l
      where l.user_id = r.user_id and l.pts > 0 and l.created_at > now() - interval '7 days'
        and l.partner_id in (select user_id from aah_match_participants where match_id = p_match and user_id <> r.user_id)
    ) into v_repeated;
    select coalesce(sum(l2.pts), 0) into v_today from aah_point_ledger l2
      where l2.user_id = r.user_id and l2.created_at > date_trunc('day', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
    if v_repeated then v_pts := 0; end if;
    v_pts := greatest(0, least(v_pts, 100 - v_today));
    insert into aah_point_ledger (user_id, partner_id, match_id, pts, reason)
      values (r.user_id, (select user_id from aah_match_participants where match_id = p_match and user_id <> r.user_id limit 1), p_match, v_pts, 'complete');
    update aah_profiles set points = points + v_pts, lifetime_points = lifetime_points + v_pts, completed = completed + 1 where id = r.user_id;
  end loop;
  return 'completed';
end $$;

-- 冇出現：約定時間之後、報告人已到、被告冇到 → 停用 30 日、扣 50 分
create or replace function public.aah_report_no_show(p_match uuid, p_accused uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m aah_matches%rowtype;
  me_arrived timestamptz;
  them_arrived timestamptz;
begin
  select * into m from aah_matches where id = p_match for update;
  if m.status <> 'active' or now() < m.meet_at then raise exception 'too early'; end if;
  select arrived_at into me_arrived from aah_match_participants where match_id = p_match and user_id = auth.uid();
  select arrived_at into them_arrived from aah_match_participants where match_id = p_match and user_id = p_accused;
  if me_arrived is null then raise exception 'reporter has not arrived'; end if;
  if them_arrived is not null then raise exception 'accused arrived'; end if;

  insert into aah_reports (match_id, reporter_id, accused_id, kind) values (p_match, auth.uid(), p_accused, 'noshow');
  update aah_matches set status = 'noshow', ended_at = now() where id = p_match;
  update aah_profiles set no_shows = no_shows + 1, banned_until = now() + interval '30 days', points = greatest(0, points - 50)
    where id = p_accused;
  insert into aah_point_ledger (user_id, match_id, pts, reason) values (p_accused, p_match, -50, 'noshow');
end $$;

grant execute on function public.aah_accept_interest(uuid, int) to authenticated;
grant execute on function public.aah_mark_arrived(uuid, double precision, double precision) to authenticated;
grant execute on function public.aah_report_no_show(uuid, uuid) to authenticated;

-- ============ Realtime ============
alter publication supabase_realtime add table public.aah_posts, public.aah_interests, public.aah_interest_messages,
  public.aah_matches, public.aah_match_participants, public.aah_messages;
