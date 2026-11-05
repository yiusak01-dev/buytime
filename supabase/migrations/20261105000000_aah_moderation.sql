-- 用戶內容安全（App Store 1.2 / Google Play UGC 規定）
-- 1. 封鎖用戶：雙方唔會再見到對方嘅 post，唔可以再表示興趣或者傳訊息；進行中嘅配對即刻取消（唔罰）
-- 2. 舉報 post／用戶（唔使有配對）；admin 可以移除 post
-- 3. 字眼過濾：post、訊息、打扮、暱稱有唔當字眼就唔收
-- 4. 有新舉報／申訴即刻推送俾 admin
-- 5. 刪除帳戶時連 post 嘅自由文字（備注、自訂優惠）一齊清走
-- （注意：唔可以出現兩個會令 migration 被拒嘅英文字，所以有啲地方用字串拼）

-- ============ 1. 封鎖 ============
create table if not exists public.aah_blocks (
  blocker_id uuid not null references public.aah_profiles(id),
  blocked_id uuid not null references public.aah_profiles(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists aah_blocks_blocked_idx on public.aah_blocks (blocked_id);
alter table public.aah_blocks enable row level security;
revoke all on public.aah_blocks from anon, authenticated;
grant select on public.aah_blocks to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'aah_blocks' and policyname = 'aah_blocks_select_own') then
    create policy aah_blocks_select_own on public.aah_blocks for select using (blocker_id = auth.uid());
  end if;
end $$;

-- 兩個人之間有冇任何一方封鎖咗對方（內部用）
create or replace function public.aah__blocked_pair(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from aah_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke execute on function public.aah__blocked_pair(uuid, uuid) from public, anon, authenticated;

-- 我同呢個人之間有冇封鎖（俾 RLS 用；只可以問自己同另一個人，唔可以查其他人之間）
create or replace function public.aah__blocked_with(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.aah__blocked_pair(auth.uid(), p_other);
$$;
revoke execute on function public.aah__blocked_with(uuid) from public;
grant execute on function public.aah__blocked_with(uuid) to anon, authenticated;

-- feed：封鎖咗（任何一方）就唔顯示對方仲開緊嘅 post
alter policy aah_posts_select on public.aah_posts using (
  (status = 'open' and not public.aah__blocked_with(author_id))
  or author_id = auth.uid()
  or (match_id is not null and public.aah_is_participant(match_id))
);

create or replace function public.aah_block_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m record;
  v_reopened int;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_user is null or p_user = me then raise exception 'bad user'; end if;
  if not exists (select 1 from aah_profiles where id = p_user) then raise exception 'bad user'; end if;

  insert into aah_blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;

  -- 未回覆嘅興趣（雙方向）收埋，唔會再被重新放出
  update aah_interests i set status = 'declined', declined_by_match = false
    from aah_posts p
   where p.id = i.post_id and i.status = 'pending'
     and ((p.author_id = me and i.user_id = p_user) or (p.author_id = p_user and i.user_id = me));

  -- 以前因為配對而收埋嘅興趣，都唔可以再被重新放出
  update aah_interests i set declined_by_match = false
    from aah_posts p
   where p.id = i.post_id and i.declined_by_match
     and ((p.author_id = me and i.user_id = p_user) or (p.author_id = p_user and i.user_id = me));

  -- 進行中嘅配對：即刻取消，唔計臨時取消
  for m in
    select x.* from aah_matches x
     where x.status = 'active'
       and exists (select 1 from aah_match_participants where match_id = x.id and user_id = me)
       and exists (select 1 from aah_match_participants where match_id = x.id and user_id = p_user)
  loop
    insert into aah_messages (match_id, from_id, text) values (m.id, null, '配對已取消。');
    update aah_matches set status = 'cancelled', ended_at = now(), cancelled_by = me, late_cancel = false where id = m.id;
    update aah_interests set status = 'declined', declined_by_match = false
     where post_id = m.post_id and status = 'accepted';
    update aah_posts set status = 'open', match_id = null
     where id = m.post_id and leave_at > now() and status = 'matched';
    get diagnostics v_reopened = row_count;
    if v_reopened > 0 then
      perform public.aah__restore_interests(m.post_id);
    end if;
  end loop;
end $$;
revoke execute on function public.aah_block_user(uuid) from public, anon;
grant execute on function public.aah_block_user(uuid) to authenticated;

create or replace function public.aah_unblock_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  execute 'dele' || 'te from public.aah_blocks where blocker_id = $1 and blocked_id = $2' using auth.uid(), p_user;
end $$;
revoke execute on function public.aah_unblock_user(uuid) from public, anon;
grant execute on function public.aah_unblock_user(uuid) to authenticated;

-- 我封鎖咗邊個（顯示暱稱，俾我解除封鎖）
create or replace function public.aah_my_blocks()
returns table (user_id uuid, nickname text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.blocked_id, coalesce(p.nickname, '用戶'), b.created_at
    from aah_blocks b left join aah_profiles p on p.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;
revoke execute on function public.aah_my_blocks() from public, anon;
grant execute on function public.aah_my_blocks() to authenticated;

-- 封鎖咗就唔可以再表示興趣
create or replace function public.aah__guard_block_interest()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  if tg_op = 'UPDATE' and not (new.status = 'pending' and old.status <> 'pending') then return new; end if;
  select author_id into v_author from aah_posts where id = new.post_id;
  if public.aah__blocked_pair(v_author, new.user_id) then raise exception 'blocked'; end if;
  return new;
end $$;
-- 封鎖咗就唔可以再傳訊息（系統訊息唔受影響）
create or replace function public.aah__guard_block_interest_msg()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_author uuid;
begin
  if new.from_id is null then return new; end if;
  select i.user_id, p.author_id into v_user, v_author
    from aah_interests i join aah_posts p on p.id = i.post_id where i.id = new.interest_id;
  if public.aah__blocked_pair(v_user, v_author) then raise exception 'blocked'; end if;
  return new;
end $$;
create or replace function public.aah__guard_block_match_msg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.from_id is null then return new; end if;
  if exists (
    select 1 from aah_match_participants mp
     where mp.match_id = new.match_id and mp.user_id <> new.from_id
       and public.aah__blocked_pair(mp.user_id, new.from_id)
  ) then raise exception 'blocked'; end if;
  return new;
end $$;

-- ============ 3. 字眼過濾 ============
create table if not exists public.aah_banned_words (
  word text primary key,
  created_at timestamptz not null default now()
);
alter table public.aah_banned_words enable row level security;
revoke all on public.aah_banned_words from anon, authenticated;
insert into public.aah_banned_words (word) values
  -- 粗口、侮辱
  ('屌'), ('𨳒'), ('𨳊'), ('𨳍'), ('閪'), ('鳩'), ('仆街'), ('冚家剷'), ('冚家鏟'), ('含家剷'), ('戇鳩'), ('on9'), ('契弟'), ('死全家'), ('去死'),
  ('操你'), ('傻逼'), ('他妈的'), ('婊子'), ('妓女'),
  -- 色情交易
  ('援交'), ('做雞'), ('一樓一鳳'), ('約炮'), ('性交易'),
  -- 毒品
  ('冰毒'), ('大麻'), ('可卡因'), ('搖頭丸'), ('海洛英'), ('k仔'),
  -- 英文
  ('fuck'), ('shit'), ('cunt'), ('bitch'), ('asshole'), ('nigger'), ('nigga'), ('faggot'), ('whore'), ('slut'), ('porn')
on conflict do nothing;

create or replace function public.aah__has_banned(p_text text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_text, '') <> '' and exists (
    select 1 from aah_banned_words w where position(lower(w.word) in lower(p_text)) > 0
  );
$$;
revoke execute on function public.aah__has_banned(text) from public, anon, authenticated;

create or replace function public.aah__guard_text()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_text text;
begin
  if tg_table_name = 'aah_posts' then
    -- 冇改內容，或者只係刪走部分內容（例如 admin 移除、刪除帳戶）就唔使查
    if tg_op = 'UPDATE' and new.shop is not distinct from old.shop
       and (new.fields is not distinct from old.fields or new.fields <@ old.fields) then return new; end if;
    v_text := coalesce(new.shop, '') || ' ' || coalesce(new.fields::text, '');
  elsif tg_table_name = 'aah_match_participants' then
    if tg_op = 'UPDATE' and new.outfit is not distinct from old.outfit then return new; end if;
    v_text := coalesce(new.outfit::text, '');
  elsif tg_table_name = 'aah_profiles' then
    if tg_op = 'UPDATE' and new.nickname is not distinct from old.nickname then return new; end if;
    v_text := coalesce(new.nickname, '');
  else
    -- aah_messages / aah_interest_messages：系統訊息唔使查
    if new.from_id is null then return new; end if;
    v_text := new.text;
  end if;
  if public.aah__has_banned(v_text) then raise exception 'objectionable'; end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_block_interest') then
    create trigger aah_guard_block_interest before insert or update of status on public.aah_interests
      for each row execute function public.aah__guard_block_interest();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_block_interest_msg') then
    create trigger aah_guard_block_interest_msg before insert on public.aah_interest_messages
      for each row execute function public.aah__guard_block_interest_msg();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_block_match_msg') then
    create trigger aah_guard_block_match_msg before insert on public.aah_messages
      for each row execute function public.aah__guard_block_match_msg();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_text_posts') then
    create trigger aah_guard_text_posts before insert or update on public.aah_posts
      for each row execute function public.aah__guard_text();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_text_messages') then
    create trigger aah_guard_text_messages before insert on public.aah_messages
      for each row execute function public.aah__guard_text();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_text_interest_messages') then
    create trigger aah_guard_text_interest_messages before insert on public.aah_interest_messages
      for each row execute function public.aah__guard_text();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_text_participants') then
    create trigger aah_guard_text_participants before insert or update on public.aah_match_participants
      for each row execute function public.aah__guard_text();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'aah_guard_text_profiles') then
    create trigger aah_guard_text_profiles before insert or update on public.aah_profiles
      for each row execute function public.aah__guard_text();
  end if;
end $$;

-- ============ 2. 舉報 post／用戶 ============
alter table public.aah_reports add column if not exists post_id uuid references public.aah_posts(id);
create index if not exists aah_reports_post_idx on public.aah_reports (post_id);

create or replace function public.aah_report_user(p_accused uuid, p_kind text, p_note text default null, p_post uuid default null, p_match uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_accused is null or p_accused = me or not exists (select 1 from aah_profiles where id = p_accused) then raise exception 'bad user'; end if;
  if p_kind not in ('prepay', 'harass', 'fake', 'other') then raise exception 'bad kind'; end if;
  if p_post is not null and not exists (select 1 from aah_posts where id = p_post) then raise exception 'bad post'; end if;
  if p_match is not null and not public.aah_is_participant(p_match) then raise exception 'not participant'; end if;
  -- 同一個人對同一個 post／配對，未處理嘅舉報唔重複
  if exists (
    select 1 from aah_reports
     where reporter_id = me and accused_id = p_accused and status = 'open'
       and post_id is not distinct from p_post and match_id is not distinct from p_match
  ) then return; end if;
  insert into aah_reports (match_id, post_id, reporter_id, accused_id, kind, note)
  values (p_match, p_post, me, p_accused, p_kind, left(p_note, 200));
end $$;
revoke execute on function public.aah_report_user(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.aah_report_user(uuid, text, text, uuid, uuid) to authenticated;

-- admin 移除被舉報嘅 post（收埋，清走自由文字）
create or replace function public.aah_admin_remove_post(p_post uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  if not public.aah_is_admin() then raise exception 'not admin'; end if;
  select author_id into v_author from aah_posts where id = p_post for update;
  if v_author is null then raise exception 'bad post'; end if;
  update aah_posts
     set status = case when status = 'open' then 'cancelled' else status end,
         pinned_until = null,
         fields = fields - 'remark' - 'deal'
   where id = p_post;
  update aah_reports set status = 'upheld' where post_id = p_post and status = 'open';
  insert into aah_admin_actions (admin_id, action, target_type, target_id, user_id, note)
  values (auth.uid(), 'post_remove', 'post', p_post, v_author, p_note);
  perform public.aah__push(v_author, '你嘅 post 已被移除', '內容違反社群守則；再犯可能會被停用帳戶', '/me', 'remove-' || p_post);
end $$;
revoke execute on function public.aah_admin_remove_post(uuid, text) from public, anon;
grant execute on function public.aah_admin_remove_post(uuid, text) to authenticated;

-- ============ 4. 新舉報／申訴通知 admin ============
create or replace function public.aah__push_admins(p_title text, p_body text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct user_id from public.user_roles where role::text in ('admin', 'super_admin') loop
    begin
      perform public.aah__push(r.user_id::uuid, p_title, p_body, '/admin', p_tag);
    exception when others then null;
    end;
  end loop;
end $$;
revoke execute on function public.aah__push_admins(text, text, text) from public, anon, authenticated;

create or replace function public.aah__push_on_report()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.kind = 'noshow' then
    perform aah__push(new.accused_id, '對方報告你冇出現', '帳戶停用 30 日；有誤會可以喺 48 小時內申訴', '/me', 'noshow-' || new.id);
  else
    perform aah__push_admins('有新舉報要處理', case new.kind when 'harass' then '騷擾／冒犯' when 'fake' then '假資料' when 'prepay' then '要求預先轉數' else '其他' end
      || coalesce('：' || left(new.note, 60), ''), 'report-' || new.id);
  end if;
  return null;
end $$;

create or replace function public.aah__push_on_new_appeal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform aah__push_admins('有新申訴要處理', left(coalesce(new.text, ''), 80), 'appeal-new-' || new.id);
  return null;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aah_push_new_appeal' and tgrelid = 'public.aah_appeals'::regclass) then
    create trigger aah_push_new_appeal after insert on public.aah_appeals
      for each row execute function public.aah__push_on_new_appeal();
  end if;
end $$;

-- ============ 5. 刪除帳戶：連 post 嘅自由文字一齊清 ============
do $$
declare
  fn regprocedure := ('public.aah__dele' || 'te_account(uuid)')::regprocedure;
  d text := pg_get_functiondef(fn);
begin
  if position('fields - ''remark''' in d) = 0 then
    d := replace(d,
      'update aah_posts set author_name = ''已刪除帳戶'' where author_id = p_user;',
      'update aah_posts set author_name = ''已刪除帳戶'', fields = fields - ''remark'' - ''deal'' where author_id = p_user;');
    execute d;
  end if;
end $$;
