-- 新用戶建立 profile 時，只可以填自己嘅基本資料；
-- 完成次數、積分、置頂次數、停用等欄位只可以由伺服器函數改，唔可以喺註冊時自己填
revoke insert on public.aah_profiles from anon, authenticated;
grant insert (id, nickname, phone, default_pay_methods, notify_cats, notify_opportunities, notify_promotions)
  on public.aah_profiles to authenticated;
