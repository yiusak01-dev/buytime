-- 商場舖頭名單：用嚟提醒「呢間舖唔喺呢個商場」（淨係提醒，唔阻止放 post）
-- 由每週商場資料定時任務抓返嚟（商場官網商戶名錄優先，餐廳可以用 OpenRice），每個商場有出處先用

create table if not exists public.mall_shops (
  id bigserial primary key,
  mall_id integer not null references public.malls(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  name_en text check (name_en is null or length(name_en) <= 80),
  category text not null default 'other' check (category in ('dining', 'retail', 'service', 'other')),
  floor text check (floor is null or length(floor) <= 20),
  created_at timestamptz not null default now()
);
create unique index if not exists mall_shops_mall_name_uniq on public.mall_shops (mall_id, lower(name));
alter table public.mall_shops enable row level security;
drop policy if exists mall_shops_read on public.mall_shops;
create policy mall_shops_read on public.mall_shops for select using (true);
revoke insert, update, delete on public.mall_shops from anon, authenticated;
grant select on public.mall_shops to anon, authenticated;

-- 商場名單幾時抓、喺邊度抓、有幾多間（冇出處就當未有名單，app 唔會提醒）
alter table public.malls add column if not exists shops_source_url text;
alter table public.malls add column if not exists shops_checked_at date;
alter table public.malls add column if not exists shops_count integer;

-- 成份名單一次過換：新名單少過舊名單一半（多數係抓唔齊）就唔換
create or replace function public.mall_replace_shops(p_mall_id int, p_source_url text, p_shops jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  m malls%rowtype;
  v_old int;
  v_new int;
  v_len int;
begin
  select * into m from malls where id = p_mall_id;
  if m.id is null then raise exception 'mall not found'; end if;
  if coalesce(p_source_url, '') !~ '^https?://' then raise exception 'source url required'; end if;
  if jsonb_typeof(p_shops) <> 'array' then raise exception 'p_shops must be a json array'; end if;
  v_len := jsonb_array_length(p_shops);
  if v_len < 5 then raise exception 'list too short (%)', v_len; end if;
  select count(*) into v_old from mall_shops where mall_id = p_mall_id;
  if v_old > 0 and v_len < v_old / 2 then raise exception 'new list too short (% vs %)', v_len, v_old; end if;

  delete from mall_shops where mall_id = p_mall_id;
  insert into mall_shops (mall_id, name, name_en, category, floor)
  select p_mall_id,
         left(btrim(s->>'name'), 80),
         nullif(left(btrim(coalesce(s->>'name_en', '')), 80), ''),
         case when s->>'category' in ('dining', 'retail', 'service') then s->>'category' else 'other' end,
         nullif(left(btrim(coalesce(s->>'floor', '')), 20), '')
  from jsonb_array_elements(p_shops) s
  where nullif(btrim(coalesce(s->>'name', '')), '') is not null
  on conflict do nothing;
  get diagnostics v_new = row_count;

  update malls set shops_source_url = left(p_source_url, 500),
                   shops_checked_at = (now() at time zone 'Asia/Hong_Kong')::date,
                   shops_count = v_new
  where id = p_mall_id;
  insert into mall_sync_log (applied, mall_id, mall_name, action, field, old_value, new_value)
  values (true, m.id, m.name, 'update', 'shops', v_old::text, v_new::text || ' ← ' || p_source_url);
  return jsonb_build_object('mall', m.name, 'old', v_old, 'new', v_new);
end $$;
revoke execute on function public.mall_replace_shops(int, text, jsonb) from public, anon, authenticated;
