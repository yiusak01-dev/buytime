-- 審批帳戶同真用戶完全分開：
-- - 置頂推送：示範／審批 post 唔推俾真用戶；真 post 唔推俾審批帳戶；封鎖咗作者嘅人唔收
-- - 置頂位：示範 post 同真 post 分開計
-- - 「附近有幾多人」：唔計審批帳戶
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.aah__push_pin_audience'::regproc);
  if position('new.review_only' in v_def) = 0 then
    v_def := replace(v_def,
      'if new.pinned_until is null or new.pinned_until <= now() then return null; end if;',
      'if new.pinned_until is null or new.pinned_until <= now() then return null; end if;
  if new.review_only then return null; end if;');
    v_def := replace(v_def,
      'and (p.banned_until is null or p.banned_until < now())',
      'and (p.banned_until is null or p.banned_until < now())
      and not p.review_tester
      and not public.aah__blocked_pair(new.author_id, pr.user_id)');
    if position('new.review_only' in v_def) = 0 or position('aah__blocked_pair' in v_def) = 0 then
      raise exception 'pin audience patch did not apply';
    end if;
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.aah_pin_post'::regproc);
  if position('review_only = p.review_only' in v_def) = 0 then
    v_def := replace(v_def,
      'where mall_id = p.mall_id and status = ''open'' and pinned_until > now() and id <> p.id;',
      'where mall_id = p.mall_id and status = ''open'' and pinned_until > now() and id <> p.id and review_only = p.review_only;');
    if position('review_only = p.review_only' in v_def) = 0 then
      raise exception 'pin slot patch did not apply';
    end if;
    execute v_def;
  end if;

  v_def := pg_get_functiondef('public.aah_mall_audience'::regproc);
  if position('review_tester' in v_def) = 0 then
    v_def := replace(v_def,
      'and (p_scenario is null or p_scenario = any (p.notify_cats))',
      'and (p_scenario is null or p_scenario = any (p.notify_cats))
    and not p.review_tester');
    if position('review_tester' in v_def) = 0 then
      raise exception 'audience patch did not apply';
    end if;
    execute v_def;
  end if;
end $$;
