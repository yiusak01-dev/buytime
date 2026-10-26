-- 前期唔顯示積分：系統訊息同推送唔再提「積分」「補償 20 分」（後台照樣計分，日後可以再開）
do $$
declare
  r record;
  d text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('aah__complete_match', 'aah__push_on_appeal', 'aah__push_on_match_status', 'aah_cancel_match')
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, '完成！積分已經入咗帳。', '完成！多謝你哋互相幫忙。');
    d := replace(d, '已經撤銷冇出現，帳戶同積分已經恢復', '已經撤銷冇出現，帳戶已經恢復');
    d := replace(d, '你已經到咗：已記錄對方臨時取消，補償咗你 20 分', '你已經到咗：已記錄對方臨時取消');
    d := replace(d, '・積分已經入咗帳', '・多謝你幫人');
    d := replace(d, '記一次臨時取消。已經到咗嘅人補償 20 分。', '記一次臨時取消。');
    execute d;
  end loop;
end $$;
