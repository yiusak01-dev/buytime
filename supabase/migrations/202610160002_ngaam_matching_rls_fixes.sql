-- 啱啱好: participant visibility, blocking and one-time matching.
-- Staging-only until verified. Depends on 202610160001; leaves legacy tables untouched.
begin;
create or replace function public.market_can_see_opportunity(p_opportunity_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.market_interests
   where opportunity_id = p_opportunity_id and requester_id = auth.uid());
$$;
revoke all on function public.market_can_see_opportunity(uuid) from public;
-- Anonymous can call but always receives false (no auth.uid), needed by public listing RLS.
grant execute on function public.market_can_see_opportunity(uuid) to anon,authenticated;

create or replace function public.market_is_interest_participant(p_interest_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.market_interests i
   join public.market_opportunities o on o.id=i.opportunity_id
   where i.id=p_interest_id and (i.requester_id=auth.uid() or o.owner_id=auth.uid()));
$$;
revoke all on function public.market_is_interest_participant(uuid) from public;
grant execute on function public.market_is_interest_participant(uuid) to authenticated;

create or replace function public.market_users_have_blocked_each_other(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.blocks
   where (blocker_id=p_a and blocked_id=p_b) or (blocker_id=p_b and blocked_id=p_a));
$$;
revoke all on function public.market_users_have_blocked_each_other(uuid,uuid) from public;
grant execute on function public.market_users_have_blocked_each_other(uuid,uuid) to authenticated;

drop policy if exists market_opportunities_read on public.market_opportunities;
create policy market_opportunities_read on public.market_opportunities
 for select to anon,authenticated using(
   (status='active' and expires_at>now() and exists(
       select 1 from public.market_mall_settings s where s.mall_id=market_opportunities.mall_id and s.enabled))
   or owner_id=auth.uid() or public.market_can_see_opportunity(id) or public.market_is_admin());

-- Owners may close a listing, but may not reopen a completed match by directly updating status.
drop policy if exists market_opportunities_owner_update on public.market_opportunities;
create policy market_opportunities_owner_update on public.market_opportunities
 for update to authenticated using(owner_id=auth.uid() and status='active')
 with check(owner_id=auth.uid() and status='closed');

drop policy if exists market_messages_read on public.market_messages;
create policy market_messages_read on public.market_messages
 for select to authenticated using(public.market_is_admin() or public.market_is_interest_participant(interest_id));
drop policy if exists market_messages_insert on public.market_messages;
create policy market_messages_insert on public.market_messages
 for insert to authenticated with check(
   sender_id=auth.uid() and public.market_is_interest_participant(interest_id)
   and exists(select 1 from public.market_interests i
     where i.id=market_messages.interest_id and i.status='accepted'));

drop policy if exists market_interests_insert on public.market_interests;
create policy market_interests_insert on public.market_interests
 for insert to authenticated with check(
  requester_id=auth.uid() and status='requested'
  and exists(select 1 from public.market_opportunities o
    where o.id=market_interests.opportunity_id and o.status='active' and o.expires_at>now()
     and o.owner_id<>auth.uid()
     and not public.market_users_have_blocked_each_other(o.owner_id,auth.uid())));

create or replace function public.market_transition_interest(p_interest_id uuid,p_target_status text)
returns public.market_interests language plpgsql security definer set search_path = '' as $$
declare v public.market_interests%rowtype; v_owner uuid; v_active boolean;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select * into v from public.market_interests where id=p_interest_id for update;
 if not found then raise exception 'Request not found'; end if;
 select owner_id,(status='active' and expires_at>now()) into v_owner,v_active
   from public.market_opportunities where id=v.opportunity_id for update;
 if not (
   (p_target_status='cancelled' and v.status in('requested','accepted') and v.requester_id=auth.uid())
   or (p_target_status in('accepted','declined') and v.status='requested' and v_owner=auth.uid()
     and (p_target_status='declined' or v_active))
   or (p_target_status='completed' and v.status='accepted' and auth.uid() in(v_owner,v.requester_id))
 ) then raise exception 'Action not allowed'; end if;
 if p_target_status='accepted' and public.market_users_have_blocked_each_other(v_owner,v.requester_id)
  then raise exception 'Participants blocked'; end if;
 update public.market_interests set status=p_target_status,updated_at=now()
   where id=p_interest_id returning * into v;
 if p_target_status='accepted' then
   update public.market_opportunities set status='closed',updated_at=now()
   where id=v.opportunity_id;
 end if;
 return v;
end; $$;
revoke all on function public.market_transition_interest(uuid,text) from public;
grant execute on function public.market_transition_interest(uuid,text) to authenticated;
commit;