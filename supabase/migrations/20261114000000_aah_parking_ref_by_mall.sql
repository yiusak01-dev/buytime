-- 參考價改用商場自己嘅停車場時租：
--  * 泊車優惠單據：參考價 = 商場今日時租 × 比例（預設 0.5，即一半）× 換到幾多個鐘；超過參考價 × 倍數放唔到
--    星期六日用假日時租（冇就用平日）；商場冇時租資料 = 冇參考價（app 會提用家自己確認商場有冇泊車優惠）
--  * 餐廳排隊飛：冇參考價，多謝費自己定（免費都得）
--  * 舊嘅 dining_ref_per_person、parking_ref_per_hour 唔再用

insert into public.aah_settings (key, value) values ('parking_ref_rate_factor', '0.5')
  on conflict (key) do nothing;
delete from public.aah_settings where key in ('dining_ref_per_person', 'parking_ref_per_hour');

create or replace function public.aah__check_setting() returns trigger
language plpgsql set search_path = public as $$
declare v numeric;
begin
  if new.key in ('parking_ref_rate_factor', 'price_block_multiple',
                 'limit_dining_per_day', 'limit_dining_branch_per_day', 'limit_parking_per_day') then
    if jsonb_typeof(new.value) = 'null' then raise exception 'bad setting: % 一定要填', new.key; end if;
    if jsonb_typeof(new.value) <> 'number' then raise exception 'bad setting: % 要係數字', new.key; end if;
    v := (new.value #>> '{}')::numeric;
    if new.key like 'limit_%' and (v < 1 or v <> trunc(v)) then raise exception 'bad setting: % 要係 1 或以上嘅整數', new.key; end if;
    if new.key = 'price_block_multiple' and v < 1 then raise exception 'bad setting: 倍數最少 1'; end if;
    if new.key = 'parking_ref_rate_factor' and (v <= 0 or v > 5) then raise exception 'bad setting: 時租比例要大過 0、最多 5'; end if;
  elsif new.key in ('pin_enabled', 'sms_login', 'allow_test_location', 'enforce_gps', 'free_pin_trial') then
    if jsonb_typeof(new.value) <> 'boolean' then raise exception 'bad setting: % 要係開或者關', new.key; end if;
  end if;
  return new;
end $$;

-- 商場今日時租（同 app 嘅 mallRateToday 一樣計法）
create or replace function public.aah__mall_rate(p_mall text)
returns numeric
language sql stable security definer set search_path = public as $$
  with m as (
    select
      case
        when hourly_rate_weekday_num > 0 then hourly_rate_weekday_num
        when hourly_rate_weekday ~ '^\s*\$?\d+(\.\d+)?\s*$' then regexp_replace(hourly_rate_weekday, '[^0-9.]', '', 'g')::numeric
      end as wd,
      case
        when hourly_rate_holiday_num > 0 then hourly_rate_holiday_num
        when hourly_rate_holiday_num is null and hourly_rate_weekend > 0 then hourly_rate_weekend
      end as we
    from public.malls
    where id::text = p_mall
  )
  select case
    when extract(isodow from now() at time zone 'Asia/Hong_Kong') in (6, 7) and m.we is not null then m.we
    else m.wd
  end
  from m
$$;

drop function if exists public.aah__price_cap(text, text, jsonb);
create or replace function public.aah__price_cap(p_scenario text, p_direction text, p_fields jsonb, p_mall text)
returns table (ref numeric, cap numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_rate numeric;
  v_per numeric;
  v_units numeric;
  v_mult numeric := coalesce(public.aah_num_setting('price_block_multiple'), 2);
  v_factor numeric := coalesce(public.aah_num_setting('parking_ref_rate_factor'), 0.5);
  v_raw text := p_fields->>'hours';
begin
  if p_direction is distinct from 'have' or p_scenario is distinct from 'parking' then return; end if;
  v_rate := public.aah__mall_rate(p_mall);
  if v_raw ~ '^\s*\d+(\.\d+)?\s*$' then v_units := trim(v_raw)::numeric; end if;
  if v_rate is null or v_rate <= 0 or v_units is null or v_units <= 0 then return; end if;
  v_per := v_rate * v_factor;
  ref := round(v_per * v_units);
  cap := round(v_per * v_units * v_mult);
  return next;
end $$;

create or replace function public.aah__guard_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_price int;
  v_scenario text;
  v_direction text;
  v_fields jsonb;
  v_mall text;
  v_cap numeric;
begin
  if tg_table_name = 'aah_posts' then
    if tg_op = 'UPDATE' and new.price is not distinct from old.price and new.fields is not distinct from old.fields then return new; end if;
    v_price := new.price; v_scenario := new.scenario; v_direction := new.direction; v_fields := new.fields; v_mall := new.mall_id;
  elsif tg_table_name = 'aah_interests' then
    if tg_op = 'UPDATE' and new.offer is not distinct from old.offer then return new; end if;
    v_price := new.offer;
    select scenario, direction, fields, mall_id into v_scenario, v_direction, v_fields, v_mall from aah_posts where id = new.post_id;
  else -- aah_matches
    if tg_op = 'UPDATE' and new.price is not distinct from old.price then return new; end if;
    v_price := new.price;
    select scenario, direction, fields, mall_id into v_scenario, v_direction, v_fields, v_mall from aah_posts where id = new.post_id;
  end if;
  if v_price is null or v_price <= 0 then return new; end if;
  select c.cap into v_cap from public.aah__price_cap(v_scenario, v_direction, v_fields, v_mall) c;
  if v_cap is not null and v_price > v_cap then
    raise exception 'price too high %', v_cap::int;
  end if;
  return new;
end $$;

revoke execute on function public.aah__mall_rate(text) from public, anon, authenticated;
revoke execute on function public.aah__price_cap(text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.aah__guard_price() from public, anon, authenticated;
revoke execute on function public.aah__check_setting() from public, anon, authenticated;
