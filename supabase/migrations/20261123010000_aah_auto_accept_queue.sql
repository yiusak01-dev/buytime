-- 1) 自動配對：只自動接受「照原價」嘅人；出低價嘅留返俾放單嘅人自己決定
do $$
declare d text;
begin
  d := pg_get_functiondef('public.aah_express_interest_v2(uuid,text,integer,integer,double precision,double precision,boolean)'::regprocedure);
  if position('p_offer >= p.price' in d) = 0 then
    d := replace(d, 'if is_new and p.auto_accept and not v_en_route then',
                    'if is_new and p.auto_accept and not v_en_route and (p_offer is null or p.price is null or p_offer >= p.price) then');
    execute d;
  end if;
  d := pg_get_functiondef('public.aah_interest_on_site(uuid,double precision,double precision)'::regprocedure);
  if position('i.offer >= p.price' in d) = 0 then
    d := replace(d, 'if p.status = ''open'' and p.leave_at > now() and p.auto_accept then',
                    'if p.status = ''open'' and p.leave_at > now() and p.auto_accept and (i.offer is null or p.price is null or i.offer >= p.price) then');
    execute d;
  end if;
end $$;

-- 2) 放咗之後先開／閂自動配對；開嗰陣已經有人喺場等緊（照原價），即刻配對最早嗰個
create or replace function public.aah_set_auto_accept(p_post uuid, p_on boolean)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p aah_posts%rowtype;
  v_first uuid;
begin
  select * into p from aah_posts where id = p_post for update;
  if p.id is null or p.author_id is distinct from auth.uid() then raise exception 'not author'; end if;
  if p.status <> 'open' then raise exception 'post closed'; end if;
  update aah_posts set auto_accept = p_on where id = p_post;
  if not p_on then return null; end if;
  select i.id into v_first from aah_interests i
   where i.post_id = p_post and i.status = 'pending' and not coalesce(i.en_route, false)
     and (i.offer is null or p.price is null or i.offer >= p.price)
   order by i.created_at limit 1;
  if v_first is null then return null; end if;
  return public.aah__accept(v_first, null);
end $$;
revoke all on function public.aah_set_auto_accept(uuid, boolean) from public, anon;
grant execute on function public.aah_set_auto_accept(uuid, boolean) to authenticated;

-- 3) 等緊嘅人：排第幾（同放單嗰邊嘅次序一樣：喺場嘅按撳嘅先後，去緊嘅按幾時到）
create or replace function public.aah_queue_position(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  me aah_interests%rowtype;
  v_ahead int;
  v_total int;
begin
  select * into me from aah_interests where post_id = p_post and user_id = auth.uid() and status = 'pending';
  if me.id is null then return null; end if;
  select count(*) into v_total from aah_interests where post_id = p_post and status = 'pending';
  if not coalesce(me.en_route, false) then
    select count(*) into v_ahead from aah_interests
     where post_id = p_post and status = 'pending' and not coalesce(en_route, false) and created_at < me.created_at;
  else
    select count(*) into v_ahead from aah_interests
     where post_id = p_post and status = 'pending' and id <> me.id
       and (not coalesce(en_route, false) or coalesce(eta_at, 'infinity') < coalesce(me.eta_at, 'infinity'));
  end if;
  return jsonb_build_object('ahead', v_ahead, 'total', v_total);
end $$;
revoke all on function public.aah_queue_position(uuid) from public, anon;
grant execute on function public.aah_queue_position(uuid) to authenticated;
