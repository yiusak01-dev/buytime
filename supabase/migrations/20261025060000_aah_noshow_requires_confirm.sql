-- 冇出現只罰「確認咗見面」嘅人：確認時先彈警告，未確認就唔應該被停用。
create or replace function public.aah_report_no_show(p_match uuid, p_accused uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m aah_matches%rowtype;
  me_arrived timestamptz;
  them_arrived timestamptz;
  them_confirmed timestamptz;
  v_ded int;
begin
  select * into m from aah_matches where id = p_match for update;
  if m.status <> 'active' or now() < m.meet_at then raise exception 'too early'; end if;
  select arrived_at into me_arrived from aah_match_participants where match_id = p_match and user_id = auth.uid();
  select arrived_at, confirmed_at into them_arrived, them_confirmed from aah_match_participants where match_id = p_match and user_id = p_accused;
  if me_arrived is null then raise exception 'reporter has not arrived'; end if;
  if them_arrived is not null then raise exception 'accused arrived'; end if;
  if them_confirmed is null then raise exception 'accused not confirmed'; end if;
  insert into aah_reports (match_id, reporter_id, accused_id, kind) values (p_match, auth.uid(), p_accused, 'noshow');
  update aah_matches set status = 'noshow', ended_at = now() where id = p_match;
  select least(50, points) into v_ded from aah_profiles where id = p_accused;
  update aah_profiles set no_shows = no_shows + 1, banned_until = now() + interval '30 days', points = points - v_ded
    where id = p_accused;
  insert into aah_point_ledger (user_id, match_id, pts, reason) values (p_accused, p_match, -v_ded, 'noshow');
end $function$;
