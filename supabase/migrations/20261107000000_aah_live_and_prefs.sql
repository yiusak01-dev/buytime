-- 即時人數同用戶喜好

-- 1. 即時人數：30 分鐘內喺商場開過 app 嘅登記用戶
--    少過 10 人唔出數字（免得認到個別用戶），審批帳戶唔計
create or replace function public.aah_live_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  with recent as (
    select pr.mall_id
    from aah_presence pr
    join aah_profiles p on p.id = pr.user_id
    where pr.seen_at > now() - interval '30 minutes'
      and not coalesce(p.review_tester, false)
  ), per as (
    select mall_id, count(*)::int as n from recent group by mall_id
  )
  select jsonb_build_object(
    'total', (select case when count(*) >= 10 then count(*)::int end from recent),
    'malls', coalesce((select jsonb_object_agg(mall_id, n) from per where n >= 10), '{}'::jsonb)
  );
$$;
revoke all on function public.aah_live_counts() from public;
grant execute on function public.aah_live_counts() to anon, authenticated;

-- 2. 登記後問幾樣：常去商場、揸唔揸車、想慳邊樣（只有自己睇到，profiles RLS 已經限咗）
alter table public.aah_profiles
  add column if not exists fav_malls text[] not null default '{}',
  add column if not exists drives text,
  add column if not exists save_cats text[] not null default '{}',
  add column if not exists promotions_consent_at timestamptz;

alter table public.aah_profiles drop constraint if exists aah_profiles_drives_check;
alter table public.aah_profiles add constraint aah_profiles_drives_check check (drives is null or drives in ('yes', 'sometimes', 'no'));
alter table public.aah_profiles drop constraint if exists aah_profiles_fav_malls_check;
alter table public.aah_profiles add constraint aah_profiles_fav_malls_check check (cardinality(fav_malls) <= 20);
alter table public.aah_profiles drop constraint if exists aah_profiles_save_cats_check;
alter table public.aah_profiles add constraint aah_profiles_save_cats_check check (save_cats <@ array['parking', 'dining', 'shopping']::text[]);

grant update (fav_malls, drives, save_cats) on public.aah_profiles to authenticated;
grant insert (fav_malls, drives, save_cats) on public.aah_profiles to authenticated;

-- 3. 推廣通知：記低幾時同意（私隱條例直銷要有同意紀錄）；熄咗就清走
create or replace function public.aah__stamp_promotions_consent()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.notify_promotions and (tg_op = 'INSERT' or not coalesce(old.notify_promotions, false)) then
    new.promotions_consent_at := now();
  elsif not new.notify_promotions then
    new.promotions_consent_at := null;
  end if;
  return new;
end $$;
drop trigger if exists aah_profiles_promotions_consent on public.aah_profiles;
create trigger aah_profiles_promotions_consent
  before insert or update of notify_promotions on public.aah_profiles
  for each row execute function public.aah__stamp_promotions_consent();

-- 4. 刪除帳戶：連新欄位一齊清
do $patch$
declare
  src text := pg_get_functiondef('public.aah__delete_account(uuid)'::regprocedure);
  fixed text;
begin
  if position('fav_malls' in src) > 0 then return; end if;
  fixed := replace(src, 'notify_promotions = false,', 'notify_promotions = false,
    fav_malls = ''{}'',
    drives = null,
    save_cats = ''{}'',');
  if fixed = src then raise exception 'aah__delete_account: patch point not found'; end if;
  execute fixed;
end $patch$;
