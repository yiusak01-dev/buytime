-- 未登入（anon）睇 feed：post 嘅 RLS 有用到 aah__gps_exempt()，要俾 anon 行（冇 uid 就係 false）
grant execute on function public.aah__gps_exempt() to anon;
