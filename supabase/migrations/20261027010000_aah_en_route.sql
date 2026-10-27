-- 「我去緊」：未到商場都可以撳有興趣，講明幾耐到
-- 規則：
--  * 出 post 嗰個可以揀接唔接去緊嘅人（預設接受；夾單一律只限喺場）
--  * 最多 30 分鐘到，而且要早過 post 過期時間 5 分鐘；要有 GPS 計距離，距離同時間要合理
--  * 自動配對只會揀已喺場嘅人；去緊嘅人到咗商場會自動轉做「已喺場」
--  * 配對咗之後，過咗講好嘅時間 5 分鐘都未到，已到嘅一方可以取消：記對方一次冇出現，個 post 重新放出

alter table public.aah_posts add column if not exists accept_en_route boolean not null default true;

alter table public.aah_interests
  add column if not exists en_route boolean not null default false,
  add column if not exists eta_at timestamptz,
  add column if not exists distance_m integer,
  add column if not exists completed integer,
  add column if not exists no_shows integer,
  add column if not exists declined_by_match boolean not null default false;

alter table public.aah_matches
  add column if not exists en_route_user uuid,
  add column if not exists eta_at timestamptz;

-- ---------- 出 post：記低接唔接去緊嘅人 ----------
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
    v_scenario <> 'groupbuy' and coalesce((p->>'accept_en_route')::boolean, true)
  ) returning id into new_id;
  return new_id;
end $function$;

-- ---------- 有興趣：新版加「去緊」（aah_express_interest_v2） ----------
create or replace function public.aah_express_interest_v2(
  p_post uuid,
  p_text text,
  p_offer integer default null,
  p_eta_min integer default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_on_site boolean default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  me aah_profiles%rowtype;
  p aah_posts%rowtype;
  i_id uuid;
  i_en_route boolean;
  is_new boolean := false;
  v_en_route boolean := p_eta_min is not null;
  v_eta timestamptz;
  v_dist integer;
  v_lat double precision;
  v_lng double precision;
begin
  select * into me from aah_profiles where id = auth.uid();
  if me.id is null then raise exception 'not registered'; end if;
  if me.banned_until is not null and me.banned_until > now() then raise exception 'banned'; end if;
  select * into p from aah_posts where id = p_post;
  if p.id is null or p.status <> 'open' or p.leave_at < now() then raise exception 'post closed'; end if;
  if p.author_id = me.id then raise exception 'own post'; end if;

  if v_en_route then
    if p.scenario = 'groupbuy' or not coalesce(p.accept_en_route, true) then raise exception 'en route not allowed'; end if;
    if p_eta_min < 1 or p_eta_min > 30 then raise exception 'bad eta'; end if;
    v_eta := now() + make_interval(mins => p_eta_min);
    if v_eta > p.leave_at - interval '5 minutes' then raise exception 'eta too late'; end if;
    if p_lat is null or p_lng is null then raise exception 'gps required'; end if;
    begin
      execute 'select lat::double precision, lng::double precision from public.malls where id::text = $1' into v_lat, v_lng using p.mall_id;
    exception when undefined_table or undefined_column then v_lat := null;
    end;
    if v_lat is not null then
      v_dist := round(2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - v_lat) / 2), 2)
                + cos(radians(v_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_lng) / 2), 2))));
      -- 大約每分鐘 1 公里（搭車／揸車），再加 2 公里寬鬆
      if v_dist > p_eta_min * 1000 + 2000 then raise exception 'too far for eta'; end if;
    end if;
  end if;

  select id, en_route into i_id, i_en_route from aah_interests where post_id = p_post and user_id = me.id;
  if i_id is null then
    insert into aah_interests (post_id, user_id, offer, display_name, en_route, eta_at, distance_m, completed, no_shows)
    values (p_post, me.id, p_offer, me.nickname, v_en_route, v_eta, v_dist, coalesce(me.completed, 0), coalesce(me.no_shows, 0))
    returning id into i_id;
    is_new := true;
  else
    if p_offer is not null then
      update aah_interests set offer = p_offer where id = i_id;
    end if;
    if v_en_route then
      update aah_interests set en_route = true, eta_at = v_eta, distance_m = v_dist where id = i_id and status = 'pending';
    elsif coalesce(p_on_site, false) and i_en_route then
      update aah_interests set en_route = false, eta_at = null, distance_m = null where id = i_id;
    end if;
  end if;
  insert into aah_interest_messages (interest_id, from_id, text) values (i_id, me.id, left(p_text, 80));
  -- 自動配對只會揀已喺場嘅人
  if is_new and p.auto_accept and not v_en_route then
    return public.aah__accept(i_id, p_offer);
  end if;
  return null;
