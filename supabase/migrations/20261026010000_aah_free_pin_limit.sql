-- 免費置頂期間：每人每日（香港時間）最多 3 次，防止有人不停置頂推送打擾附近用家
create or replace function public.aah_pin_post(p_post uuid, p_use_credit boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  p aah_posts%rowtype;
  used int;
  v_until timestamptz;
  v_today int;
begin
  select * into p from aah_posts where id = p_post for update;
  if p.author_id <> auth.uid() then raise exception 'not author'; end if;
  if p.status <> 'open' or p.leave_at < now() then raise exception 'post closed'; end if;
  if exists (select 1 from aah_profiles where id = auth.uid() and banned_until > now()) then raise exception 'banned'; end if;
  select count(*) into used from aah_posts where mall_id = p.mall_id and status = 'open' and pinned_until > now() and id <> p.id;
  if used >= 10 then raise exception 'pin slots full'; end if;

  if p_use_credit then
    update aah_profiles set pin_credits = pin_credits - 1 where id = auth.uid() and pin_credits > 0;
    if not found then raise exception 'no pin credits'; end if;
  elsif not public.aah_setting('free_pin_trial') then
    raise exception 'payment required';   -- 正式收費：由 Google Play / App Store 付款 webhook 寫入
  else
    select count(*) into v_today from aah_pins
    where user_id = auth.uid() and paid_with = 'store' and store_txn_id = 'trial'
      and started_at >= date_trunc('day', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
    if v_today >= 3 then raise exception 'free pin daily limit'; end if;
  end if;

  v_until := least(greatest(coalesce(p.pinned_until, now()), now()) + interval '15 minutes', p.leave_at);
  update aah_posts set pinned_until = v_until where id = p.id;
  insert into aah_pins (post_id, user_id, paid_with, store_txn_id, ends_at)
  values (p.id, auth.uid(), case when p_use_credit then 'credit' else 'store' end, case when p_use_credit then null else 'trial' end, v_until);
  return v_until;
end $$;
