-- 暱稱規則（伺服器檢查，唔係淨係喺畫面擋）：
--  * 唔可以用「啱啱好」「官方」「客服」「admin」呢類字（防扮官方）
--  * 唔可以有 6 個或以上數字（防留電話）
--  * 有 post 開緊或者配對緊嗰陣唔改得（免得對方以為等錯人）
--  * 30 日只可以改一次（第一次改唔計）
-- 只檢查用戶自己改（auth.uid() = 自己）；系統（例如刪除帳戶）改唔受影響
alter table public.aah_profiles add column if not exists nickname_changed_at timestamptz;

create or replace function public.aah__nickname_problem(p_name text)
 returns text
 language sql
 immutable
as $function$
  select case
    when p_name ~* '(啱啱好|官方|客服|管理員|管理员|系統|系统|admin|buytime|support)' then 'nickname reserved'
    when p_name ~ '([0-9０-９][\s-]?){6,}' then 'nickname has number'
    else null end;
$function$;

create or replace function public.aah__guard_nickname()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_problem text;
begin
  if auth.uid() is null or auth.uid() <> new.id then return new; end if;
  if tg_op = 'UPDATE' and new.nickname is not distinct from old.nickname then return new; end if;
  v_problem := public.aah__nickname_problem(new.nickname);
  if v_problem is not null then raise exception '%', v_problem; end if;
  if tg_op = 'UPDATE' then
    if old.nickname_changed_at is not null and old.nickname_changed_at > now() - interval '30 days' then
      raise exception 'nickname cooldown';
    end if;
    if exists (select 1 from aah_match_participants mp join aah_matches m on m.id = mp.match_id where mp.user_id = new.id and m.status = 'active')
       or exists (select 1 from aah_posts where author_id = new.id and status = 'open' and leave_at > now()) then
      raise exception 'nickname busy';
    end if;
    new.nickname_changed_at := now();
  end if;
  return new;
end $function$;

revoke all on function public.aah__guard_nickname() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_nickname' and tgrelid = 'public.aah_profiles'::regclass) then
    execute 'create trigger aah_guard_nickname before insert or update of nickname on public.aah_profiles for each row execute function public.aah__guard_nickname()';
  end if;
end $$;
