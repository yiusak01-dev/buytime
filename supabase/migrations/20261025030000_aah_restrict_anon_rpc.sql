-- 要登入先用得嘅 function：唔俾未登入（anon）調用
-- （aah_is_participant / aah_is_admin / aah_setting / aah_mall_audience / aah_view_post 保留俾 anon，因為 RLS 同未登入瀏覽要用）
revoke execute on function public.aah_accept_interest(uuid, int) from public, anon;
revoke execute on function public.aah_admin_decide_appeal(uuid, boolean, text) from public, anon;
revoke execute on function public.aah_admin_decide_report(uuid, text, text) from public, anon;
revoke execute on function public.aah_admin_decide_voucher(uuid, boolean, text) from public, anon;
revoke execute on function public.aah_cancel_match(uuid, text) from public, anon;
revoke execute on function public.aah_change_meet(uuid, text, timestamptz) from public, anon;
revoke execute on function public.aah_confirm_meet(uuid) from public, anon;
revoke execute on function public.aah_confirm_partner_met(uuid, uuid) from public, anon;
revoke execute on function public.aah_create_post(jsonb) from public, anon;
revoke execute on function public.aah_decline_interest(uuid) from public, anon;
revoke execute on function public.aah_express_interest(uuid, text, int) from public, anon;
revoke execute on function public.aah_mark_arrived(uuid, double precision, double precision) from public, anon;
revoke execute on function public.aah_pin_post(uuid, boolean) from public, anon;
revoke execute on function public.aah_redeem_pin() from public, anon;
revoke execute on function public.aah_report_no_show(uuid, uuid) from public, anon;
revoke execute on function public.aah_request_voucher() from public, anon;
revoke execute on function public.aah_submit_appeal(text) from public, anon;
revoke execute on function public.aah_touch_presence(text) from public, anon;
revoke execute on function public.aah_not_banned() from public, anon;
