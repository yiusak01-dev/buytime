-- 啱啱好推送通知
-- 做法：資料庫 trigger 喺事情發生時（有人有興趣、配對、訊息、取消、冇出現…）經 pg_net
-- call aah-push edge function；app 本身唔可以叫推送，避免俾人濫用。
-- 金鑰：push 暗號喺資料庫入面產生；VAPID 金鑰由 edge function 第一次運行時產生，兩者都存喺 Vault。

-- ───────────── 1. 裝置訂閱（一個人可以有幾部裝置） ─────────────
create table if not exists public.aah_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists aah_push_subscriptions_user_idx on public.aah_push_subscriptions (user_id);
alter table public.aah_push_subscriptions enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aah_push_subscriptions' and policyname = 'aah_push_own_select') then
    create policy aah_push_own_select on public.aah_push_subscriptions for select to authenticated using (user_id = auth.uid());
  end if;
end $$;
revoke insert, update, delete on public.aah_push_subscriptions from anon, authenticated;

-- 儲存／移除：經 function 做，同一部裝置轉咗帳戶會轉俾而家登入嗰個人
create or replace function public.aah_save_push_subscription(p_endpoint text, p_subscription jsonb, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_endpoint is null or length(p_endpoint) < 10 or length(p_endpoint) > 2000 then raise exception 'bad endpoint'; end if;
  insert into aah_push_subscriptions (endpoint, user_id, subscription, user_agent, updated_at)
  values (p_endpoint, auth.uid(), p_subscription, left(p_user_agent, 300), now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id, subscription = excluded.subscription, user_agent = excluded.user_agent, updated_at = now();
end $$;

create or replace function public.aah_remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from aah_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.aah_save_push_subscription(text, jsonb, text) from public, anon;
revoke execute on function public.aah_remove_push_subscription(text) from public, anon;
grant execute on function public.aah_save_push_subscription(text, jsonb, text) to authenticated;
grant execute on function public.aah_remove_push_subscription(text) to authenticated;

-- ───────────── 2. 金鑰（Vault） ─────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'aah_push_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'aah_push_secret',
      '啱啱好：資料庫 call aah-push 用嘅暗號');
  end if;
end $$;

-- 俾 edge function（service role）讀設定
create or replace function public.aah__push_config()
returns jsonb
language sql
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'aah_push_secret'),
    'vapid_public', (select decrypted_secret from vault.decrypted_secrets where name = 'aah_vapid_public'),
    'vapid_private', (select decrypted_secret from vault.decrypted_secrets where name = 'aah_vapid_private'));
$$;

-- edge function 第一次運行時存 VAPID 金鑰（已經有就唔會蓋過）
create or replace function public.aah__push_init_vapid(p_public text, p_private text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('aah_vapid_init'));
  if not exists (select 1 from vault.secrets where name = 'aah_vapid_public') then
    perform vault.create_secret(p_private, 'aah_vapid_private', '啱啱好：Web Push 私鑰');
    perform vault.create_secret(p_public, 'aah_vapid_public', '啱啱好：Web Push 公鑰');
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = 'aah_vapid_public');
end $$;

revoke execute on function public.aah__push_config() from public, anon, authenticated;
revoke execute on function public.aah__push_init_vapid(text, text) from public, anon, authenticated;
grant execute on function public.aah__push_config() to service_role;
grant execute on function public.aah__push_init_vapid(text, text) to service_role;

-- 公鑰係公開嘅：app 訂閱時要用
create or replace function public.aah_vapid_public_key()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'aah_vapid_public';
$$;
grant execute on function public.aah_vapid_public_key() to anon, authenticated;

