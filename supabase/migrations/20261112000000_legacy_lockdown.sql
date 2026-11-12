-- 舊版「買時間」留低嘅資料表：新版（aah_*）已經唔用，但權限開得太闊。
-- 1. public.users 有 email 同電話，之前任何登入咗嘅人都讀到晒 → 只可以讀自己嗰行（users_own_all 已經有）
-- 2. messages：任何登入咗嘅人都讀／改到晒 → 只留返「交易雙方」嗰啲 policy
-- 3. disputes / ratings：任何登入咗嘅人都改到 → disputes 只限管理員，ratings 唔俾改
-- 4. 舊 view 用擁有人權限讀資料（繞過 RLS）→ 改用查詢者權限，並收返公開權限

drop policy if exists users_authenticated_select on public.users;

drop policy if exists messages_read on public.messages;
drop policy if exists messages_update on public.messages;

drop policy if exists disputes_update on public.disputes;
create policy disputes_admin_update on public.disputes for update to authenticated
  using (public.has_role((auth.uid())::text, 'admin') or public.has_role((auth.uid())::text, 'super_admin'))
  with check (public.has_role((auth.uid())::text, 'admin') or public.has_role((auth.uid())::text, 'super_admin'));

drop policy if exists ratings_update on public.ratings;

alter view public.v_active_listings set (security_invoker = true);
revoke all on public.v_active_listings from anon, authenticated;
grant select on public.v_active_listings to authenticated;

do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v_malls_active_rules') then
    execute 'alter view public.v_malls_active_rules set (security_invoker = true)';
    execute 'revoke insert, update, delete, truncate, references, trigger on public.v_malls_active_rules from anon, authenticated';
  end if;
end $$;
