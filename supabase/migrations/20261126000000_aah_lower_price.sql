-- 拎走講價之後：冇人理，放單嘅人可以自己減價，減完再推俾喺附近嘅人（每 10 分鐘最多推一次）
create or replace function public.aah_lower_price(p_post uuid, p_price integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p aah_posts%rowtype;
  v_last timestamptz;
  r record;
  v_lat double precision;
  v_lng double precision;
  v_price text;
begin
  select * into p from aah_posts where id = p_post for update;
  if p.id is null or p.author_id is distinct from auth.uid() then raise exception 'not author'; end if;
  if p.status <> 'open' or p.leave_at < now() then raise exception 'post closed'; end if;
  if p.price is null or p_price is null or p_price < 0 or p_price >= p.price then raise exception 'price must go down'; end if;
  v_last := nullif(p.fields->>'priceDropAt', '')::timestamptz;
  update aah_posts
     set price = p_price,
         fields = coalesce(fields, '{}'::jsonb) || jsonb_build_object('priceDropAt', now(), 'priceWas', p.price)
   where id = p_post;
  -- 再推：同置頂一樣嘅對象（喺場、有開通知、啱類別），每個 post 10 分鐘最多一次
  if p.review_only or (v_last is not null and v_last > now() - interval '10 minutes') then return; end if;
  select lat::double precision, lng::double precision into v_lat, v_lng from malls where id::text = p.mall_id;
  v_price := case when p_price = 0 then '免費' else '$' || p_price end;
  for r in
    select distinct on (pr.user_id) pr.user_id, pr.mall_id
    from aah_presence pr
    join aah_profiles pf on pf.id = pr.user_id
    left join malls m on m.id::text = pr.mall_id
    where pr.seen_at > now() - interval '30 minutes'
      and pr.user_id <> p.author_id
      and pf.notify_opportunities
      and p.scenario = any (pf.notify_cats)
      and (pf.banned_until is null or pf.banned_until < now())
      and not pf.review_tester
      and not public.aah__blocked_pair(p.author_id, pr.user_id)
      and (
        pr.mall_id = p.mall_id
        or (p.scenario <> 'parking' and v_lat is not null and m.lat is not null and
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
      '減價！' || case when r.mall_id = p.mall_id then '呢度' else '附近' end || '有着數',
      p.shop || '・' || v_price || '（原價 $' || p.price || '）' || case when r.mall_id = p.mall_id then '' else '・' || p.mall_name end,
      '/post/' || p.id,
      'opp-' || p.id);
    insert into aah_push_throttle (user_id, last_opportunity_at) values (r.user_id, now())
      on conflict (user_id) do update set last_opportunity_at = now();
  end loop;
end $$;
revoke all on function public.aah_lower_price(uuid, integer) from public, anon;
grant execute on function public.aah_lower_price(uuid, integer) to authenticated;
