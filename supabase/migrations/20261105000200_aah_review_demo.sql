-- App Store／Google Play 審批用示範內容（App Review 2.1：要俾審批人員試到成個流程）
-- - 審批帳戶（aah_profiles.review_tester）只會見到示範 post；佢哋出嘅 post 都只係審批帳戶見到，唔會打擾真用戶
-- - 「示範用戶」（冇得登入）喺海港城長期有幾個示範 post：
--     審批人員表示興趣 → 即刻配對；審批人員撳「我到咗」→ 示範用戶都到，配對完成
--     審批人員自己出 post → 示範用戶會表示興趣，可以試接受
-- - 每 30 分鐘自動補返示範 post、清走舊配對

alter table public.aah_posts add column if not exists review_only boolean not null default false;

-- 示範用戶（固定 id；冇密碼，唔可以登入）
do $$
declare v_bot uuid := '00000000-0000-4000-8000-00000000b075';
begin
  if not exists (select 1 from auth.users where id = v_bot) then
    insert into auth.users (id, email, aud, role) values (v_bot, 'review-demo@buytime.hk', 'authenticated', 'authenticated');
  end if;
  if not exists (select 1 from public.aah_profiles where id = v_bot) then
    insert into public.aah_profiles (id, nickname) values (v_bot, '示範用戶');
  end if;
  update public.aah_profiles set review_tester = true, completed = greatest(completed, 12) where id = v_bot;
end $$;

create or replace function public.aah__review_bot() returns uuid
language sql immutable as $$ select '00000000-0000-4000-8000-00000000b075'::uuid $$;

-- 審批帳戶出嘅 post 自動變示範
create or replace function public.aah__mark_review_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from aah_profiles where id = new.author_id and review_tester) then
    new.review_only := true;
  end if;
  return new;
end $$;
revoke execute on function public.aah__mark_review_post() from public, anon, authenticated;

-- 審批帳戶同真用戶互相唔可以表示興趣（就算直接叫 API）
create or replace function public.aah__guard_review_interest()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_review boolean; v_tester boolean;
begin
  select review_only into v_review from aah_posts where id = new.post_id;
  select coalesce(review_tester, false) into v_tester from aah_profiles where id = new.user_id;
  if coalesce(v_review, false) <> coalesce(v_tester, false) then raise exception 'post closed'; end if;
  return new;
end $$;
revoke execute on function public.aah__guard_review_interest() from public, anon, authenticated;

-- feed：審批帳戶只見示範 post；真用戶只見真 post
alter policy aah_posts_select on public.aah_posts using (
  (status = 'open' and review_only = public.aah__gps_exempt() and not public.aah__blocked_with(author_id))
  or author_id = auth.uid()
  or (match_id is not null and public.aah_is_participant(match_id))
);

-- 示範用戶即刻接受審批人員嘅興趣（交易完結時先做，等審批人員嘅留言先寫入）
create or replace function public.aah__review_bot_accept()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_match uuid;
begin
  select author_id into v_author from aah_posts where id = new.post_id;
  if v_author is distinct from public.aah__review_bot() then return null; end if;
  if (select status from aah_interests where id = new.id) <> 'pending' then return null; end if;
  v_match := public.aah__accept(new.id, null);
  insert into aah_messages (match_id, from_id, text)
    values (v_match, v_author, '你好！我係示範用戶，喺見面地點等你。到咗撳「我到咗」就完成。');
  return null;
exception when others then
  raise warning 'review bot accept failed: %', sqlerrm;
  return null;
end $$;
revoke execute on function public.aah__review_bot_accept() from public, anon, authenticated;

-- 審批人員自己出 post：示範用戶表示興趣
create or replace function public.aah__review_bot_interest()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_bot uuid := public.aah__review_bot(); v_int uuid;
begin
  if not new.review_only or new.author_id = v_bot or new.status <> 'open' then return null; end if;
  insert into aah_interests (post_id, user_id, display_name, completed, no_shows)
    values (new.id, v_bot, '示範用戶', 12, 0)
    on conflict do nothing
    returning id into v_int;
  if v_int is not null then
    insert into aah_interest_messages (interest_id, from_id, text)
      values (v_int, v_bot, case when new.scenario = 'groupbuy' then '我想一齊夾！' else '有興趣，我喺附近' end);
  end if;
  return null;
exception when others then
  raise warning 'review bot interest failed: %', sqlerrm;
  return null;
end $$;
revoke execute on function public.aah__review_bot_interest() from public, anon, authenticated;

