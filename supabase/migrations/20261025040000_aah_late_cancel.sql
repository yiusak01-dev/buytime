-- 啱啱好：臨時取消規則
-- 「臨時取消」= 對方已經撳咗「我到咗」，自己未到就取消。
--   * 扣取消人 30 分（唔夠就扣到 0）
--   * 已經到咗嘅人每人補償 20 分
--   * 30 日內第二次臨時取消 → 當冇出現處理，停用一個月（可以喺 48 小時內申訴）
--   * 出 post 嘅人臨時取消，post 唔再重新開放（避免轉頭賣俾第二個）
-- 對方未到、或者自己都已經到咗先取消，唔罰。

alter table public.aah_matches add column if not exists cancelled_by uuid;
alter table public.aah_matches add column if not exists late_cancel boolean not null default false;

create or replace function public.aah_cancel_match(p_match uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m aah_matches%rowtype;
  v_me_arrived timestamptz;
  v_name text;
  v_late boolean;
  v_ded int;
  v_count int;
  r record;
begin
  select * into m from aah_matches where id = p_match for update;
  if not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;

  select arrived_at, display_name into v_me_arrived, v_name
    from aah_match_participants where match_id = p_match and user_id = auth.uid();
  v_late := v_me_arrived is null and exists (
    select 1 from aah_match_participants where match_id = p_match and user_id <> auth.uid() and arrived_at is not null
  );

  update aah_matches set status = 'cancelled', ended_at = now(), cancelled_by = auth.uid(), late_cancel = v_late where id = p_match;
  insert into aah_messages (match_id, from_id, text) values (p_match, auth.uid(), left(p_reason, 80));

  if v_late then
    select least(30, points) into v_ded from aah_profiles where id = auth.uid();
    update aah_profiles set points = points - v_ded where id = auth.uid();
    insert into aah_point_ledger (user_id, match_id, pts, reason) values (auth.uid(), p_match, -v_ded, 'late_cancel');

    for r in select user_id from aah_match_participants where match_id = p_match and user_id <> auth.uid() and arrived_at is not null loop
      update aah_profiles set points = points + 20 where id = r.user_id;
      insert into aah_point_ledger (user_id, partner_id, match_id, pts, reason) values (r.user_id, auth.uid(), p_match, 20, 'late_cancel_comp');
    end loop;

    insert into aah_messages (match_id, from_id, text)
      values (p_match, null, coalesce(v_name, '對方') || ' 喺對方到咗之後取消，記一次臨時取消。已經到咗嘅人補償 20 分。');

    select count(*) into v_count from aah_point_ledger
      where user_id = auth.uid() and reason = 'late_cancel' and created_at > now() - interval '30 days';
    if v_count >= 2 then
      update aah_profiles set banned_until = greatest(coalesce(banned_until, now()), now()) + interval '30 days', no_shows = no_shows + 1
        where id = auth.uid();
      -- 開一張冇出現紀錄，等佢可以用現有申訴流程
      insert into aah_reports (match_id, reporter_id, accused_id, kind, note)
        select p_match, user_id, auth.uid(), 'noshow', '30 日內第二次臨時取消（系統自動停用）'
        from aah_match_participants where match_id = p_match and user_id <> auth.uid() and arrived_at is not null limit 1;
      insert into aah_messages (match_id, from_id, text)
        values (p_match, null, coalesce(v_name, '對方') || ' 30 日內第二次臨時取消，帳戶停用一個月。');
    end if;

    if m.author_id = auth.uid() then
      update aah_posts set status = 'cancelled', match_id = null, pinned_until = null where id = m.post_id;
    else
      update aah_posts set status = 'open', match_id = null where id = m.post_id and leave_at > now() and status = 'matched';
    end if;
  else
    insert into aah_messages (match_id, from_id, text) values (p_match, null, '配對已取消。對方未到之前取消唔會被罰。');
    update aah_posts set status = 'open', match_id = null where id = m.post_id and leave_at > now() and status = 'matched';
  end if;

  update aah_interests set status = 'declined' where post_id = m.post_id and status = 'accepted';
end $$;

revoke execute on function public.aah_cancel_match(uuid, text) from public, anon;
grant execute on function public.aah_cancel_match(uuid, text) to authenticated;
