-- 安全修補（舊版 買時間 留低嘅漏洞 + Supabase advisor 報告）

-- 1. push_subscriptions：之前冇開 RLS，任何人（未登入都得）睇到同改到所有人嘅推送地址
alter table public.push_subscriptions enable row level security;
-- 「所有人睇晒」呢條規則改成冇人睇到（伺服器用 service role 讀，唔受 RLS 影響）
alter policy push_read_all on public.push_subscriptions using (false);

-- 2. price_alerts：policy 已經係「只睇自己」，但 RLS 冇開
alter table public.price_alerts enable row level security;

-- 3. notifications：「任何人都可以新增」→ 只可以由伺服器（service role）新增
alter policy "anyone can insert notifications" on public.notifications with check (false);

-- 4. admin_get_report_context：之前冇檢查 admin，任何人都讀到交易對話
create or replace function public.admin_get_report_context(p_transaction_id uuid)
returns table(sender_name text, content text, created_at timestamp with time zone, msg_type text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (has_role(auth.uid()::text, 'admin') or has_role(auth.uid()::text, 'super_admin')) then
    raise exception 'Unauthorized';
  end if;
  return query
    select m.sender_name, m.content, m.created_at, m.type as msg_type
    from public.messages m
    where m.transaction_id = p_transaction_id
    order by m.created_at desc
    limit 50;
end;
$function$;

-- 5. 舊 admin function：未登入唔可以 call（function 預設 grant 俾 PUBLIC，要一齊收返）
revoke execute on function public.admin_ban_user(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_get_report_context(uuid) from public, anon;
revoke execute on function public.admin_search_users(text) from public, anon;
revoke execute on function public.admin_warn_user(uuid) from public, anon;
grant execute on function public.admin_ban_user(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.admin_get_report_context(uuid) to authenticated, service_role;
grant execute on function public.admin_search_users(text) to authenticated, service_role;
grant execute on function public.admin_warn_user(uuid) to authenticated, service_role;

-- trigger function 唔應該經 API call（trigger 觸發時唔檢查 EXECUTE 權限，收返唔影響 trigger）
revoke execute on function public.fn_award_referral_discounts() from public, anon, authenticated;
revoke execute on function public.handle_discount_decrement() from public, anon, authenticated;
revoke execute on function public.handle_referral_reward() from public, anon, authenticated;

-- 6. 固定 search_path，防止被人換 schema 騎劫
alter function public.refresh_user_rating() set search_path = public;
alter function public.update_updated_at() set search_path = public;
alter function public.set_listing_expiry() set search_path = public;
alter function public.handle_discount_decrement() set search_path = public;
alter function public.handle_referral_reward() set search_path = public;
alter function public.fn_award_referral_discounts() set search_path = public;

-- 7. profiles view：之前用建立者權限，未登入都睇到所有舊用戶名；改為跟用戶自己權限
alter view public.profiles set (security_invoker = on);

-- 8. 商場泊車規則係公開資料：補返公開讀取，然後 view 改為跟用戶權限
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mall_b_details' and policyname = 'mall_b_details_public_read') then
    create policy mall_b_details_public_read on public.mall_b_details for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mall_c_details' and policyname = 'mall_c_details_public_read') then
    create policy mall_c_details_public_read on public.mall_c_details for select using (true);
  end if;
end $$;
alter view public.v_malls_active_rules set (security_invoker = on);
