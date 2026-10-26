-- 取消禮券：app 唔再提供換禮券，關閉申請功能（資料表保留作紀錄）
revoke execute on function public.aah_request_voucher() from public, anon, authenticated;