-- 審批人員撳「我到咗」：示範用戶都到，配對完成
create or replace function public.aah__review_bot_arrive()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_bot uuid := public.aah__review_bot();
begin
  if new.arrived_at is null or old.arrived_at is not null or new.user_id = v_bot then return null; end if;
  if not exists (select 1 from aah_match_participants where match_id = new.match_id and user_id = v_bot) then return null; end if;
  if (select status from aah_matches where id = new.match_id) <> 'active' then return null; end if;
  update aah_match_participants set arrived_at = now(), confirmed_at = coalesce(confirmed_at, now())
   where match_id = new.match_id and user_id = v_bot and arrived_at is null;
  perform public.aah__complete_match(new.match_id);
  return null;
exception when others then
  raise warning 'review bot arrive failed: %', sqlerrm;
  return null;
end $$;
revoke execute on function public.aah__review_bot_arrive() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_mark_review_post') then
    create trigger aah_mark_review_post before insert on public.aah_posts
      for each row execute function public.aah__mark_review_post();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_review_interest') then
    create trigger aah_guard_review_interest before insert on public.aah_interests
      for each row execute function public.aah__guard_review_interest();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_review_bot_accept') then
    create constraint trigger aah_review_bot_accept after insert on public.aah_interests
      deferrable initially deferred
      for each row execute function public.aah__review_bot_accept();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_review_bot_interest') then
    create constraint trigger aah_review_bot_interest after insert on public.aah_posts
      deferrable initially deferred
      for each row execute function public.aah__review_bot_interest();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_review_bot_arrive') then
    create trigger aah_review_bot_arrive after update of arrived_at on public.aah_match_participants
      for each row execute function public.aah__review_bot_arrive();
  end if;
end $$;

-- 補返示範 post、清走舊配對（cron 每 30 分鐘）
create or replace function public.aah_review_demo_refresh()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_bot uuid := public.aah__review_bot();
  v_mall text := '1';
  v_mall_name text;
  t record;
begin
  select name into v_mall_name from malls where id::text = v_mall;
  if v_mall_name is null then return; end if;

  -- 示範配對：2 個鐘後收尾
  update aah_matches set status = 'cancelled', ended_at = now()
   where status = 'active' and created_at < now() - interval '2 hours'
     and exists (select 1 from aah_match_participants where match_id = aah_matches.id and user_id = v_bot);
  -- 審批人員嘅示範 post 過咗時間就收
  update aah_posts set status = 'expired' where review_only and status = 'open' and leave_at < now();
  -- 示範用戶嘅 post 就嚟到期就收，等下面補新嘅
  update aah_posts set status = 'expired' where author_id = v_bot and status = 'open' and leave_at < now() + interval '20 minutes';

  for t in
    select * from (values
      ('parking', 'have', '停車場', jsonb_build_object('receiptAmount', 600, 'receiptCount', '1 張', 'receiptType', '紙單', 'remark', '示範 post：撳「有興趣」試吓配對'), 20, array['cash', 'payme'], null::int),
      ('parking', 'want', '停車場', jsonb_build_object('hours', 2, 'remark', '示範 post：有收據可以撳「有興趣」'), 30, array['cash', 'fps'], null::int),
      ('offer', 'have', '甜品店', jsonb_build_object('title', '買一送一券', 'faceValue', 50, 'remark', '示範 post'), 0, array[]::text[], null::int),
      ('dining', 'have', '茶餐廳', jsonb_build_object('queueNo', 'A038', 'partySize', 2, 'calling', 'A021', 'remark', '示範 post'), 0, array[]::text[], null::int),
      ('groupbuy', 'join', '超市', jsonb_build_object('deal', '第二件半價', 'remark', '示範 post'), null::int, array[]::text[], 1)
    ) as x(scenario, direction, shop, fields, price, pay, need)
  loop
    if not exists (
      select 1 from aah_posts
       where author_id = v_bot and status = 'open' and scenario = t.scenario and direction = t.direction
    ) then
      insert into aah_posts (scenario, direction, mall_id, mall_name, shop, fields, price, pay_methods, leave_at,
                             author_id, author_name, verified_on_site, auto_accept, accept_en_route, need_count, review_only)
      values (t.scenario, t.direction, v_mall, v_mall_name, t.shop, t.fields, t.price, t.pay, now() + interval '3 hours',
              v_bot, '示範用戶', true, false, true, t.need, true);
    end if;
  end loop;
end $$;
revoke execute on function public.aah_review_demo_refresh() from public, anon, authenticated;

select public.aah_review_demo_refresh();

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if not exists (select 1 from cron.job where jobname = 'aah_review_demo_refresh') then
      perform cron.schedule('aah_review_demo_refresh', '*/30 * * * *', 'select public.aah_review_demo_refresh()');
    end if;
  end if;
end $$;
