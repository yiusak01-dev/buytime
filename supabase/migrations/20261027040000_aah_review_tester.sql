-- 審批專用帳戶：Apple／Google 審批人員唔喺香港商場，冇辦法 GPS 確認。
-- 標記咗 review_tester 嘅帳戶可以揀測試位置出 post、撳「我到咗」，試到成個流程。
-- 只可以由管理員喺資料庫標記（用戶改唔到呢欄）。
alter table public.aah_profiles add column if not exists review_tester boolean not null default false;

create or replace function public.aah__gps_exempt()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce((select review_tester from aah_profiles where id = auth.uid()), false);
$function$;

revoke all on function public.aah__gps_exempt() from public, anon;
grant execute on function public.aah__gps_exempt() to authenticated;

do $$
declare
  r record;
  d text;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('aah_mark_arrived', 'aah_interest_on_site', 'aah_create_post')
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'if public.aah_setting(''enforce_gps'') then', 'if public.aah_setting(''enforce_gps'') and not public.aah__gps_exempt() then');
    d := replace(d, 'and not public.aah_setting(''allow_test_location'') then', 'and not public.aah_setting(''allow_test_location'') and not public.aah__gps_exempt() then');
    execute d;
  end loop;
end $$;