end $function$;

revoke all on function public.aah_express_interest_v2(uuid, text, integer, integer, double precision, double precision, boolean) from public, anon;
grant execute on function public.aah_express_interest_v2(uuid, text, integer, integer, double precision, double precision, boolean) to authenticated;

-- 舊版 app 用緊嘅三個參數版本：當作喺場
create or replace function public.aah_express_interest(p_post uuid, p_text text, p_offer integer default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  return public.aah_express_interest_v2(p_post, p_text, p_offer, null, null, null, null);
end $function$;

-- ---------- 去緊嘅人到咗商場：轉做已喺場 ----------
create or replace function public.aah_interest_on_site(p_post uuid, p_lat double precision default null, p_lng double precision default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  i aah_interests%rowtype;
  p aah_posts%rowtype;
  v_lat double precision;
  v_lng double precision;
  v_dist double precision;
begin
  select * into i from aah_interests where post_id = p_post and user_id = auth.uid() for update;
  if i.id is null or not i.en_route or i.status <> 'pending' then return null; end if;
  select * into p from aah_posts where id = p_post;
  if public.aah_setting('enforce_gps') then
    begin
      execute 'select lat::double precision, lng::double precision from public.malls where id::text = $1' into v_lat, v_lng using p.mall_id;
    exception when undefined_table or undefined_column then v_lat := null;
    end;
    if v_lat is not null then
      if p_lat is null or p_lng is null then raise exception 'gps required'; end if;
      v_dist := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - v_lat) / 2), 2) + cos(radians(v_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_lng) / 2), 2)));
      if v_dist > 400 then raise exception 'not at mall'; end if;
    end if;
  end if;
  update aah_interests set en_route = false, eta_at = null, distance_m = null where id = i.id;
  insert into aah_interest_messages (interest_id, from_id, text) values (i.id, auth.uid(), '我到咗商場');
  if p.status = 'open' and p.leave_at > now() and p.auto_accept then
    return public.aah__accept(i.id, i.offer);
  end if;
  return null;
end $function$;

revoke all on function public.aah_interest_on_site(uuid, double precision, double precision) from public, anon;
grant execute on function public.aah_interest_on_site(uuid, double precision, double precision) to authenticated;

-- ---------- 揀人配對：記低去緊嘅人同到達時間；被自動拒絕嘅人做記號（重新放出時通知返佢哋） ----------
create or replace function public.aah__accept(p_interest uuid, p_price integer)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  i aah_interests%rowtype;
  p aah_posts%rowtype;
  m_id uuid;
  joined int;
  v_eta timestamptz;
begin
  select * into i from aah_interests where id = p_interest for update;
  select * into p from aah_posts where id = i.post_id for update;
  if p.status <> 'open' or p.leave_at < now() then raise exception 'post closed'; end if;
  if i.status <> 'pending' then raise exception 'interest not pending'; end if;
  if i.en_route then
    -- 揀得遲，原本講嘅時間已經過咗：至少俾 5 分鐘
    v_eta := least(greatest(i.eta_at, now() + interval '5 minutes'), p.leave_at);
  end if;
  if p.match_id is not null and p.scenario = 'groupbuy' then
    m_id := p.match_id;
    insert into aah_messages (match_id, from_id, text) values (m_id, null, coalesce(i.display_name, '有人') || ' 加入咗夾單');
  else
    insert into aah_matches (post_id, scenario, mall_id, mall_name, shop, price, pay_methods, author_id, meet_place, meet_at, en_route_user, eta_at)
    values (p.id, p.scenario, p.mall_id, p.mall_name, p.shop, case when p.price is null then null else coalesce(p_price, i.offer, p.price) end,
            p.pay_methods, p.author_id,
            case when p.scenario = 'parking' then '客戶服務台' else p.shop || '門口' end,
            coalesce(v_eta, least(now() + interval '5 minutes', p.leave_at)),
            case when i.en_route then i.user_id end,
            v_eta)
    returning id into m_id;
    insert into aah_match_participants (match_id, user_id, display_name) values (m_id, p.author_id, coalesce(p.author_name, '用戶'));
    insert into aah_messages (match_id, from_id, text) values (m_id, null,
      case when i.en_route
        then '配對成功！' || coalesce(i.display_name, '對方') || ' 去緊，講咗 ' || to_char(v_eta at time zone 'Asia/Hong_Kong', 'HH24:MI') || ' 前到。確認見面地點，到咗撳「我到咗」。'
        else '配對成功！確認見面地點同時間，到咗撳「我到咗」。' end);
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
    update aah_interests set status = 'declined', declined_by_match = true where post_id = p.id and status = 'pending';
  else
    update aah_posts set match_id = m_id where id = p.id;
  end if;
  return m_id;
