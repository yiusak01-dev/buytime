-- 每週商場資料（Excel）同步入 malls 表
-- 只會更新／新增，唔會刪除或者停用任何商場；每次改動都記入 mall_sync_log
create table if not exists public.mall_sync_log (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  applied boolean not null,
  mall_id integer,
  mall_name text not null,
  action text not null,          -- update / insert
  field text,
  old_value text,
  new_value text
);
alter table public.mall_sync_log enable row level security;
revoke all on public.mall_sync_log from anon, authenticated;

create or replace function public.mall_sync_from_sheet(p_rows jsonb, p_apply boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  r jsonb;
  m malls%rowtype;
  v_name text;
  v_changes jsonb;
  v_updated jsonb := '[]'::jsonb;
  v_inserted jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_warn jsonb := '[]'::jsonb;
  v_unchanged int := 0;
  v_txt text;
  v_num numeric;
  v_lat numeric;
  v_lng numeric;
  v_date date;
  v_cat text;
  v_near text;
  v_new_id int;
  k text;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a json array';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := nullif(trim(r->>'name'), '');
    if v_name is null then
      v_skipped := v_skipped || jsonb_build_object('name', '(冇名)', 'reason', '冇商場名稱');
      continue;
    end if;

    select * into m from malls where lower(trim(name)) = lower(v_name) limit 1;

    if m.id is not null then
      v_changes := '{}'::jsonb;

      -- 換泊條件（「待確認」或者空白唔會覆蓋現有資料）
      v_txt := nullif(trim(r->>'cond_weekday'), '');
      if v_txt is not null and v_txt <> '待確認' and length(v_txt) <= 300 and v_txt is distinct from m.weekday_parking_cond then
        v_changes := v_changes || jsonb_build_object('weekday_parking_cond', jsonb_build_array(m.weekday_parking_cond, v_txt));
      end if;
      v_txt := nullif(trim(r->>'cond_holiday'), '');
      if v_txt is not null and v_txt <> '待確認' and length(v_txt) <= 300 and v_txt is distinct from m.holiday_parking_cond then
        v_changes := v_changes || jsonb_build_object('holiday_parking_cond', jsonb_build_array(m.holiday_parking_cond, v_txt));
      end if;

      -- 時租（0 至 200 之間先接受）
      begin v_num := nullif(regexp_replace(coalesce(r->>'rate_weekday', ''), '[^0-9.]', '', 'g'), '')::numeric; exception when others then v_num := null; end;
      if v_num is not null then
        if v_num <= 0 or v_num > 200 then
          v_warn := v_warn || jsonb_build_object('name', v_name, 'warning', '平日時租唔合理：' || (r->>'rate_weekday'));
        elsif v_num is distinct from m.hourly_rate_weekday_num then
          v_changes := v_changes || jsonb_build_object('hourly_rate_weekday_num', jsonb_build_array(m.hourly_rate_weekday_num, v_num));
        end if;
      end if;
      begin v_num := nullif(regexp_replace(coalesce(r->>'rate_holiday', ''), '[^0-9.]', '', 'g'), '')::numeric; exception when others then v_num := null; end;
      if v_num is not null then
        if v_num <= 0 or v_num > 200 then
          v_warn := v_warn || jsonb_build_object('name', v_name, 'warning', '假日時租唔合理：' || (r->>'rate_holiday'));
        elsif v_num is distinct from m.hourly_rate_holiday_num then
          v_changes := v_changes || jsonb_build_object('hourly_rate_holiday_num', jsonb_build_array(m.hourly_rate_holiday_num, v_num));
        end if;
      end if;

      -- 支援拼單（唔會由已知答案改返做「待確認」）
      v_txt := nullif(trim(r->>'stacking'), '');
      if v_txt is not null and length(v_txt) <= 100 and v_txt is distinct from m.supports_stacking
         and not (v_txt = '待確認' and coalesce(m.supports_stacking, '待確認') <> '待確認') then
        v_changes := v_changes || jsonb_build_object('supports_stacking', jsonb_build_array(m.supports_stacking, v_txt));
      end if;

      v_txt := nullif(trim(r->>'redemption'), '');
      if v_txt is not null and v_txt <> '待確認' and length(v_txt) <= 300 and v_txt is distinct from m.redemption_method then
        v_changes := v_changes || jsonb_build_object('redemption_method', jsonb_build_array(m.redemption_method, v_txt));
      end if;

      v_txt := nullif(trim(r->>'address'), '');
      if v_txt is not null and length(v_txt) <= 200 and m.address is null then
        v_changes := v_changes || jsonb_build_object('address', jsonb_build_array(m.address, v_txt));
      end if;

      -- 座標：只喺原本冇，或者移動少過 500 米先自動改；移動太遠只係提醒
      begin v_lat := nullif(r->>'lat', '')::numeric; v_lng := nullif(r->>'lng', '')::numeric; exception when others then v_lat := null; v_lng := null; end;
      if v_lat is not null and v_lng is not null then
        if v_lat not between 22.1 and 22.6 or v_lng not between 113.8 and 114.5 then
          v_warn := v_warn || jsonb_build_object('name', v_name, 'warning', '座標唔喺香港範圍');
        elsif m.lat is null or m.lng is null then
          v_changes := v_changes || jsonb_build_object('lat', jsonb_build_array(m.lat, v_lat), 'lng', jsonb_build_array(m.lng, v_lng));
        elsif (v_lat <> m.lat or v_lng <> m.lng) then
          if sqrt(power((v_lat - m.lat) * 110540, 2) + power((v_lng - m.lng) * 111320 * cos(radians(m.lat)), 2)) <= 500 then
            v_changes := v_changes || jsonb_build_object('lat', jsonb_build_array(m.lat, v_lat), 'lng', jsonb_build_array(m.lng, v_lng));
          else
            v_warn := v_warn || jsonb_build_object('name', v_name, 'warning', '座標移動超過 500 米，冇自動改，請人手核實');
          end if;
        end if;
      end if;

      begin v_date := nullif(r->>'verified_at', '')::date; exception when others then v_date := null; end;
      if v_date is not null and v_date <= current_date + 1 and (m.data_verified_at is null or v_date > m.data_verified_at) then
        v_changes := v_changes || jsonb_build_object('data_verified_at', jsonb_build_array(m.data_verified_at, v_date));
      end if;

      if v_changes = '{}'::jsonb then
        v_unchanged := v_unchanged + 1;
        continue;
      end if;

      v_updated := v_updated || jsonb_build_object('name', m.name, 'changes', v_changes);

      if p_apply then
        update malls set
          weekday_parking_cond   = case when v_changes ? 'weekday_parking_cond' then v_changes->'weekday_parking_cond'->>1 else weekday_parking_cond end,
          holiday_parking_cond   = case when v_changes ? 'holiday_parking_cond' then v_changes->'holiday_parking_cond'->>1 else holiday_parking_cond end,
          hourly_rate_weekday_num = case when v_changes ? 'hourly_rate_weekday_num' then (v_changes->'hourly_rate_weekday_num'->>1)::numeric else hourly_rate_weekday_num end,
          hourly_rate_weekday     = case when v_changes ? 'hourly_rate_weekday_num' then (v_changes->'hourly_rate_weekday_num'->>1) else hourly_rate_weekday end,
          hourly_rate_holiday_num = case when v_changes ? 'hourly_rate_holiday_num' then (v_changes->'hourly_rate_holiday_num'->>1)::numeric else hourly_rate_holiday_num end,
          hourly_rate_holiday     = case when v_changes ? 'hourly_rate_holiday_num' then '$' || (v_changes->'hourly_rate_holiday_num'->>1) || '/hr' else hourly_rate_holiday end,
          hourly_rate_weekend     = case when v_changes ? 'hourly_rate_holiday_num' then (v_changes->'hourly_rate_holiday_num'->>1)::numeric else hourly_rate_weekend end,
          supports_stacking      = case when v_changes ? 'supports_stacking' then v_changes->'supports_stacking'->>1 else supports_stacking end,
          redemption_method      = case when v_changes ? 'redemption_method' then v_changes->'redemption_method'->>1 else redemption_method end,
          address                = case when v_changes ? 'address' then v_changes->'address'->>1 else address end,
          lat                    = case when v_changes ? 'lat' then (v_changes->'lat'->>1)::numeric else lat end,
          lng                    = case when v_changes ? 'lng' then (v_changes->'lng'->>1)::numeric else lng end,
          data_verified_at       = case when v_changes ? 'data_verified_at' then (v_changes->'data_verified_at'->>1)::date else data_verified_at end
        where id = m.id;

        for k in select jsonb_object_keys(v_changes) loop
          insert into mall_sync_log (applied, mall_id, mall_name, action, field, old_value, new_value)
          values (true, m.id, m.name, 'update', k, v_changes->k->>0, v_changes->k->>1);
        end loop;
      end if;

    else
      -- 新商場：要有類別同香港範圍內嘅座標，而且 150 米內冇現有商場（避免同一個場名寫法唔同而重複）
      v_cat := upper(nullif(trim(r->>'category'), ''));
      begin v_lat := nullif(r->>'lat', '')::numeric; v_lng := nullif(r->>'lng', '')::numeric; exception when others then v_lat := null; v_lng := null; end;
      if v_cat is null or v_cat not in ('A', 'B', 'C') then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', '新商場但冇類別（A/B/C）');
        continue;
      end if;
      if v_lat is null or v_lng is null or v_lat not between 22.1 and 22.6 or v_lng not between 113.8 and 114.5 then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', '新商場但冇香港範圍內嘅座標');
        continue;
      end if;
      select name into v_near from malls
       where lat is not null and lng is not null
         and sqrt(power((v_lat - lat) * 110540, 2) + power((v_lng - lng) * 111320 * cos(radians(lat)), 2)) <= 150
       limit 1;
      if v_near is not null then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', '150 米內已經有「' || v_near || '」，可能係同一個場（名唔同），冇新增');
        continue;
      end if;

      v_inserted := v_inserted || jsonb_build_object('name', v_name, 'category', v_cat);

      if p_apply then
        begin v_num := nullif(regexp_replace(coalesce(r->>'rate_weekday', ''), '[^0-9.]', '', 'g'), '')::numeric; exception when others then v_num := null; end;
        begin v_date := nullif(r->>'verified_at', '')::date; exception when others then v_date := current_date; end;
        insert into malls (category, mall_category, name, district, address, lat, lng,
                           weekday_parking_cond, holiday_parking_cond,
                           hourly_rate_weekday_num, hourly_rate_weekday,
                           hourly_rate_holiday_num, hourly_rate_weekend,
                           supports_stacking, redemption_method, data_verified_at, is_active)
        values (v_cat, v_cat, v_name, nullif(trim(r->>'district'), ''), nullif(trim(r->>'address'), ''), v_lat, v_lng,
                nullif(trim(r->>'cond_weekday'), ''), coalesce(nullif(trim(r->>'cond_holiday'), ''), nullif(trim(r->>'cond_weekday'), '')),
                case when v_num > 0 and v_num <= 200 then v_num end, case when v_num > 0 and v_num <= 200 then v_num::text end,
                (select x from (select nullif(regexp_replace(coalesce(r->>'rate_holiday', ''), '[^0-9.]', '', 'g'), '')::numeric x) s where x > 0 and x <= 200),
                (select x from (select nullif(regexp_replace(coalesce(r->>'rate_holiday', ''), '[^0-9.]', '', 'g'), '')::numeric x) s where x > 0 and x <= 200),
                coalesce(nullif(trim(r->>'stacking'), ''), '待確認'), nullif(trim(r->>'redemption'), ''),
                coalesce(v_date, current_date), true)
        returning id into v_new_id;
        insert into mall_sync_log (applied, mall_id, mall_name, action, new_value)
        values (true, v_new_id, v_name, 'insert', r::text);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'applied', p_apply,
    'received', jsonb_array_length(p_rows),
    'unchanged', v_unchanged,
    'updated_count', jsonb_array_length(v_updated),
    'inserted_count', jsonb_array_length(v_inserted),
    'updated', v_updated,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'warnings', v_warn
  );
end $$;

revoke all on function public.mall_sync_from_sheet(jsonb, boolean) from public, anon, authenticated;
