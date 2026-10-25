-- 刪除帳戶（App Store／Google Play 規定 app 入面要刪得到）
-- 由 edge function aah-delete-account 用 service role 調用：
--   1. 呢個 function：檢查冇進行中配對，收埋 post，將名同訊息內容變做「已刪除」，清空 profile 個人資料
--   2. edge function：清走推送裝置同位置紀錄，再軟刪除 auth 用戶（email 被清走、唔可以再登入）
-- 對方嘅配對同對話紀錄保留，但匿名。

create or replace function public.aah__delete_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or not exists (select 1 from aah_profiles where id = p_user) then
    return;  -- 未完成註冊（冇 profile）：冇 app 資料要匿名
  end if;

  if exists (
    select 1 from aah_match_participants mp join aah_matches m on m.id = mp.match_id
    where mp.user_id = p_user and m.status = 'active'
  ) then
    raise exception 'active match';
  end if;

  -- 收埋仲開緊嘅 post，同埋撤回自己未有回覆嘅興趣
  update aah_posts set status = 'cancelled' where author_id = p_user and status = 'open';
  update aah_interests set status = 'declined' where user_id = p_user and status = 'pending';

  -- 名同內容
  update aah_posts set author_name = '已刪除帳戶' where author_id = p_user;
  update aah_interests set display_name = '已刪除帳戶' where user_id = p_user;
  update aah_match_participants set display_name = '已刪除帳戶', outfit = null where user_id = p_user;
  update aah_messages set text = '（訊息已刪除）' where from_id = p_user;
  update aah_interest_messages set text = '（訊息已刪除）' where from_id = p_user;
  update aah_appeals set text = '（已刪除）' where user_id = p_user;
  update aah_voucher_requests set status = 'rejected' where user_id = p_user and status = 'pending';

  -- profile 留低一個冇個人資料嘅空殼，等對方嘅紀錄唔會斷
  update aah_profiles set
    nickname = '已刪除帳戶',
    phone = null,
    points = 0,
    pin_credits = 0,
    notify_cats = '{}',
    notify_opportunities = false,
    notify_promotions = false,
    default_pay_methods = '{}'
  where id = p_user;
end $$;

revoke execute on function public.aah__delete_account(uuid) from public, anon, authenticated;
grant execute on function public.aah__delete_account(uuid) to service_role;
