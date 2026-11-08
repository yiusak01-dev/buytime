-- 新加嘅內部 function 唔使俾 app 直接叫（只喺 trigger 同其他 function 入面用）
revoke execute on function public.aah__guard_price() from public, anon, authenticated;
revoke execute on function public.aah__log_ban() from public, anon, authenticated;
revoke execute on function public.aah__check_setting() from public, anon, authenticated;
revoke execute on function public.aah__price_cap(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.aah_num_setting(text) from public, anon, authenticated;