end $function$;

-- ---------- 去緊嘅人過咗時間未到：取消、記冇出現、重新放出 ----------
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
  v_ded int;
  v_status text;
  r record;
begin
  select * into m from aah_matches where id = p_match for update;
  if m.id is null or m.status <> 'active' then raise exception 'match not active'; end if;
  if m.en_route_user is null then raise exception 'not en route'; end if;
  if not public.aah_is_participant(p_match) or auth.uid() = m.en_route_user then raise exception 'not participant'; end if;
  if now() < m.eta_at + interval '5 minutes' then raise exception 'too early'; end if;
  select arrived_at into me_arrived from aah_match_participants where match_id = p_match and user_id = auth.uid();
  if me_arrived is null then raise exception 'reporter has not arrived'; end if;
  select arrived_at into them_arrived from aah_match_participants where match_id = p_match and user_id = m.en_route_user;
  if them_arrived is not null then raise exception 'accused arrived'; end if;

  -- 記一次冇出現（同「冇出現」報告一樣：停用 30 日，可以申訴）
  insert into aah_reports (match_id, reporter_id, accused_id, kind, note)
    values (p_match, auth.uid(), m.en_route_user, 'noshow', '去緊，但過咗講好嘅時間 5 分鐘都未到');
  update aah_matches set status = 'noshow', ended_at = now() where id = p_match;
  select least(50, points) into v_ded from aah_profiles where id = m.en_route_user;
  update aah_profiles set no_shows = no_shows + 1, banned_until = now() + interval '30 days', points = points - coalesce(v_ded, 0)
    where id = m.en_route_user;
  insert into aah_point_ledger (user_id, match_id, pts, reason) values (m.en_route_user, p_match, -coalesce(v_ded, 0), 'noshow');
  insert into aah_messages (match_id, from_id, text) values (p_match, null, '對方過咗講好嘅時間都未到，配對已經取消，個 post 重新放出。');

  -- 重新放出：之前因為配對而收到「已經俾咗人」嘅人，變返等緊覆，並通知佢哋
  select * into p from aah_posts where id = m.post_id for update;
  v_status := case when p.leave_at > now() + interval '2 minutes' then 'open' else 'expired' end;
  update aah_posts set status = v_status, match_id = null where id = p.id;
  update aah_interests set status = 'declined', declined_by_match = false where post_id = p.id and user_id = m.en_route_user;
  if v_status = 'open' then
    for r in select id from aah_interests where post_id = p.id and status = 'declined' and declined_by_match loop
      update aah_interests set status = 'pending', declined_by_match = false where id = r.id;
      insert into aah_interest_messages (interest_id, from_id, text) values (r.id, p.author_id, '個着數重新放出，我再揀緊');
    end loop;
  end if;
  return v_status;
end $function$;

revoke all on function public.aah_release_late(uuid) from public, anon;
grant execute on function public.aah_release_late(uuid) to authenticated;

-- ---------- 一般「冇出現」報告：去緊嘅人要過咗講好時間 5 分鐘先報得 ----------
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
  if m.en_route_user = p_accused and now() < m.eta_at + interval '5 minutes' then raise exception 'too early'; end if;
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

-- ---------- 推送：去緊嘅人有興趣（冇出現通知沿用 aah_reports 嘅推送） ----------
create or replace function public.aah__push_on_interest()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    coalesce(new.display_name, '有人') || case when new.en_route then ' 去緊，想接你個 post' else ' 對你個 post 有興趣' end,
    p.shop
      || case when new.en_route and new.eta_at is not null
           then '・約 ' || to_char(new.eta_at at time zone 'Asia/Hong_Kong', 'HH24:MI') || ' 到'
                || coalesce('（' || round(new.distance_m / 1000.0, 1) || ' 公里）', '')
           else '' end
      || coalesce('・「' || msg || '」', '')
      || case when new.offer is not null and p.price is not null and new.offer <> p.price then '（出價 $' || new.offer || '）' else '' end,
    '/post/' || p.id,
    'post-' || p.id);
  return null;
end $function$;
