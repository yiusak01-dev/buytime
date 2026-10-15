
-- 啱啱好: isolated, permission-aware marketplace. NOT YET APPLIED.
-- Apply to a staging database first; does not alter legacy BuyTime tables.
begin;

create or replace function public.market_is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
 select exists(
   select 1 from public.user_roles
   where user_id = auth.uid()::text and role in ('admin','super_admin')
 );
$$;
revoke all on function public.market_is_admin() from public;
grant execute on function public.market_is_admin() to anon,authenticated;

create table if not exists public.market_mall_settings(
  mall_id int primary key references public.malls(id) on delete cascade,
  enabled boolean not null default false,
  allowed_categories text[] not null default array['group_buy','coupon']::text[],
  updated_at timestamptz not null default now(),
  constraint valid_market_categories check(
    allowed_categories <@ array['group_buy','coupon','parking','queue']::text[]
  )
);
alter table public.market_mall_settings enable row level security;
create policy market_mall_public_read on public.market_mall_settings
 for select to anon,authenticated using (true);
create policy market_mall_admin_write on public.market_mall_settings
 for all to authenticated using(public.market_is_admin()) with check(public.market_is_admin());

create table if not exists public.market_opportunities(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 mall_id int not null references public.malls(id),
 category text not null check(category in('group_buy','coupon','parking','queue')),
 intent text not null check(intent in('have','need')),
 title text not null check(char_length(trim(title)) between 5 and 100),
 merchant_name text not null default '' check(char_length(merchant_name)<=100),
 description text not null default '' check(char_length(description)<=1200),
 meetup_hint text not null default '' check(char_length(meetup_hint)<=120),
 issuer_transfer_permitted boolean not null default false,
 status text not null default 'active' check(status in('active','closed','hidden')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint allowed_transfer_check check(intent='need' or category='group_buy' or issuer_transfer_permitted)
);
create index if not exists market_opportunities_live on public.market_opportunities(mall_id,category,status,expires_at desc);
create index if not exists market_opportunities_owner on public.market_opportunities(owner_id,created_at desc);
alter table public.market_opportunities enable row level security;
create policy market_opportunities_read on public.market_opportunities
 for select to anon,authenticated using(
  (status='active' and expires_at>now()
    and exists(select 1 from public.market_mall_settings s where s.mall_id=market_opportunities.mall_id and s.enabled))
   or owner_id=auth.uid() or public.market_is_admin()
 );
create policy market_opportunities_insert on public.market_opportunities
 for insert to authenticated with check(
  owner_id=auth.uid() and status='active'
  and expires_at>now() and expires_at<=now()+interval '7 days'
  and exists(select 1 from public.market_mall_settings s
     where s.mall_id=market_opportunities.mall_id and s.enabled
       and market_opportunities.category=any(s.allowed_categories))
 );
create policy market_opportunities_owner_update on public.market_opportunities
 for update to authenticated
 using(owner_id=auth.uid() and status in('active','closed'))
 with check(owner_id=auth.uid() and status in('active','closed'));
create policy market_opportunities_admin_update on public.market_opportunities
 for update to authenticated using(public.market_is_admin()) with check(public.market_is_admin());

create table if not exists public.market_interests(
 id uuid primary key default gen_random_uuid(),
 opportunity_id uuid not null references public.market_opportunities(id) on delete cascade,
 requester_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'requested' check(status in('requested','accepted','declined','cancelled','completed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(opportunity_id,requester_id)
);
create index if not exists market_interests_requester on public.market_interests(requester_id,created_at desc);
create unique index if not exists market_only_one_accepted on public.market_interests(opportunity_id) where status='accepted';
alter table public.market_interests enable row level security;
create policy market_interests_read on public.market_interests
 for select to authenticated using(
  requester_id=auth.uid() or
  exists(select 1 from public.market_opportunities o where o.id=market_interests.opportunity_id and o.owner_id=auth.uid())
  or public.market_is_admin()
 );
create policy market_interests_insert on public.market_interests
 for insert to authenticated with check(
  requester_id=auth.uid() and status='requested' and
  exists(select 1 from public.market_opportunities o where o.id=market_interests.opportunity_id
    and o.status='active' and o.expires_at>now() and o.owner_id<>auth.uid())
 );

-- IMPORTANT: clients have no direct status UPDATE grants through RLS.
create or replace function public.market_transition_interest(p_interest_id uuid,p_target_status text)
returns public.market_interests
language plpgsql security definer set search_path = ''
as $$
declare v public.market_interests%rowtype; v_owner uuid;
begin
 if auth.uid() is null then raise exception 'Login required'; end if;
 select * into v from public.market_interests where id=p_interest_id for update;
 if not found then raise exception 'Request not found'; end if;
 select owner_id into v_owner from public.market_opportunities where id=v.opportunity_id;
 if not (
  (p_target_status='cancelled' and v.status in('requested','accepted') and v.requester_id=auth.uid())
  or (p_target_status in('accepted','declined') and v.status='requested' and v_owner=auth.uid())
  or (p_target_status='completed' and v.status='accepted' and auth.uid() in (v_owner,v.requester_id))
 ) then raise exception 'Action not allowed'; end if;
 update public.market_interests set status=p_target_status,updated_at=now()
  where id=p_interest_id returning * into v;
 return v;
end; $$;
revoke all on function public.market_transition_interest(uuid,text) from public;
grant execute on function public.market_transition_interest(uuid,text) to authenticated;

create table if not exists public.market_messages(
 id uuid primary key default gen_random_uuid(),
 interest_id uuid not null references public.market_interests(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index if not exists market_messages_interest on public.market_messages(interest_id,created_at);
alter table public.market_messages enable row level security;
create policy market_messages_read on public.market_messages
 for select to authenticated using(
  public.market_is_admin() or exists(
   select 1 from public.market_interests i join public.market_opportunities o on o.id=i.opportunity_id
   where i.id=market_messages.interest_id
     and (i.requester_id=auth.uid() or o.owner_id=auth.uid())
  ));
create policy market_messages_insert on public.market_messages
 for insert to authenticated with check(
  sender_id=auth.uid() and exists(
   select 1 from public.market_interests i join public.market_opportunities o on o.id=i.opportunity_id
   where i.id=market_messages.interest_id and i.status='accepted'
     and (i.requester_id=auth.uid() or o.owner_id=auth.uid())
  ));

create table if not exists public.market_reports(
 id uuid primary key default gen_random_uuid(),
 opportunity_id uuid not null references public.market_opportunities(id) on delete cascade,
 reporter_id uuid not null references auth.users(id) on delete cascade,
 reason text not null check(char_length(trim(reason)) between 5 and 500),
 status text not null default 'open' check(status in('open','reviewed','resolved')),
 created_at timestamptz not null default now(),
 unique(opportunity_id,reporter_id)
);
alter table public.market_reports enable row level security;
create policy market_reports_read on public.market_reports
 for select to authenticated using(reporter_id=auth.uid() or public.market_is_admin());
create policy market_reports_insert on public.market_reports
 for insert to authenticated with check(reporter_id=auth.uid() and status='open');
create policy market_reports_admin_update on public.market_reports
 for update to authenticated using(public.market_is_admin()) with check(public.market_is_admin());

create table if not exists public.market_ambassadors(
 user_id uuid primary key references auth.users(id) on delete cascade,
 assigned_mall_id integer references public.malls(id),
 display_label text not null default '' check(char_length(display_label)<=60),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.market_ambassadors enable row level security;
create policy market_ambassadors_read on public.market_ambassadors
 for select to authenticated using(user_id=auth.uid() or public.market_is_admin());
create policy market_ambassadors_admin on public.market_ambassadors
 for all to authenticated using(public.market_is_admin()) with check(public.market_is_admin());
commit;
