-- 啱啱好規則：唔收錢、唔支持炒飛、每日上限、濫用訊號、用家意見、換泊車地點
-- 要喺 20261107000000_aah_live_and_prefs.sql 之後執行。

-- ============ 1. 設定（admin 喺管理頁改；數字留空 = 唔限） ============
insert into public.aah_settings (key, value) values
  ('pin_enabled', 'false'),                 -- 置頂：暫時收埋，功能保留
  ('sms_login', 'false'),                   -- SMS 登入：開通 SMS 供應商之前收埋
  ('dining_ref_per_person', 'null'),        -- 餐廳排隊飛多謝費參考價（每位）
  ('parking_ref_per_hour', 'null'),         -- 泊車優惠單據參考價（每個鐘）
  ('price_block_multiple', '2'),            -- 超過參考價幾多倍唔俾放
  ('limit_dining_per_day', '3'),            -- 每人每日最多放幾張餐廳排隊飛
  ('limit_dining_branch_per_day', '1'),     -- 同一間分店每人每日最多幾張
  ('limit_parking_per_day', '3')            -- 每人每日最多放幾張泊車優惠單據
on conflict (key) do nothing;

-- 讀數字設定：冇設定或者留空就係 null
create or replace function public.aah_num_setting(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric
    when jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^\s*\d+(\.\d+)?\s*$' then trim(value #>> '{}')::numeric
    else null end
  from aah_settings where key = p_key;
$$;

-- 填錯數字唔俾存
create or replace function public.aah__check_setting() returns trigger
language plpgsql set search_path = public as $$
declare v numeric;
begin
  if new.key in ('dining_ref_per_person', 'parking_ref_per_hour', 'price_block_multiple',
                 'limit_dining_per_day', 'limit_dining_branch_per_day', 'limit_parking_per_day') then
    if jsonb_typeof(new.value) = 'null' then
      if new.key like 'limit_%' or new.key = 'price_block_multiple' then raise exception 'bad setting: % 一定要填', new.key; end if;
      return new;
    end if;
    if jsonb_typeof(new.value) <> 'number' then raise exception 'bad setting: % 要係數字', new.key; end if;
    v := (new.value #>> '{}')::numeric;
    if new.key like 'limit_%' and (v < 1 or v <> trunc(v)) then raise exception 'bad setting: % 要係 1 或以上嘅整數', new.key; end if;
    if new.key = 'price_block_multiple' and v < 1 then raise exception 'bad setting: 倍數最少 1'; end if;
    if new.key like '%_ref_%' and v <= 0 then raise exception 'bad setting: 參考價要大過 0'; end if;
  elsif new.key in ('pin_enabled', 'sms_login', 'allow_test_location', 'enforce_gps', 'free_pin_trial') then
    if jsonb_typeof(new.value) <> 'boolean' then raise exception 'bad setting: % 要係開或者關', new.key; end if;
  end if;
  return new;
end $$;
drop trigger if exists aah_check_setting on public.aah_settings;
create trigger aah_check_setting before insert or update on public.aah_settings
  for each row execute function public.aah__check_setting();

-- ============ 2. 唔支持炒飛：參考價同封頂 ============
-- 淨係管「放出嚟」嘅餐廳排隊飛（按人數）同泊車優惠單據（按可換幾多個鐘）；優惠券同夾單唔管
create or replace function public.aah__price_cap(p_scenario text, p_direction text, p_fields jsonb)
returns table (ref numeric, cap numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_per numeric;
  v_units numeric;
  v_mult numeric := coalesce(public.aah_num_setting('price_block_multiple'), 2);
  v_raw text;
begin
  if p_direction is distinct from 'have' then return; end if;
  if p_scenario = 'dining' then
    v_per := public.aah_num_setting('dining_ref_per_person');
    v_raw := p_fields->>'partySize';
  elsif p_scenario = 'parking' then
    v_per := public.aah_num_setting('parking_ref_per_hour');
    v_raw := p_fields->>'hours';
  else
    return;
  end if;
  if v_raw ~ '^\s*\d+(\.\d+)?\s*$' then v_units := trim(v_raw)::numeric; end if;
  if v_per is null or v_units is null or v_units <= 0 then return; end if;
  ref := round(v_per * v_units);
  cap := round(v_per * v_units * v_mult);
  return next;
end $$;

-- 放 post、改價、出價、配對價都唔可以超過封頂價
create or replace function public.aah__guard_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_price int;
  v_scenario text;
  v_direction text;
  v_fields jsonb;
  v_cap numeric;
begin
  if tg_table_name = 'aah_posts' then
    if tg_op = 'UPDATE' and new.price is not distinct from old.price and new.fields is not distinct from old.fields then return new; end if;
    v_price := new.price; v_scenario := new.scenario; v_direction := new.direction; v_fields := new.fields;
  elsif tg_table_name = 'aah_interests' then
    if tg_op = 'UPDATE' and new.offer is not distinct from old.offer then return new; end if;
    v_price := new.offer;
    select scenario, direction, fields into v_scenario, v_direction, v_fields from aah_posts where id = new.post_id;
  else -- aah_matches
    if tg_op = 'UPDATE' and new.price is not distinct from old.price then return new; end if;
    v_price := new.price;
    select scenario, direction, fields into v_scenario, v_direction, v_fields from aah_posts where id = new.post_id;
  end if;
  if v_price is null or v_price <= 0 then return new; end if;
  select c.cap into v_cap from public.aah__price_cap(v_scenario, v_direction, v_fields) c;
  if v_cap is not null and v_price > v_cap then
    raise exception 'price too high %', v_cap::int;
  end if;
  return new;
end $$;

drop trigger if exists aah_guard_price on public.aah_posts;
create trigger aah_guard_price before insert or update of price, fields on public.aah_posts
  for each row execute function public.aah__guard_price();
drop trigger if exists aah_guard_price on public.aah_interests;
create trigger aah_guard_price before insert or update of offer on public.aah_interests
  for each row execute function public.aah__guard_price();
drop trigger if exists aah_guard_price on public.aah_matches;
create trigger aah_guard_price before insert or update of price on public.aah_matches
  for each row execute function public.aah__guard_price();

-- ============ 3. 每日上限（香港時間每日 0 點重新計；取消咗都計；唔限同時手持幾多張） ============
create or replace function public.aah_create_post(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me aah_profiles%rowtype;
  new_id uuid;
  v_scenario text := p->>'scenario';
  v_direction text := p->>'direction';
  v_leave timestamptz := (p->>'leave_at')::timestamptz;
  v_day timestamptz := date_trunc('day', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
  v_shop text := regexp_replace(lower(coalesce(p->>'shop', '')), '[[:space:]　]+', '', 'g');
  v_lim int;
begin
  select * into me from aah_profiles where id = auth.uid();
  if me.id is null then raise exception 'not registered'; end if;
  if me.banned_until is not null and me.banned_until > now() then raise exception 'banned'; end if;
  if v_leave is null or v_leave <= now() then raise exception 'bad leave time'; end if;

  -- 同一個人同時出兩個 post 都要排隊計數
  perform pg_advisory_xact_lock(hashtext('aah_create_post:' || me.id::text));

  if v_scenario = 'dining' then
    v_lim := coalesce(public.aah_num_setting('limit_dining_per_day'), 3)::int;
    if (select count(*) from aah_posts where author_id = me.id and scenario = 'dining' and created_at >= v_day) >= v_lim then
      raise exception 'dining daily limit %', v_lim;
    end if;
    v_lim := coalesce(public.aah_num_setting('limit_dining_branch_per_day'), 1)::int;
    if (select count(*) from aah_posts
         where author_id = me.id and scenario = 'dining' and created_at >= v_day
           and mall_id = p->>'mall_id'
           and regexp_replace(lower(coalesce(shop, '')), '[[:space:]　]+', '', 'g') = v_shop) >= v_lim then
      raise exception 'dining branch limit %', v_lim;
    end if;
  elsif v_scenario = 'parking' and v_direction = 'have' then
    v_lim := coalesce(public.aah_num_setting('limit_parking_per_day'), 3)::int;
    if (select count(*) from aah_posts where author_id = me.id and scenario = 'parking' and direction = 'have' and created_at >= v_day) >= v_lim then
      raise exception 'parking daily limit %', v_lim;
    end if;
  end if;

  if not coalesce((p->>'verified_on_site')::boolean, false) and not public.aah_setting('allow_test_location') and not public.aah__gps_exempt() then
    raise exception 'not on site';
  end if;
  insert into aah_posts (scenario, direction, mall_id, mall_name, shop, fields, price, pay_methods, leave_at,
                         author_id, author_name, verified_on_site, auto_accept, need_count, pushed_count, accept_en_route)
  values (
    v_scenario, v_direction, p->>'mall_id', p->>'mall_name', p->>'shop',
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
end $$;
revoke execute on function public.aah_create_post(jsonb) from public, anon;
grant execute on function public.aah_create_post(jsonb) to authenticated;

-- ============ 4. 置頂暫時收埋（功能保留，管理頁開返就用得） ============
do $patch$
declare
  src text := pg_get_functiondef('public.aah_pin_post(uuid,boolean)'::regprocedure);
  fixed text;
begin
  if position('pin disabled' in src) > 0 then return; end if;
  fixed := replace(src, '  select * into p from aah_posts where id = p_post for update;',
    '  if not public.aah_setting(''pin_enabled'') then raise exception ''pin disabled''; end if;
  select * into p from aah_posts where id = p_post for update;');
  if fixed = src then raise exception 'aah_pin_post: patch point not found'; end if;
  execute fixed;
end $patch$;

-- ============ 5. 舉報加「炒飛／私下加價」 ============
alter table public.aah_reports drop constraint if exists aah_reports_kind_check;
alter table public.aah_reports add constraint aah_reports_kind_check
  check (kind in ('noshow', 'prepay', 'harass', 'fake', 'scalping', 'other'));

do $patch$
declare
  src text := pg_get_functiondef('public.aah_report_user(uuid,text,text,uuid,uuid)'::regprocedure);
  fixed text;
begin
  if position('scalping' in src) > 0 then return; end if;
  fixed := replace(src, '(''prepay'', ''harass'', ''fake'', ''other'')', '(''prepay'', ''harass'', ''fake'', ''scalping'', ''other'')');
  if fixed = src then raise exception 'aah_report_user: patch point not found'; end if;
  execute fixed;
end $patch$;

do $patch$
declare
  src text := pg_get_functiondef('public.aah__push_on_report()'::regprocedure);
  fixed text;
begin
  if position('scalping' in src) > 0 then return; end if;
  fixed := replace(src, 'when ''prepay'' then ''要求預先轉數''', 'when ''prepay'' then ''要求預先轉數'' when ''scalping'' then ''炒飛／私下加價''');
  if fixed = src then raise exception 'aah__push_on_report: patch point not found'; end if;
  execute fixed;
end $patch$;

-- ============ 6. 濫用訊號：裝置、停用紀錄 ============
-- 裝置號碼係 app 自己整嘅隨機號碼（唔係廣告 ID、唔係電話號碼），用嚟睇同一部機開咗幾多個帳戶
create table if not exists public.aah_device_accounts (
  device_id text not null check (device_id ~ '^[A-Za-z0-9-]{8,64}$'),
  user_id uuid not null,
  platform text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seen_count int not null default 1,
  primary key (device_id, user_id)
);
create index if not exists aah_device_accounts_user_idx on public.aah_device_accounts (user_id);
alter table public.aah_device_accounts enable row level security;
drop policy if exists aah_device_admin_read on public.aah_device_accounts;
create policy aah_device_admin_read on public.aah_device_accounts for select using (public.aah_is_admin());
revoke insert, update, delete on public.aah_device_accounts from anon, authenticated;

create or replace function public.aah_touch_device(p_device text, p_platform text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_device is null or p_device !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  insert into aah_device_accounts (device_id, user_id, platform)
  values (p_device, auth.uid(), left(p_platform, 20))
  on conflict (device_id, user_id) do update
    set last_seen = now(), seen_count = aah_device_accounts.seen_count + 1,
        platform = coalesce(excluded.platform, aah_device_accounts.platform)
    where aah_device_accounts.last_seen < now() - interval '10 minutes';
end $$;
revoke execute on function public.aah_touch_device(text, text) from public, anon;
grant execute on function public.aah_touch_device(text, text) to authenticated;

-- 每次停用帳戶都記低，用嚟計「呢個月封咗幾多個帳戶」
create table if not exists public.aah_ban_log (
  id bigserial primary key,
  user_id uuid not null,
  banned_until timestamptz not null,
  reason text not null,          -- noshow / report
  created_at timestamptz not null default now()
);
create index if not exists aah_ban_log_created_idx on public.aah_ban_log (created_at);
alter table public.aah_ban_log enable row level security;
drop policy if exists aah_ban_log_admin_read on public.aah_ban_log;
create policy aah_ban_log_admin_read on public.aah_ban_log for select using (public.aah_is_admin());
revoke insert, update, delete on public.aah_ban_log from anon, authenticated;

create or replace function public.aah__log_ban() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.banned_until is not null and new.banned_until > now()
     and new.banned_until > coalesce(old.banned_until, '-infinity'::timestamptz) then
    insert into aah_ban_log (user_id, banned_until, reason)
    values (new.id, new.banned_until, case when new.no_shows > old.no_shows then 'noshow' else 'report' end);
  end if;
  return null;
end $$;
drop trigger if exists aah_log_ban on public.aah_profiles;
create trigger aah_log_ban after update of banned_until on public.aah_profiles
  for each row execute function public.aah__log_ban();

-- ============ 7. 用家意見、用法紀錄（每週問題報告用） ============
create table if not exists public.aah_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  page text,
  text text not null check (length(text) between 1 and 1000),
  status text not null default 'new' check (status in ('new', 'read')),
  created_at timestamptz not null default now()
);
create index if not exists aah_feedback_created_idx on public.aah_feedback (created_at);
alter table public.aah_feedback enable row level security;
drop policy if exists aah_feedback_admin_read on public.aah_feedback;
create policy aah_feedback_admin_read on public.aah_feedback for select using (public.aah_is_admin());
drop policy if exists aah_feedback_admin_update on public.aah_feedback;
create policy aah_feedback_admin_update on public.aah_feedback for update using (public.aah_is_admin()) with check (public.aah_is_admin());
revoke insert, delete on public.aah_feedback from anon, authenticated;

create or replace function public.aah_send_feedback(p_text text, p_page text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(v) < 2 then raise exception 'feedback too short'; end if;
  if (select count(*) from aah_feedback where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'feedback limit';
  end if;
  insert into aah_feedback (user_id, page, text) values (auth.uid(), left(p_page, 60), left(v, 1000));
end $$;
revoke execute on function public.aah_send_feedback(text, text) from public, anon;
grant execute on function public.aah_send_feedback(text, text) to authenticated;

create table if not exists public.aah_events (
  id bigserial primary key,
  user_id uuid,
  device_id text,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists aah_events_name_created_idx on public.aah_events (name, created_at);
create index if not exists aah_events_device_idx on public.aah_events (device_id, created_at);
alter table public.aah_events enable row level security;
drop policy if exists aah_events_admin_read on public.aah_events;
create policy aah_events_admin_read on public.aah_events for select using (public.aah_is_admin());
revoke insert, update, delete on public.aah_events from anon, authenticated;

create or replace function public.aah_log_event(p_name text, p_props jsonb default '{}'::jsonb, p_device text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_dev text := case when p_device ~ '^[A-Za-z0-9-]{8,64}$' then p_device end;
begin
  if p_name not in ('feed_empty', 'post_start', 'post_abandon', 'post_done', 'register_start', 'register_abandon',
                    'register_done', 'limit_hit', 'price_warned', 'price_blocked', 'contact_warned') then
    return;
  end if;
  if (select count(*) from aah_events
       where device_id is not distinct from v_dev and user_id is not distinct from auth.uid()
         and created_at > now() - interval '1 day') >= 300 then
    return;
  end if;
  insert into aah_events (user_id, device_id, name, props)
  values (auth.uid(), v_dev, p_name,
          case when jsonb_typeof(p_props) = 'object' and pg_column_size(p_props) <= 1000 then p_props else '{}'::jsonb end);
end $$;
grant execute on function public.aah_log_event(text, jsonb, text) to anon, authenticated;

-- 刪除帳戶：意見同用法紀錄唔再連到個人
do $patch$
declare
  src text := pg_get_functiondef('public.aah__delete_account(uuid)'::regprocedure);
  fixed text;
begin
  if position('aah_feedback' in src) > 0 then return; end if;
  fixed := replace(src, '  update aah_appeals set text = ''（已刪除）'' where user_id = p_user;',
    '  update aah_appeals set text = ''（已刪除）'' where user_id = p_user;
  update aah_feedback set user_id = null where user_id = p_user;
  update aah_events set user_id = null where user_id = p_user;');
  if fixed = src then raise exception 'aah__delete_account: patch point not found'; end if;
  execute fixed;
end $patch$;

-- 過咗 2 年嘅裝置、用法同停用紀錄自動清走
create or replace function public.aah_cleanup_old_records() returns void
language sql security definer set search_path = public as $$
  delete from aah_events where created_at < now() - interval '2 years';
  delete from aah_device_accounts where last_seen < now() - interval '2 years';
  delete from aah_ban_log where created_at < now() - interval '2 years';
$$;
revoke execute on function public.aah_cleanup_old_records() from public, anon, authenticated;
select cron.schedule('aah-cleanup-old-records', '17 4 * * *', 'select public.aah_cleanup_old_records()');

-- ============ 8. 管理頁：可疑帳戶、統計 ============
create or replace function public.aah_admin_suspicious()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.aah_is_admin() then raise exception 'not admin'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.score desc, x.created_at desc)
    from (
      select p.id, p.nickname, p.created_at, p.no_shows, p.banned_until,
             coalesce(dev.max_accounts, 1) as accounts_on_device,
             coalesce(dev.mates, '{}') as device_mates,
             coalesce(rep.total, 0) as reports,
             coalesce(rep.open, 0) as open_reports,
             coalesce(rep.scalping, 0) as scalping_reports,
             (coalesce(dev.max_accounts, 1) - 1) * 2 + coalesce(rep.total, 0) * 3 + p.no_shows as score
      from aah_profiles p
      left join lateral (
        select max(c.cnt) as max_accounts,
               array(select distinct coalesce(o.nickname, left(d2.user_id::text, 6))
                       from aah_device_accounts d1
                       join aah_device_accounts d2 on d2.device_id = d1.device_id and d2.user_id <> d1.user_id
                       left join aah_profiles o on o.id = d2.user_id
                      where d1.user_id = p.id limit 10) as mates
        from aah_device_accounts d
        join (select device_id, count(*) as cnt from aah_device_accounts group by device_id) c on c.device_id = d.device_id
        where d.user_id = p.id
      ) dev on true
      left join lateral (
        select count(*) as total,
               count(*) filter (where status = 'open') as open,
               count(*) filter (where kind = 'scalping') as scalping
        from aah_reports r where r.accused_id = p.id and r.kind <> 'noshow'
      ) rep on true
      where coalesce(dev.max_accounts, 1) > 1 or coalesce(rep.total, 0) > 0 or p.no_shows > 0
      limit 200
    ) x
  ), '[]'::jsonb);
end $$;
revoke execute on function public.aah_admin_suspicious() from public, anon;
grant execute on function public.aah_admin_suspicious() to authenticated;

create or replace function public.aah_admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
begin
  if not public.aah_is_admin() then raise exception 'not admin'; end if;
  return jsonb_build_object(
    'month_start', v_month,
    'bans_this_month', (select count(distinct user_id) from aah_ban_log where created_at >= v_month),
    'bans_noshow', (select count(distinct user_id) from aah_ban_log where created_at >= v_month and reason = 'noshow'),
    'bans_report', (select count(distinct user_id) from aah_ban_log where created_at >= v_month and reason = 'report'),
    'reports_this_month', (select count(*) from aah_reports where created_at >= v_month and kind <> 'noshow'),
    'scalping_reports_this_month', (select count(*) from aah_reports where created_at >= v_month and kind = 'scalping'),
    'new_feedback', (select count(*) from aah_feedback where status = 'new')
  );
end $$;
revoke execute on function public.aah_admin_stats() from public, anon;
grant execute on function public.aah_admin_stats() to authenticated;

-- ============ 9. 換泊車地點（只記商場官網寫明嘅，有出處先顯示） ============
alter table public.malls add column if not exists redeem_place text;
alter table public.malls add column if not exists redeem_floor text;
alter table public.malls add column if not exists redeem_source_url text;
alter table public.malls add column if not exists redeem_checked_at date;

create or replace function public.mall_set_redeem_place(p_mall_id int, p_place text, p_floor text, p_source_url text)
returns void language plpgsql set search_path = public as $$
declare m malls%rowtype;
begin
  select * into m from malls where id = p_mall_id;
  if m.id is null then raise exception 'mall not found'; end if;
  if nullif(btrim(p_place), '') is null then raise exception 'place required'; end if;
  if coalesce(p_source_url, '') !~ '^https?://' then raise exception 'source url required'; end if;
  insert into mall_sync_log (applied, mall_id, mall_name, action, field, old_value, new_value)
  values (true, m.id, m.name, 'update', 'redeem_place',
          concat_ws(' ', m.redeem_floor, m.redeem_place),
          concat_ws(' ', nullif(btrim(p_floor), ''), btrim(p_place)) || ' ← ' || p_source_url);
  update malls set redeem_place = left(btrim(p_place), 60), redeem_floor = left(nullif(btrim(p_floor), ''), 20),
                   redeem_source_url = left(p_source_url, 500), redeem_checked_at = (now() at time zone 'Asia/Hong_Kong')::date
  where id = p_mall_id;
end $$;
revoke execute on function public.mall_set_redeem_place(int, text, text, text) from public, anon, authenticated;

-- 泊車配對預設喺詢問處／換泊車處見面；有核實資料就寫埋邊層
do $patch$
declare
  src text := pg_get_functiondef('public.aah__accept(uuid,integer)'::regprocedure);
  fixed text;
begin
  if position('redeem_place' in src) > 0 then return; end if;
  fixed := replace(src, 'case when p.scenario = ''parking'' then ''客戶服務台'' else p.shop || ''門口'' end',
    'case when p.scenario = ''parking'' then coalesce((
               select left(concat_ws('' '', ml.redeem_floor, ml.redeem_place), 40) from malls ml
                where ml.id::text = p.mall_id and ml.redeem_source_url is not null and ml.redeem_place is not null),
               ''詢問處／換泊車處'') else p.shop || ''門口'' end');
  if fixed = src then raise exception 'aah__accept: patch point not found'; end if;
  execute fixed;
end $patch$;
