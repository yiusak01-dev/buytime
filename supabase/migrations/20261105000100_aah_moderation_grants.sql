-- 觸發器用嘅 function 唔應該俾人經 API 直接叫
revoke execute on function public.aah__guard_block_interest() from public, anon, authenticated;
revoke execute on function public.aah__guard_block_interest_msg() from public, anon, authenticated;
revoke execute on function public.aah__guard_block_match_msg() from public, anon, authenticated;
revoke execute on function public.aah__guard_text() from public, anon, authenticated;
revoke execute on function public.aah__push_on_new_appeal() from public, anon, authenticated;
alter function public.aah__nickname_problem(text) set search_path = public;