-- ───────────── 3. 發送 ─────────────
create or replace function public.aah__push(p_user uuid, p_title text, p_body text, p_url text, p_tag text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
begin
  if p_user is null then return; end if;
  -- 冇登記裝置就唔使 call
  if not exists (select 1 from aah_push_subscriptions where user_id = p_user) then return; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'aah_push_secret';
  perform net.http_post(
    url := 'https://oadwfgujhjqgnydigwux.supabase.co/functions/v1/aah-push',
    body := jsonb_build_object('recipient_id', p_user, 'title', left(p_title, 80), 'body', left(coalesce(p_body, ''), 160), 'url', p_url, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 8000);
exception when others then
  -- 推送失敗唔可以影響主要動作
  raise warning 'aah push failed: %', sqlerrm;
end $$;
revoke execute on function public.aah__push(uuid, text, text, text, text) from public, anon, authenticated;

-- ───────────── 4. 事件 ─────────────

-- 4a. 有人對我個 post 有興趣（交易完成先檢查：自動配對嘅話由「配對成功」通知）
create or replace function public.aah__push_on_interest()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p aah_posts%rowtype;
  st text;
  msg text;
begin
  select status into st from aah_interests where id = new.id;
  if st is distinct from 'pending' then return null; end if;
  select * into p from aah_posts where id = new.post_id;
  if p.id is null then return null; end if;
  select text into msg from aah_interest_messages where interest_id = new.id order by created_at desc limit 1;
  perform aah__push(
    p.author_id,
    coalesce(new.display_name, '有人') || ' 對你個 post 有興趣',
    p.shop || coalesce('・「' || msg || '」', '') || case when new.offer is not null and p.price is not null and new.offer <> p.price then '（出價 $' || new.offer || '）' else '' end,
    '/post/' || p.id,
    'post-' || p.id);
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_interest' and tgrelid = 'public.aah_interests'::regclass) then
    execute $t$create constraint trigger aah_push_interest after insert on public.aah_interests
  deferrable initially deferred for each row execute function public.aah__push_on_interest()$t$;
  end if;
end $$;

-- 4b. 配對前嘅傾偈（第一句已經包喺 4a；揀咗你嘅由「配對成功」通知）
create or replace function public.aah__push_on_interest_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  i aah_interests%rowtype;
  p aah_posts%rowtype;
  n int;
  v_to uuid;
  v_from_name text;
begin
  if new.from_id is null then return null; end if;
  select * into i from aah_interests where id = new.interest_id;
  if i.id is null or i.status = 'accepted' then return null; end if;
  select count(*) into n from aah_interest_messages where interest_id = new.interest_id;
  if n <= 1 then return null; end if;
  select * into p from aah_posts where id = i.post_id;
  if new.from_id = p.author_id then
    v_to := i.user_id; v_from_name := coalesce(p.author_name, '對方');
  else
    v_to := p.author_id; v_from_name := coalesce(i.display_name, '對方');
  end if;
  perform aah__push(v_to, v_from_name || '：' || new.text, p.shop || '・' || p.mall_name, '/post/' || p.id, 'post-' || p.id);
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_interest_message' and tgrelid = 'public.aah_interest_messages'::regclass) then
    execute $t$create constraint trigger aah_push_interest_message after insert on public.aah_interest_messages
  deferrable initially deferred for each row execute function public.aah__push_on_interest_message()$t$;
  end if;
end $$;

-- 4c. 配對成功（夾單由 4d 逐個加入通知）
create or replace function public.aah__push_on_match()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  if new.scenario = 'groupbuy' then return null; end if;
  for r in select user_id from aah_match_participants where match_id = new.id and user_id is distinct from auth.uid() loop
    perform aah__push(r.user_id, '配對成功！', new.shop || '・' || new.mall_name || '，去確認見面地點', '/match/' || new.id, 'match-' || new.id);
  end loop;
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_match' and tgrelid = 'public.aah_matches'::regclass) then
    execute $t$create constraint trigger aah_push_match after insert on public.aah_matches
  deferrable initially deferred for each row execute function public.aah__push_on_match()$t$;
  end if;
end $$;

-- 4d. 有人加入夾單
create or replace function public.aah__push_on_join()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m aah_matches%rowtype;
  r record;
  n int;
  need int;
begin
  select * into m from aah_matches where id = new.match_id;
  if m.scenario is distinct from 'groupbuy' or new.user_id = m.author_id then return null; end if;
  select count(*) - 1 into n from aah_match_participants where match_id = m.id;
  select coalesce(need_count, 1) into need from aah_posts where id = m.post_id;
  for r in select user_id from aah_match_participants where match_id = m.id and user_id <> new.user_id loop
    perform aah__push(
      r.user_id,
      coalesce(new.display_name, '有人') || ' 加入咗夾單',
      m.shop || '・' || n || '/' || need || ' 人' || case when n >= need then '，夠人喇！' else '' end,
      '/match/' || m.id,
      'match-' || m.id);
  end loop;
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_join' and tgrelid = 'public.aah_match_participants'::regclass) then
    execute $t$create constraint trigger aah_push_join after insert on public.aah_match_participants
  deferrable initially deferred for each row execute function public.aah__push_on_join()$t$;
  end if;
end $$;

-- 4e. 配對入面嘅訊息（配對已經結束就唔推，由 4f 講）
create or replace function public.aah__push_on_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m aah_matches%rowtype;
  r record;
  v_name text;
begin
  if new.from_id is null then return null; end if;
  select * into m from aah_matches where id = new.match_id;
  if m.status is distinct from 'active' then return null; end if;
  select display_name into v_name from aah_match_participants where match_id = m.id and user_id = new.from_id;
  for r in select user_id from aah_match_participants where match_id = m.id and user_id <> new.from_id loop
    perform aah__push(r.user_id, coalesce(v_name, '對方') || '：' || new.text, m.shop || '・' || m.mall_name, '/match/' || m.id, 'match-' || m.id);
  end loop;
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_message' and tgrelid = 'public.aah_messages'::regclass) then
    execute $t$create constraint trigger aah_push_message after insert on public.aah_messages
  deferrable initially deferred for each row execute function public.aah__push_on_message()$t$;
  end if;
end $$;

-- 4f. 配對取消／完成
create or replace function public.aah__push_on_match_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_reason text;
begin
  if new.status = old.status then return null; end if;
  if new.status = 'cancelled' then
    select text into v_reason from aah_messages where match_id = new.id and from_id = new.cancelled_by order by created_at desc limit 1;
    for r in select user_id, arrived_at from aah_match_participants where match_id = new.id and user_id is distinct from new.cancelled_by loop
      perform aah__push(
        r.user_id,
        '對方取消咗配對',
        case when new.late_cancel and r.arrived_at is not null then '你已經到咗：已記錄對方臨時取消，補償咗你 20 分'
             else new.shop || coalesce('・「' || v_reason || '」', '') end,
        '/match/' || new.id,
        'match-' || new.id);
    end loop;
  elsif new.status = 'completed' then
    for r in select user_id from aah_match_participants where match_id = new.id and user_id is distinct from auth.uid() loop
      perform aah__push(r.user_id, '交收完成！', new.shop || '・積分已經入咗帳', '/match/' || new.id, 'match-' || new.id);
    end loop;
  end if;
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_match_status' and tgrelid = 'public.aah_matches'::regclass) then
    execute $t$create trigger aah_push_match_status after update of status on public.aah_matches
  for each row execute function public.aah__push_on_match_status()$t$;
  end if;
end $$;

-- 4g. 被報告冇出現
create or replace function public.aah__push_on_report()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.kind = 'noshow' then
    perform aah__push(new.accused_id, '對方報告你冇出現', '帳戶停用 30 日；有誤會可以喺 48 小時內申訴', '/me', 'noshow-' || new.id);
  end if;
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_report' and tgrelid = 'public.aah_reports'::regclass) then
    execute $t$create trigger aah_push_report after insert on public.aah_reports
  for each row execute function public.aah__push_on_report()$t$;
  end if;
end $$;

-- 4h. 申訴結果
create or replace function public.aah__push_on_appeal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = old.status then return null; end if;
  if new.status = 'approved' then
    perform aah__push(new.user_id, '申訴成功', '已經撤銷冇出現，帳戶同積分已經恢復', '/me', 'appeal-' || new.id);
  elsif new.status = 'rejected' then
    perform aah__push(new.user_id, '申訴審核咗', '維持停用，到期會自動恢復', '/me', 'appeal-' || new.id);
  end if;
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_appeal' and tgrelid = 'public.aah_appeals'::regclass) then
    execute $t$create trigger aah_push_appeal after update of status on public.aah_appeals
  for each row execute function public.aah__push_on_appeal()$t$;
  end if;
end $$;

-- 4i. $5 置頂：推送俾喺呢個商場（同附近 700 米商場，泊車除外）嘅人
create table if not exists public.aah_push_throttle (
  user_id uuid primary key,
  last_opportunity_at timestamptz not null
);
alter table public.aah_push_throttle enable row level security;

create or replace function public.aah__push_pin_audience()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_lat double precision;
  v_lng double precision;
  v_price text;
begin
  if new.pinned_until is null or new.pinned_until <= now() then return null; end if;
  if old.pinned_until is not null and old.pinned_until > now() then return null; end if; -- 延長置頂唔再推
  select lat::double precision, lng::double precision into v_lat, v_lng from malls where id::text = new.mall_id;
  v_price := case when new.scenario = 'groupbuy' then '一齊夾' when new.price is null or new.price = 0 then '免費' else '$' || new.price end;
  for r in
    select distinct on (pr.user_id) pr.user_id, pr.mall_id, m.name as mall_name
    from aah_presence pr
    join aah_profiles p on p.id = pr.user_id
    left join malls m on m.id::text = pr.mall_id
    where pr.seen_at > now() - interval '30 minutes'
      and pr.user_id <> new.author_id
      and p.notify_opportunities
      and new.scenario = any (p.notify_cats)
      and (p.banned_until is null or p.banned_until < now())
      and (
        pr.mall_id = new.mall_id
        or (new.scenario <> 'parking' and v_lat is not null and m.lat is not null and
            2 * 6371000 * asin(sqrt(power(sin(radians(m.lat::double precision - v_lat) / 2), 2)
              + cos(radians(v_lat)) * cos(radians(m.lat::double precision))
              * power(sin(radians(m.lng::double precision - v_lng) / 2), 2))) <= 700)
      )
      and not exists (select 1 from aah_push_throttle t where t.user_id = pr.user_id and t.last_opportunity_at > now() - interval '10 minutes')
    order by pr.user_id, pr.seen_at desc
    limit 1000
  loop
    perform aah__push(
      r.user_id,
      '啱啱好！' || case when r.mall_id = new.mall_id then '呢度' else '附近' end || '有着數',
      new.shop || '・' || v_price || case when r.mall_id = new.mall_id then '' else '（' || new.mall_name || '）' end,
      '/post/' || new.id,
      'opp-' || new.id);
    insert into aah_push_throttle (user_id, last_opportunity_at) values (r.user_id, now())
      on conflict (user_id) do update set last_opportunity_at = now();
  end loop;
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_pin' and tgrelid = 'public.aah_posts'::regclass) then
    execute $t$create trigger aah_push_pin after update of pinned_until on public.aah_posts
  for each row execute function public.aah__push_pin_audience()$t$;
  end if;
end $$;

revoke execute on function public.aah__push_on_interest() from public, anon, authenticated;
revoke execute on function public.aah__push_on_interest_message() from public, anon, authenticated;
revoke execute on function public.aah__push_on_match() from public, anon, authenticated;
revoke execute on function public.aah__push_on_join() from public, anon, authenticated;
revoke execute on function public.aah__push_on_message() from public, anon, authenticated;
revoke execute on function public.aah__push_on_match_status() from public, anon, authenticated;
revoke execute on function public.aah__push_on_report() from public, anon, authenticated;
revoke execute on function public.aah__push_on_appeal() from public, anon, authenticated;
revoke execute on function public.aah__push_pin_audience() from public, anon, authenticated;

-- ───────────── 5. 定時：過咗離開時間、15 分鐘冇人理 ─────────────
alter table public.aah_posts add column if not exists expiry_pushed_at timestamptz;
alter table public.aah_posts add column if not exists pin_prompt_pushed_at timestamptz;

-- 延長咗就可以再提一次
create or replace function public.aah__reset_expiry_push()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.leave_at > old.leave_at then new.expiry_pushed_at := null; end if;
  return new;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_reset_expiry_push' and tgrelid = 'public.aah_posts'::regclass) then
    execute $t$create trigger aah_reset_expiry_push before update of leave_at on public.aah_posts
  for each row execute function public.aah__reset_expiry_push()$t$;
  end if;
end $$;

create or replace function public.aah__push_scheduled()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p record;
begin
  for p in
    update aah_posts set expiry_pushed_at = now()
    where status = 'open' and expiry_pushed_at is null
      and leave_at <= now() and leave_at > now() - interval '10 minutes'
    returning id, author_id, shop
  loop
    perform aah__push(p.author_id, '你仲喺度？', p.shop || ' 個 post 過咗你講嘅離開時間，仲喺度可以延長', '/post/' || p.id, 'post-' || p.id);
  end loop;

  for p in
    update aah_posts ap set pin_prompt_pushed_at = now()
    where ap.status = 'open' and ap.pin_prompt_pushed_at is null
      and ap.created_at <= now() - interval '15 minutes' and ap.created_at > now() - interval '25 minutes'
      and ap.leave_at > now() + interval '5 minutes'
      and (ap.pinned_until is null or ap.pinned_until <= now())
      and not exists (select 1 from aah_interests i where i.post_id = ap.id)
    returning ap.id, ap.author_id, ap.shop
  loop
    perform aah__push(p.author_id, '15 分鐘都未有人理', p.shop || '：置頂 15 分鐘，同時推送俾附近嘅人？', '/post/' || p.id, 'post-' || p.id);
  end loop;
end $$;
revoke execute on function public.aah__push_scheduled() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable: %', sqlerrm;
end $$;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and not exists (select 1 from cron.job where jobname = 'aah-push-scheduled') then
    perform cron.schedule('aah-push-scheduled', '* * * * *', 'select public.aah__push_scheduled()');
  end if;
end $$;
