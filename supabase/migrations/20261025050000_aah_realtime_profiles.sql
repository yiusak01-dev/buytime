-- app 嘅 realtime channel 有訂閱 aah_profiles；冇加入 publication 會令成個 channel 嘅
-- postgres_changes 失效（Supabase 回 "Unable to subscribe to changes"），所以要加返。
-- aah_profiles 有 RLS（只睇到自己），realtime 會跟 RLS 過濾。
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aah_profiles') then
    alter publication supabase_realtime add table public.aah_profiles;
  end if;
end $$;
