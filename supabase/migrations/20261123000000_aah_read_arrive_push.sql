-- 已讀：配對對話（每個參與者自己嘅 read_at）＋配對前對話（買家／出 post 嘅人各一個）
alter table public.aah_match_participants add column if not exists read_at timestamptz;
alter table public.aah_interests add column if not exists buyer_read_at timestamptz;
alter table public.aah_interests add column if not exists author_read_at timestamptz;

create or replace function public.aah_mark_read(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then return; end if;
  if p_kind = 'match' then
    update aah_match_participants set read_at = now()
     where match_id = p_id and user_id = auth.uid()
       and (read_at is null or read_at < now() - interval '2 seconds');
  elsif p_kind = 'interest' then
    update aah_interests set buyer_read_at = now()
     where id = p_id and user_id = auth.uid()
       and (buyer_read_at is null or buyer_read_at < now() - interval '2 seconds');
    update aah_interests i set author_read_at = now()
      from aah_posts p
     where i.id = p_id and p.id = i.post_id and p.author_id = auth.uid()
       and (i.author_read_at is null or i.author_read_at < now() - interval '2 seconds');
  end if;
end $$;
revoke all on function public.aah_mark_read(text, uuid) from public, anon;
grant execute on function public.aah_mark_read(text, uuid) to authenticated;

-- 對方撳「我到咗」：推送通知其他人（之前淨係 app 開住先見到）
create or replace function public.aah__push_on_arrive()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m aah_matches%rowtype;
  r record;
begin
  if old.arrived_at is not null or new.arrived_at is null then return null; end if;
  select * into m from aah_matches where id = new.match_id;
  if m.status is distinct from 'active' then return null; end if;
  for r in select user_id from aah_match_participants where match_id = m.id and user_id <> new.user_id loop
    perform aah__push(r.user_id, coalesce(new.display_name, '對方') || ' 到咗見面地點', m.shop || '・' || m.mall_name || '：' || coalesce(m.meet_place, ''), '/match/' || m.id, 'match-' || m.id);
  end loop;
  return null;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_arrive' and tgrelid = 'public.aah_match_participants'::regclass) then
    create trigger aah_push_arrive after update of arrived_at on public.aah_match_participants
      for each row execute function public.aah__push_on_arrive();
  end if;
end $$;
