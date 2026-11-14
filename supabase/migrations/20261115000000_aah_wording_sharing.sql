-- 唔再講「着數」：推送同系統訊息改用共享講法（同 app 一齊上線先 apply）
--  * 置頂推送標題：「啱啱好！呢度／附近有着數」→「啱啱好！呢度／附近有人放咗嘢」
--  * 對方取消後重新放出嘅自動訊息：「個着數重新放出，我再揀緊」→「重新放出咗，我再揀緊」

CREATE OR REPLACE FUNCTION public.aah__push_pin_audience()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_lat double precision;
  v_lng double precision;
  v_price text;
begin
  if new.pinned_until is null or new.pinned_until <= now() then return null; end if;
  if new.review_only then return null; end if;
  if old.pinned_until is not null and old.pinned_until > now() then return null; end if;
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
      and not p.review_tester
      and not public.aah__blocked_pair(new.author_id, pr.user_id)
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
      '啱啱好！' || case when r.mall_id = new.mall_id then '呢度' else '附近' end || '有人放咗嘢',
      new.shop || '・' || v_price || case when r.mall_id = new.mall_id then '' else '（' || new.mall_name || '）' end,
      '/post/' || new.id,
      'opp-' || new.id);
    insert into aah_push_throttle (user_id, last_opportunity_at) values (r.user_id, now())
      on conflict (user_id) do update set last_opportunity_at = now();
  end loop;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.aah__restore_interests(p_post uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_author uuid;
begin
  select author_id into v_author from aah_posts where id = p_post;
  for r in select id from aah_interests where post_id = p_post and status = 'declined' and declined_by_match loop
    update aah_interests set status = 'pending', declined_by_match = false where id = r.id;
    insert into aah_interest_messages (interest_id, from_id, text) values (r.id, v_author, '重新放出咗，我再揀緊');
  end loop;
end $function$;
