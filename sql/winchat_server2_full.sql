-- ============================================================
-- WinChat 7.0.1 - FULL SCHEMA FOR SERVER 2
-- Project: https://bjsjvozhkjktowqizidj.supabase.co
-- Run entirely in Dashboard -> SQL Editor -> New query -> Run
-- Server 2 accepts ~half of registrations, but every account is
-- mirrored to server 1, where ALL shared data lives: profiles,
-- chats, messages, OTA. Users of both servers see each other
-- and can be members of the same groups.
-- IMPORTANT: disable Confirm email in Auth -> Providers -> Email
-- Idempotent: safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- FILE: sql\winchat_setup.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat v2.0.4.12 — полная установка базы данных Supabase
--  Dashboard → SQL Editor → New query → вставить целиком → Run
-- ============================================================

-- 1. ПРОФИЛИ ----------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  nickname   text not null,
  avatar_url text,
  bio        text,                        -- описание «о себе»
  created_at timestamptz not null default now()
);

-- 2. ЧАТЫ (личные и группы) -------------------------------------
create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  direct_key  text unique,                -- "uuidA:uuidB" для личных чатов, NULL для групп
  is_group    boolean not null default false,
  title       text,                       -- название группы
  description text,                       -- описание группы
  avatar_url  text,                       -- обложка группы
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3. УЧАСТНИКИ ЧАТОВ --------------------------------------------
create table if not exists public.chat_members (
  chat_id   uuid not null references public.chats(id)    on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member',   -- 'owner' | 'member'
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

-- 4. СООБЩЕНИЯ (текст, фото, голосовые) -------------------------
create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  chat_id        uuid not null references public.chats(id)    on delete cascade,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  content        text,
  image_url      text,
  audio_url      text,      -- голосовое сообщение
  audio_duration integer,   -- длительность в секундах
  created_at     timestamptz not null default now()
);

create index if not exists messages_chat_idx       on public.messages(chat_id, created_at);
create index if not exists chat_members_user_idx   on public.chat_members(user_id);
create index if not exists profiles_username_idx   on public.profiles(username);

-- 5. ТРИГГЕР: профиль создаётся автоматически при регистрации --
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, nickname)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', 'user_' || left(new.id::text, 6))),
    coalesce(new.raw_user_meta_data ->> 'nickname', 'Пользователь')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. ТРИГГЕР: updated_at чата при новом сообщении ---------------
create or replace function public.touch_chat()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.touch_chat();

-- 7. ХЕЛПЕР: проверка членства в чате (обходит RLS, без рекурсии)
create or replace function public.is_chat_member(chat_uuid uuid)
returns boolean
language sql
security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where chat_id = chat_uuid and user_id = auth.uid()
  );
$$;

-- 8. ROW LEVEL SECURITY -----------------------------------------
alter table public.profiles     enable row level security;
alter table public.chats        enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages     enable row level security;

-- profiles: каталог пользователей читают все, менять можно только себя
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- chats: видны только участникам, создавать может любой авторизованный
drop policy if exists "chats_select" on public.chats;
create policy "chats_select" on public.chats
  for select using (public.is_chat_member(id));

drop policy if exists "chats_insert" on public.chats;
create policy "chats_insert" on public.chats
  for insert with check (auth.uid() is not null);

-- владелец группы редактирует название, описание и обложку
drop policy if exists "chats_update" on public.chats;
create policy "chats_update" on public.chats
  for update
  using (created_by = auth.uid() and is_group = true)
  with check (created_by = auth.uid() and is_group = true);

-- chat_members: участников видят участники, добавлять — себя или в свой чат
drop policy if exists "chat_members_select" on public.chat_members;
create policy "chat_members_select" on public.chat_members
  for select using (user_id = auth.uid() or public.is_chat_member(chat_id));

drop policy if exists "chat_members_insert" on public.chat_members;
create policy "chat_members_insert" on public.chat_members
  for insert with check (user_id = auth.uid() or public.is_chat_member(chat_id));

-- messages: читают и пишут только участники, удалять — только свои
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (public.is_chat_member(chat_id));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (sender_id = auth.uid() and public.is_chat_member(chat_id));

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete using (sender_id = auth.uid());

-- участник может покинуть чат (удалить свою запись)
drop policy if exists "chat_members_delete" on public.chat_members;
create policy "chat_members_delete" on public.chat_members
  for delete using (user_id = auth.uid());

-- чаты рассылают обновления (переименование группы и т.п.)
alter table public.chats replica identity full;

-- 9. REALTIME ----------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chats;
exception when duplicate_object then
  null;
end $$;

-- 10. STORAGE: бакеты avatars и attachments ----------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

-- avatars: читают все, пишут авторизованные, удалять — только свою папку
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update using (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- attachments: читают все, загружают авторизованные
drop policy if exists "attachments_read" on storage.objects;
create policy "attachments_read" on storage.objects
  for select using (bucket_id = 'attachments');

drop policy if exists "attachments_insert" on storage.objects;
create policy "attachments_insert" on storage.objects
  for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

-- ============================================================
--  ВАЖНО после выполнения:
--  Authentication → Sign In / Providers → Email →
--  выключите «Confirm email» (используются синтетические адреса
--  вида username@winchat.app), Save. Готово — можно входить.
-- ============================================================


-- ------------------------------------------------------------
-- FILE: sql\winchat_winpro.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 8 — WinPro (премиум-подписка)
--  /give wintozopro @username X days
--  /delete wintozopro @username
-- ============================================================

-- 1. Колонка winpro_until
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS winpro_until timestamptz;

-- 2. RPC: выдать WinPro
drop function if exists public.give_winpro(uuid, text, int);
create or replace function public.give_winpro(
  _admin_id uuid,
  _target_username text,
  _days int
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _target_id uuid;
  _target_nickname text;
  _new_until timestamptz;
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select id, nickname into _target_id, _target_nickname
  from public.profiles where username = _target_username;

  if _target_id is null then
    return jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  end if;

  select coalesce(winpro_until, now()) + make_interval(days => _days) into _new_until
  from public.profiles where id = _target_id;

  update public.profiles
  set winpro_until = _new_until
  where id = _target_id;

  return jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'expires', _new_until,
    'message', 'WinPro выдан на ' || _days || ' дн. до ' || to_char(_new_until, 'DD.MM.YYYY')
  );
end;
$$;

-- 3. RPC: удалить WinPro
drop function if exists public.delete_winpro(uuid, text);
create or replace function public.delete_winpro(
  _admin_id uuid,
  _target_username text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _target_id uuid;
  _target_nickname text;
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select id, nickname into _target_id, _target_nickname
  from public.profiles where username = _target_username;

  if _target_id is null then
    return jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  end if;

  update public.profiles
  set winpro_until = null
  where id = _target_id;

  return jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'message', 'WinPro удалён'
  );
end;
$$;

-- 4. Policy: чтение winpro_until только авторизованным (и admin для других)
drop policy if exists "profiles_winpro_select" on public.profiles;
create policy "profiles_winpro_select" on public.profiles
  for select using (true);


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_2.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat — миграция: ГРУППЫ, ОПИСАНИЯ, ГОЛОСОВЫЕ
--  Усиленная версия: достраивает ВСЕ недостающие колонки,
--  включая direct_key (если таблица chats создавалась вручную).
--  Идемпотентная: безопасно запускать повторно.
--  Dashboard → SQL Editor → New query → вставить целиком → Run
-- ============================================================

-- 1. ПРОФИЛИ: достраиваем колонки ------------------------------
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio        text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- 2. ЧАТЫ: direct_key (мог отсутствовать) + поля групп ---------
alter table public.chats add column if not exists direct_key  text;
alter table public.chats alter column direct_key drop not null;

create unique index if not exists chats_direct_key_key
  on public.chats(direct_key);

alter table public.chats add column if not exists is_group    boolean not null default false;
alter table public.chats add column if not exists title       text;
alter table public.chats add column if not exists description text;
alter table public.chats add column if not exists avatar_url  text;
alter table public.chats add column if not exists created_by  uuid references public.profiles(id) on delete set null;
alter table public.chats add column if not exists created_at  timestamptz not null default now();
alter table public.chats add column if not exists updated_at  timestamptz not null default now();

-- 3. УЧАСТНИКИ: роли и дата вступления -------------------------
alter table public.chat_members add column if not exists role      text not null default 'member';
alter table public.chat_members add column if not exists joined_at timestamptz not null default now();

-- 4. СООБЩЕНИЯ: фото, голосовые, дата --------------------------
alter table public.messages add column if not exists content        text;
alter table public.messages add column if not exists image_url      text;
alter table public.messages add column if not exists audio_url      text;
alter table public.messages add column if not exists audio_duration integer;
alter table public.messages add column if not exists created_at     timestamptz not null default now();

-- Сообщение должно содержать хоть что-то
alter table public.messages drop constraint if exists messages_not_empty;
alter table public.messages add  constraint messages_not_empty
  check (content is not null or image_url is not null or audio_url is not null);

-- Индексы на случай, если таблицы создавались вручную
create index if not exists messages_chat_idx     on public.messages(chat_id, created_at);
create index if not exists chat_members_user_idx on public.chat_members(user_id);
create index if not exists profiles_username_idx on public.profiles(username);

-- 5. ПОЛИТИКИ ДЛЯ ГРУПП -----------------------------------------
-- Владелец группы может менять название, описание и обложку
drop policy if exists "chats_update" on public.chats;
create policy "chats_update" on public.chats
  for update
  using (created_by = auth.uid() and is_group = true)
  with check (created_by = auth.uid() and is_group = true);

-- Участник может выйти из группы (удалить свою запись)
drop policy if exists "chat_members_delete" on public.chat_members;
create policy "chat_members_delete" on public.chat_members
  for delete using (user_id = auth.uid());

-- 6. ТРИГГЕР updated_at (на случай, если его не было) ----------
create or replace function public.touch_chat()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.touch_chat();

-- 7. REALTIME ДЛЯ ЧАТОВ И СООБЩЕНИЙ ----------------------------
alter table public.chats replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chats;
exception when duplicate_object then
  null;
end $$;

-- 8. ПРОВЕРКА РЕЗУЛЬТАТА ----------------------------------------
-- Ожидаем: chats = 7, messages = 5, profiles = 4, members = 2
select
  (select count(*) from information_schema.columns
    where table_name = 'chats' and column_name in
      ('direct_key','is_group','title','description','avatar_url','created_by','updated_at')) as chats_ok,
  (select count(*) from information_schema.columns
    where table_name = 'messages' and column_name in
      ('content','image_url','audio_url','audio_duration','created_at'))                      as messages_ok,
  (select count(*) from information_schema.columns
    where table_name = 'profiles' and column_name in
      ('username','nickname','avatar_url','bio'))                                             as profiles_ok,
  (select count(*) from information_schema.columns
    where table_name = 'chat_members' and column_name in
      ('role','joined_at'))                                                                   as members_ok;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_3.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat — обновление: СИНЯЯ ГАЛОЧКА (верификация)
--  Выполнить после предыдущих скриптов. Идемпотентный.
--  Dashboard → SQL Editor → New query → вставить целиком → Run
-- ============================================================

-- 1. ПОЛЕ ВЕРИФИКАЦИИ -------------------------------------------
alter table public.profiles
  add column if not exists verified boolean not null default false;

-- 2. ГАЛОЧКА СИСТЕМНЫМ АККАУНТАМ --------------------------------
-- @admin и @winchat получают её автоматически (и в приложении тоже,
-- даже если строки ещё нет в базе).
update public.profiles
set verified = true
where lower(username) in ('admin', 'winchat');

-- 3. ЗАЩИТА ОТ САМОВЫДАЧИ ---------------------------------------
-- Обычный пользователь не может выдать галочку сам себе:
-- при обновлении профиля значение verified должно остаться прежним.
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and verified is not distinct from (
      select p.verified from public.profiles p where p.id = auth.uid()
    )
  );

-- ============================================================
--  КАК ВЫДАТЬ ГАЛОЧКУ ЛЮБОМУ ПОЛЬЗОВАТЕЛЮ
--  (выполняется из SQL Editor — он работает в обход RLS)
--
--    update public.profiles set verified = true  where username = 'ivan';
--
--  КАК ЗАБРАТЬ:
--    update public.profiles set verified = false where username = 'ivan';
--
--  ПОСМОТРЕТЬ ВСЕХ ВЕРИФИЦИРОВАННЫХ:
--    select username, nickname from public.profiles where verified;
-- ============================================================

-- 4. ПРОВЕРКА ----------------------------------------------------
select username, nickname, verified
from public.profiles
order by verified desc, username;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_4.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat — обновление 4: АДМИН-ПАНЕЛЬ
--  Бан, удаление, права, аудит, временный вход (impersonate)
--  Выполнить целиком в SQL Editor проекта Supabase.
--  Идемпотентная — безопасно запускать повторно.
-- ============================================================

-- ============================================================
--  1. КОЛОНКИ БАНОВ И АУДИТА В profiles
-- ============================================================
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists ban_reason text;

-- Аудит-таблица: кто, что сделал над кем
create table if not exists public.admin_audit (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id) on delete cascade,
  admin_username text not null,
  target_id   uuid not null,
  action      text not null,  -- 'ban' | 'unban' | 'delete' | 'verify' | 'unverify' | 'edit' | 'impersonate'
  details     text,           -- json-описание изменений
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_target_idx on public.admin_audit(target_id);
create index if not exists admin_audit_admin_idx  on public.admin_audit(admin_id);
create index if not exists admin_audit_created_idx on public.admin_audit(created_at desc);

-- ============================================================
--  2. ФУНКЦИЯ ПРОВЕРКИ БАННА (security definer — обходит RLS)
-- ============================================================
create or replace function public.check_banned(user_uuid uuid)
returns text  -- 'ok' | 'banned' | 'not_found'
language plpgsql
security definer set search_path = public
as $$
declare
  _banned_at timestamptz;
begin
  select banned_at into _banned_at
  from public.profiles where id = user_uuid;

  if _banned_at is null then
    return 'ok';
  else
    return 'banned';
  end if;
exception when others then
  return 'not_found';
end;
$$;

-- ============================================================
--  3. ФУНКЦИЯ ПРОВЕРКИ, ЯВЛЯЕТСЯ ЛИ ПОЛЬЗОВАТЕЛЬ АДМИНОМ
-- ============================================================
create or replace function public.is_admin(user_uuid uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  -- Админы: username = 'admin' (или любые из списка ниже)
  return exists (
    select 1 from public.profiles
    where id = user_uuid and lower(username) = 'admin'
  );
end;
$$;

-- ============================================================
--  4. БАН / РАЗБАН ПОЛЬЗОВАТЕЛЯ
--    Вызывает: select public.admin_ban('uuid_юзера', 'reason', true/false)
-- ============================================================
create or replace function public.admin_ban(
  target_uuid uuid,
  reason text,
  do_ban boolean
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
  _target_nickname text;
begin
  -- Проверка авторизации
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  select nickname into _target_nickname
    from public.profiles where id = target_uuid;

  -- Обновляем бан-статус
  update public.profiles
  set banned_at = case when do_ban then now() else null end,
      ban_reason = case when do_ban then reason else null end
  where id = target_uuid;

  -- Аудит
  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, target_uuid,
          case when do_ban then 'ban' else 'unban' end,
          jsonb_build_object('reason', reason, 'target_nickname', _target_nickname));

  return jsonb_build_object(
    'ok', true,
    'banned_at', case when do_ban then now() else null end,
    'ban_reason', case when do_ban then reason else null end
  );
end;
$$;

-- ============================================================
--  5. УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ (мягкое: бан + каскад через RLS)
--    Временное отключение каскада через SECURITY DEFINER
-- ============================================================
create or replace function public.admin_delete_user(target_uuid uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
  _target_nickname text;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  select nickname into _target_nickname
    from public.profiles where id = target_uuid;

  -- Мягкое удаление: сначала баним, потом удаляем профиль
  update public.profiles set banned_at = now(), ban_reason = 'deleted_by_admin'
  where id = target_uuid;

  -- Каскад: ON DELETE CASCADE удалит чаты, члены, сообщения
  delete from public.profiles where id = target_uuid;

  -- Аудит
  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, target_uuid, 'delete',
          jsonb_build_object('target_nickname', _target_nickname));

  return jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

-- ============================================================
--  6. ИЗМЕНЕНИЕ ПРОФИЛЯ (никнейм, username, верификация)
--    Вызывает: select public.admin_edit_profile('uuid', 'new_nick', 'new_user', true)
-- ============================================================
create or replace function public.admin_edit_profile(
  target_uuid uuid,
  new_nickname text,
  new_username text,
  new_verified boolean
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
  _old_nick text;
  _old_user text;
  _old_ver boolean;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  select username, nickname, verified
    into _old_user, _old_nick, _old_ver
    from public.profiles where id = target_uuid;

  update public.profiles
  set nickname = coalesce(nullif(trim(new_nickname), ''), nickname),
      username = coalesce(nullif(trim(lower(new_username)), ''), username),
      verified = coalesce(new_verified, verified)
  where id = target_uuid;

  -- Аудит
  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, target_uuid, 'edit',
          jsonb_build_object(
            'old_nickname', _old_nick, 'new_nickname', new_nickname,
            'old_username', _old_user, 'new_username', new_username,
            'old_verified', _old_ver, 'new_verified', new_verified
          ));

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
--  7. ВРЕМЕННЫЙ ВХОД НА АККАУНТ (impersonate)
--    Вызывает: select public.admin_impersonate(target_uuid)
--    Возвращает: jsonb с { ok: true, target_id, target_username }
--
--    МЕХАНИЗМ (SQL-only):
--    1. Функция возвращает target_id
--    2. Клиент сохраняет target_id в localStorage
--    3. При следующих RPC-вызовах клиент передаёт _admin_override_id
--    4. Все операции (чтение/отправка) идут от имени целевого юзера
--    5. Кнопка "Выйти из админ-режима" сбрасывает override
--
--    Это НЕ полноценный вход под другим пользователем
--    (без service-role ключа JWT сгенерировать невозможно),
--    но позволяет видеть/редактировать чужие данные.
-- ============================================================
create or replace function public.admin_impersonate(target_uuid uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
  _target_nickname text;
  _target_username text;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  select nickname, username
    into _target_nickname, _target_username
    from public.profiles where id = target_uuid;

  if _target_nickname is null then
    return jsonb_build_object('error', 'target_not_found');
  end if;

  if (select banned_at is not null from public.profiles where id = target_uuid) then
    return jsonb_build_object('error', 'target_banned');
  end if;

  -- Аудит
  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, target_uuid, 'impersonate',
          jsonb_build_object('target_nickname', _target_nickname, 'target_username', _target_username));

  return jsonb_build_object(
    'ok', true,
    'target_id', target_uuid,
    'target_nickname', _target_nickname,
    'target_username', _target_username
  );
end;
$$;

-- ============================================================
--  7b. ВЫХОД ИЗ АДМИН-РЕЖИМА (resign)
--    Вызывает: select public.admin_resign()
--    Возвращает: { ok: true }
--    Функция нужна для аудита выхода
-- ============================================================
create or replace function public.admin_resign()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, _admin_id, 'resign',
          jsonb_build_object('reason', 'admin clicked resign button'));

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
--  8. ПОЛУЧИТЬ СПИСОК ВСЕХ ПОЛЬЗОВАТЕЛЕЙ (с пагинацией)
--    Вызывает: select public.admin_get_users(page, per_page, search)
--    page/per_page — пагинация (по умолч: 1/50)
--    search — поиск по username/nickname (optional)
-- ============================================================
create or replace function public.admin_get_users(
  page integer default 1,
  per_page integer default 50,
  search text default ''
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _offset integer;
  _count integer;
  _users jsonb;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  _offset := (page - 1) * per_page;

  with filtered as (
    select id, username, nickname, avatar_url, bio, verified,
           banned_at, ban_reason, created_at
    from public.profiles
    where (search = '' or
           username ilike ('%' || search || '%') or
           nickname ilike ('%' || search || '%'))
  ),
  paginated as (
    select * from filtered
    order by created_at desc
    limit per_page offset _offset
  ),
  total_count as (
    select count(*) as total from filtered
  )
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(row_to_json(p)) from paginated p), '[]'::jsonb),
    'total', (select total from total_count),
    'page', page,
    'per_page', per_page,
    'total_pages', ceil((select total from total_count)::numeric / per_page::numeric)
  ) into _users;

  return _users;
end;
$$;

-- ============================================================
--  9. ПОЛУЧИТЬ АУДИТ-ЛОГИ (кто что сделал)
--    Вызывает: select public.admin_get_audit(page, per_page)
-- ============================================================
create or replace function public.admin_get_audit(
  page integer default 1,
  per_page integer default 50
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _offset integer;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  _offset := (page - 1) * per_page;

  return (
    select jsonb_build_object(
      'audits', coalesce((
        select jsonb_agg(row_to_json(a))
        from (
          select aa.id, aa.admin_id, aa.admin_username, aa.target_id, aa.action, aa.details, aa.created_at,
                 p.nickname as target_nickname, p.username as target_username
          from public.admin_audit aa
          left join public.profiles p on p.id = aa.target_id
          order by aa.created_at desc
          limit per_page offset _offset
        ) a
      ), '[]'::jsonb),
      'total', (select count(*) from public.admin_audit),
      'page', page,
      'per_page', per_page
    )
  );
end;
$$;

-- ============================================================
--  10. REALTIME ДЛЯ АУДИТ-ЛОГОВ
-- ============================================================
alter table public.admin_audit replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.admin_audit;
exception when duplicate_object then
  null;
end $$;

-- ============================================================
--  11. RLS для admin_audit (читают только админы)
-- ============================================================
alter table public.admin_audit enable row level security;

drop policy if exists "admin_audit_select" on public.admin_audit;
create policy "admin_audit_select" on public.admin_audit
  for select using (public.is_admin(auth.uid()));

-- ============================================================
--  11. СТАТУС-ТАБЛИЦА ДЛЯ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
--     (нужна для проверки бана при входе в App)
-- ============================================================
-- Используем function public.check_banned() — уже создана выше.
-- В App.tsx мы будем вызывать её при загрузке.

-- ============================================================
--  ГОТОВО!
-- ============================================================
-- После выполнения этого скрипта:
-- 1. Все пользователи с username='admin' получают права админа
-- 2. Функции admin_ban, admin_edit_profile, admin_delete_user
--    доступны через RPC вызовы из клиента
-- 3. Функция admin_get_users возвращает список пользователей
-- 4. Функция admin_get_audit возвращает логи действий
-- 5. Функция check_banned проверяет забанен ли пользователь


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_4_fix.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat — хотфикс: заполнение admin_username во всех RPC
--  Выполни в SQL Editor (заменяет функции с багом null).
-- ============================================================

-- 1. admin_ban
create or replace function public.admin_ban(
  target_uuid uuid,
  reason text,
  do_ban boolean
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
  _target_nickname text;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  select nickname into _target_nickname
    from public.profiles where id = target_uuid;

  update public.profiles
  set banned_at = case when do_ban then now() else null end,
      ban_reason = case when do_ban then reason else null end
  where id = target_uuid;

  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, target_uuid,
          case when do_ban then 'ban' else 'unban' end,
          jsonb_build_object('reason', reason, 'target_nickname', _target_nickname));

  return jsonb_build_object(
    'ok', true,
    'banned_at', case when do_ban then now() else null end,
    'ban_reason', case when do_ban then reason else null end
  );
end;
$$;

-- 2. admin_delete_user
create or replace function public.admin_delete_user(target_uuid uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
  _target_nickname text;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  select nickname into _target_nickname
    from public.profiles where id = target_uuid;

  update public.profiles set banned_at = now(), ban_reason = 'deleted_by_admin'
  where id = target_uuid;

  delete from public.profiles where id = target_uuid;

  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, target_uuid, 'delete',
          jsonb_build_object('target_nickname', _target_nickname));

  return jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

-- 3. admin_edit_profile
create or replace function public.admin_edit_profile(
  target_uuid uuid,
  new_nickname text,
  new_username text,
  new_verified boolean
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
  _old_nick text;
  _old_user text;
  _old_ver boolean;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  select username, nickname, verified
    into _old_user, _old_nick, _old_ver
    from public.profiles where id = target_uuid;

  update public.profiles
  set nickname = coalesce(nullif(trim(new_nickname), ''), nickname),
      username = coalesce(nullif(trim(lower(new_username)), ''), username),
      verified = coalesce(new_verified, verified)
  where id = target_uuid;

  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, target_uuid, 'edit',
          jsonb_build_object(
            'old_nickname', _old_nick, 'new_nickname', new_nickname,
            'old_username', _old_user, 'new_username', new_username,
            'old_verified', _old_ver, 'new_verified', new_verified
          ));

  return jsonb_build_object('ok', true);
end;
$$;

-- 4. admin_impersonate
create or replace function public.admin_impersonate(target_uuid uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _admin_username text;
  _target_nickname text;
  _target_username text;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  select username into _admin_username
    from public.profiles where id = _admin_id;

  select nickname, username
    into _target_nickname, _target_username
    from public.profiles where id = target_uuid;

  if _target_nickname is null then
    return jsonb_build_object('error', 'target_not_found');
  end if;

  if (select banned_at is not null from public.profiles where id = target_uuid) then
    return jsonb_build_object('error', 'target_banned');
  end if;

  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (_admin_id, _admin_username, target_uuid, 'impersonate',
          jsonb_build_object('target_nickname', _target_nickname, 'target_username', _target_username));

  return jsonb_build_object(
    'ok', true,
    'target_id', target_uuid,
    'target_nickname', _target_nickname,
    'target_username', _target_username
  );
end;
$$;

-- 5. admin_get_users (fix: total alias)
create or replace function public.admin_get_users(
  page integer default 1,
  per_page integer default 50,
  search text default ''
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _admin_id uuid;
  _offset integer;
  _users jsonb;
begin
  _admin_id := auth.uid();
  if _admin_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if not public.is_admin(_admin_id) then
    return jsonb_build_object('error', 'not_admin');
  end if;

  _offset := (page - 1) * per_page;

  with filtered as (
    select id, username, nickname, avatar_url, bio, verified,
           banned_at, ban_reason, created_at
    from public.profiles
    where (search = '' or
           username ilike ('%' || search || '%') or
           nickname ilike ('%' || search || '%'))
  ),
  paginated as (
    select * from filtered
    order by created_at desc
    limit per_page offset _offset
  ),
  total_count as (
    select count(*) as total from filtered
  )
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(row_to_json(p)) from paginated p), '[]'::jsonb),
    'total', (select total from total_count),
    'page', page,
    'per_page', per_page,
    'total_pages', ceil((select total from total_count)::numeric / per_page::numeric)
  ) into _users;

  return _users;
end;
$$;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_5.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat — обновление 5: ВИДЕОКРУЖКИ
--  Выполнить в SQL Editor проекта Supabase.
--  Идемпотентная.
-- ============================================================

-- 1. КОЛОНКИ ВИДЕО В messages
alter table public.messages add column if not exists video_url      text;
alter table public.messages add column if not exists video_duration integer;

-- 2. CONSTRAINT: сообщение должно содержать хоть что-то
--    (теперь включает video_url)
alter table public.messages drop constraint if exists messages_not_empty;
alter table public.messages add  constraint messages_not_empty
  check (
    content is not null or
    image_url is not null or
    audio_url is not null or
    video_url is not null
  );

-- 3. STORAGE: бакет video-attachments (отдельный от audio/image)
insert into storage.buckets (id, name, public)
values ('video-attachments', 'video-attachments', true)
on conflict (id) do nothing;

-- политика: все читают, авторизованные загружают
drop policy if exists "video_attachments_read" on storage.objects;
create policy "video_attachments_read" on storage.objects
  for select using (bucket_id = 'video-attachments');

drop policy if exists "video_attachments_insert" on storage.objects;
create policy "video_attachments_insert" on storage.objects
  for insert with check (bucket_id = 'video-attachments' and auth.role() = 'authenticated');


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_6.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 6 — Верификация с уровнями + Админ-терминал
--  Уровни: user (нет) → grey → green → full (синяя)
-- ============================================================

-- 0. Удаляем старые версии RPC-функций (с TEXT-параметрами)
DROP FUNCTION IF EXISTS add_verify_status(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS disverify_status(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS ban_user_by_username(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS unban_user_by_username(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_verify_status(TEXT, TEXT) CASCADE;

-- 1. Добавляем колонку verify_status
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verify_status TEXT NOT NULL DEFAULT 'user';

-- 2. Добавляем колонку terminal_log для истории команд
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terminal_log JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. Обновляем существующих верифицированных (синяя галочка)
UPDATE profiles SET verify_status = 'full' WHERE verified = true;

-- 4. Создаём RPC-функцию для добавления галочки
CREATE OR REPLACE FUNCTION add_verify_status(
  _admin_id UUID,
  _target_username TEXT,
  _level TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _target_id UUID;
  _target_nickname TEXT;
  _log JSONB;
BEGIN
  -- Проверяем, что админ
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _admin_id AND username = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  END IF;

  -- Ищем пользователя
  SELECT id, nickname INTO _target_id, _target_nickname
  FROM profiles WHERE username = _target_username;

  IF _target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  END IF;

  -- Проверяем валидность уровня
  IF _level NOT IN ('grey', 'green', 'full') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Неверный уровень. Доступные: grey, green, full');
  END IF;

  -- Обновляем статус
  UPDATE profiles
  SET verify_status = _level
  WHERE id = _target_id;

  -- Логгируем
  _log := jsonb_build_array(
    jsonb_build_object(
      'timestamp', NOW(),
      'admin', _admin_id,
      'action', 'add_verify',
      'target', _target_username,
      'level', _level
    )
  );
  UPDATE profiles SET terminal_log = _log WHERE id = _admin_id;

  RETURN jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'status', _level,
    'message', CASE _level
      WHEN 'grey' THEN 'Серая галочка добавлена'
      WHEN 'green' THEN 'Зелёная галочка добавлена'
      WHEN 'full' THEN 'Синяя галочка добавлена'
    END
  );
END;
$$;

-- 5. Создаём RPC-функцию для снятия галочки
CREATE OR REPLACE FUNCTION disverify_status(
  _admin_id UUID,
  _target_username TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _target_id UUID;
  _target_nickname TEXT;
BEGIN
  -- Проверяем, что админ
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _admin_id AND username = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  END IF;

  -- Ищем пользователя
  SELECT id, nickname INTO _target_id, _target_nickname
  FROM profiles WHERE username = _target_username;

  IF _target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  END IF;

  -- Сбрасываем статус
  UPDATE profiles SET verify_status = 'user' WHERE id = _target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'message', 'Галочка удалена'
  );
END;
$$;

-- 6. Создаём RPC-функцию для блокировки
CREATE OR REPLACE FUNCTION ban_user_by_username(
  _admin_id UUID,
  _target_username TEXT,
  _reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _target_id UUID;
  _target_nickname TEXT;
BEGIN
  -- Проверяем, что админ
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _admin_id AND username = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  END IF;

  -- Ищем пользователя
  SELECT id, nickname INTO _target_id, _target_nickname
  FROM profiles WHERE username = _target_username;

  IF _target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  END IF;

  -- Блокируем
  UPDATE profiles
  SET banned_at = NOW(), ban_reason = _reason
  WHERE id = _target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'message', 'Пользователь заблокирован'
  );
END;
$$;

-- 7. Создаём RPC-функцию для разблокировки
CREATE OR REPLACE FUNCTION unban_user_by_username(
  _admin_id UUID,
  _target_username TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _target_id UUID;
  _target_nickname TEXT;
BEGIN
  -- Проверяем, что админ
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _admin_id AND username = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  END IF;

  -- Ищем пользователя
  SELECT id, nickname INTO _target_id, _target_nickname
  FROM profiles WHERE username = _target_username;

  IF _target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  END IF;

  -- Разблокируем
  UPDATE profiles
  SET banned_at = NULL, ban_reason = NULL
  WHERE id = _target_id;

  RETURN jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'message', 'Пользователь разблокирован'
  );
END;
$$;

-- 8. Создаём RPC-функцию для просмотра статуса галочек
CREATE OR REPLACE FUNCTION get_verify_status(
  _admin_id UUID,
  _target_username TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _result JSONB;
BEGIN
  -- Проверяем, что админ
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _admin_id AND username = 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'username', p.username,
    'nickname', p.nickname,
    'verify_status', p.verify_status,
    'banned', p.banned_at IS NOT NULL
  ) INTO _result
  FROM profiles p WHERE p.username = _target_username;

  IF _result IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  END IF;

  RETURN _result;
END;
$$;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_7.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 7 — WinPass (код восстановления аккаунта)
--  Формат: 33b42-XXXXXXXXXXXX
--  Выполнить в СТАРОМ проекте (iksgubxxxspkjwsazrwq):
--  Dashboard → SQL Editor → New query → вставить целиком → Run
-- ============================================================

-- 1. Колонка winpass в profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS winpass TEXT UNIQUE;

-- 2. Хелпер:сгенерировать уникальный WinPass (вызывается из триггера и RPC)
create or replace function public.generate_winpass()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  candidate text;
begin
  loop
    -- Формат: 33b42-XXXXXXXXXXXX, где X — строчные hex-символы
    candidate := '33b42-' || substr(
      md5(random()::text || clock_timestamp()::text),
      1, 12
    );
    exit when not exists (select 1 from public.profiles where winpass = candidate);
  end loop;
  return candidate;
end;
$$;

-- 2.5 Перевыдать WinPass всем аккаунтам в старом формате (заглавные hex)
do $$
declare
  r record;
begin
  for r in select id from public.profiles where winpass is not null and winpass <> lower(winpass) loop
    update public.profiles set winpass = public.generate_winpass() where id = r.id;
  end loop;
end $$;

-- 3. Выдать WinPass всем существующим аккаунтам без него
do $$
declare
  r record;
begin
  for r in select id from public.profiles where winpass is null loop
    update public.profiles set winpass = public.generate_winpass() where id = r.id;
  end loop;
end $$;

-- 4. Обновить триггер handle_new_user: профиль сразу получает winpass
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, nickname, winpass)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', 'user_' || left(new.id::text, 6))),
    coalesce(new.raw_user_meta_data ->> 'nickname', 'Пользователь'),
    public.generate_winpass()
  );
  return new;
end;
$$;

-- 5. RPC: получить свой WinPass (для экрана настроек)
drop function if exists public.get_my_winpass(uuid);
create or replace function public.get_my_winpass(_user_id uuid)
returns text
language sql
security definer stable set search_path = public
as $$
  select winpass from public.profiles where id = _user_id;
$$;

-- 6. RPC: смена WinPass (сброс кода)
drop function if exists public.regenerate_winpass(uuid);
create or replace function public.regenerate_winpass(_user_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  new_code text;
begin
  new_code := public.generate_winpass();
  update public.profiles set winpass = new_code where id = _user_id;
  return new_code;
end;
$$;

-- 7. RPC для админ-терминала: /get winpass <username>
drop function if exists public.admin_get_winpass(uuid, text);
create or replace function public.admin_get_winpass(_admin_id uuid, _target_username text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _winpass text;
  _nickname text;
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select winpass, nickname into _winpass, _nickname
  from public.profiles where username = _target_username;

  if _nickname is null then
    return jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  end if;

  return jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _nickname,
    'winpass', _winpass
  );
end;
$$;

-- 8. RPC: вход по WinPass — проверяет код и выдаёт временный пароль,
--    которым клиент сразу signInWithPassword'ится через Supabase Auth.
--    SECURITY DEFINER + owner postgres имеет полный доступ к auth.users.
drop function if exists public.login_by_winpass(text);

-- pgcrypto нужен для crypt/gen_salt (установка хеша пароля)
create extension if not exists pgcrypto with schema extensions;

create or replace function public.login_by_winpass(_winpass text)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  _uid uuid;
  _username text;
  _nickname text;
  temp_pw text;
begin
  if _winpass is null or _winpass = '' then
    return jsonb_build_object('ok', false, 'error', 'WinPass не указан');
  end if;

  select id, username, nickname into _uid, _username, _nickname
  from public.profiles
  where winpass = lower(trim(_winpass));

  if _uid is null then
    return jsonb_build_object('ok', false, 'error', 'Неверный WinPass');
  end if;

  -- Проверка бана
  if exists (select 1 from public.profiles where id = _uid and banned_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'Аккаунт заблокирован');
  end if;

  -- Уникальный временный пароль (требования GoTrue: минимум 6 символов, буквы)
  temp_pw := substr(md5(random()::text || clock_timestamp()::text), 1, 12) || 'aB';

  -- Ставим новый bcrypt-хеш пароля прямо в auth.users
  begin
    update auth.users
    set encrypted_password = crypt(temp_pw, gen_salt('bf')),
        updated_at = now()
    where id = _uid;
  exception when undefined_function or invalid_schema_name then
    return jsonb_build_object(
      'ok', false,
      'error', 'pgcrypto не установлен. Выполните CREATE EXTENSION pgcrypto;',
      'hint', SQLERRM,
      'user_id', _uid
    );
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false,
      'error', 'Нет прав на обновление пароля (service_role)',
      'hint', 'TRIGGER SECURITY DEFINER + owner postgres должен иметь доступ к auth.users',
      'user_id', _uid
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'user_id', _uid,
    'username', _username,
    'nickname', _nickname,
    'temp_password', temp_pw
  );
end;
$$;

-- ============================================================

-- ============================================================


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_9.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 9 — версии приложения + управление составом групп
--  Проект БД: https://iksgubxxxspkjwsazrwq.supabase.co
--  Выполнить в Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. Хранилище текущей версии приложения (одна строка)
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Стартовая версия
insert into public.app_settings (key, value)
values ('wintozo_version', '3.0.0')
on conflict (key) do nothing;

-- Публичное чтение настроек (любой клиент должен уметь проверить версию)
alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read" on public.app_settings
  for select using (true);

-- ------------------------------------------------------------
-- 2. RPC: получить текущую версию
-- ------------------------------------------------------------
drop function if exists public.get_wintozo_version();
create or replace function public.get_wintozo_version()
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'wintozo_version'),
    '3.0.0'
  );
$$;

grant execute on function public.get_wintozo_version() to anon, authenticated;

-- ------------------------------------------------------------
-- 3. RPC: установить версию (только владелец аккаунта admin)
-- ------------------------------------------------------------
drop function if exists public.set_wintozo_version(uuid, text);
create or replace function public.set_wintozo_version(
  _admin_id uuid,
  _version  text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _nickname text;
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  if _version is null or trim(_version) !~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok', false, 'error', 'Неверный формат версии. Пример: 3.0.1');
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('wintozo_version', trim(_version), now())
  on conflict (key)
  do update set value = trim(_version), updated_at = now();

  select nickname into _nickname from public.profiles where id = _admin_id;

  return jsonb_build_object(
    'ok', true,
    'version', trim(_version),
    'message', 'Версия обновлена на ' || trim(_version)
  );
end;
$$;

grant execute on function public.set_wintozo_version(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Владелец группы может добавлять и удалять участников
-- ------------------------------------------------------------
-- Добавление: любой участник добавляет новых (создание личных чатов),
-- но в группах с role-моделью — только владелец.
drop policy if exists "chat_members_insert" on public.chat_members;
create policy "chat_members_insert" on public.chat_members
  for insert with check (
    user_id = auth.uid()
    or public.is_chat_member(chat_id)
    or exists (
      select 1 from public.chats c
      where c.id = chat_members.chat_id
        and c.is_group = true
        and c.created_by = auth.uid()
    )
  );

-- Удаление: участник выходит сам, либо владелец группы кикает других
drop policy if exists "chat_members_delete" on public.chat_members;
create policy "chat_members_delete" on public.chat_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chats c
      where c.id = chat_members.chat_id
        and c.is_group = true
        and c.created_by = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_10_ota.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 10 — OTA-обновления для Android
--  Проект БД: https://iksgubxxxspkjwsazrwq.supabase.co
--  Выполнить в Dashboard → SQL Editor → New query → Run
--
--  Схема работы:
--    1. Android-клиент при запуске шлёт статус устройства:
--       is_wintozo_web_true  — открыт как веб-страница (OTA не нужна)
--       is_wintozo_web_no    — нативное приложение (можно ставить APK)
--    2. Для нативного приложения клиент запрашивает версию
--       (get_wintozo_version / check_version) и winchat_search_ota.
--    3. Админ в терминале выполняет:
--         /set ota "https://.../app.apk" [версия] [@username|device_id|*]
--       и телефон получает ссылку на APK, которую можно установить
--       прямо из приложения.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Устройства, которые запускали приложение
-- ------------------------------------------------------------
create table if not exists public.winchat_devices (
  device_id       text primary key,
  is_wintozo_web  boolean not null default true,
  status          text not null default 'is_wintozo_web_true',
  platform        text,
  app_version     text,
  model           text,
  manufacturer    text,
  os_version      text,
  user_id         uuid references auth.users(id) on delete set null,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now()
);

-- На случай, если таблица уже создавалась без колонки status.
alter table public.winchat_devices
  add column if not exists status text not null default 'is_wintozo_web_true';

create index if not exists winchat_devices_last_seen_idx
  on public.winchat_devices (last_seen desc);

alter table public.winchat_devices enable row level security;

-- Прямого доступа у клиентов нет: только через security-definer RPC.
drop policy if exists "winchat_devices_no_direct_access" on public.winchat_devices;

-- ------------------------------------------------------------
-- 1b. Текущая OTA-настройка (одна строка, только через RPC)
-- ------------------------------------------------------------
create table if not exists public.winchat_ota (
  id         boolean primary key default true check (id),
  url        text not null,
  version    text,
  target     text,
  updated_at timestamptz not null default now()
);

alter table public.winchat_ota enable row level security;
drop policy if exists "winchat_ota_no_direct_access" on public.winchat_ota;

-- ------------------------------------------------------------
-- 2. RPC: отчёт устройства о себе при запуске
-- ------------------------------------------------------------
drop function if exists public.winchat_report_device(text, boolean, text, text, text, text, text);
create or replace function public.winchat_report_device(
  _device_id      text,
  _is_wintozo_web boolean,
  _platform       text default null,
  _app_version    text default null,
  _model          text default null,
  _manufacturer   text default null,
  _os_version     text default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _status text := case when coalesce(_is_wintozo_web, true)
                       then 'is_wintozo_web_true'
                       else 'is_wintozo_web_no' end;
begin
  if _device_id is null or length(trim(_device_id)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Не указан device_id');
  end if;

  insert into public.winchat_devices (
    device_id, is_wintozo_web, status, platform, app_version,
    model, manufacturer, os_version, user_id, last_seen
  )
  values (
    left(trim(_device_id), 128),
    coalesce(_is_wintozo_web, true),
    _status,
    left(_platform, 32),
    left(_app_version, 32),
    left(_model, 128),
    left(_manufacturer, 128),
    left(_os_version, 64),
    _uid,
    now()
  )
  on conflict (device_id) do update set
    is_wintozo_web = coalesce(excluded.is_wintozo_web, public.winchat_devices.is_wintozo_web),
    status         = excluded.status,
    platform       = coalesce(excluded.platform, public.winchat_devices.platform),
    app_version    = coalesce(excluded.app_version, public.winchat_devices.app_version),
    model          = coalesce(excluded.model, public.winchat_devices.model),
    manufacturer   = coalesce(excluded.manufacturer, public.winchat_devices.manufacturer),
    os_version     = coalesce(excluded.os_version, public.winchat_devices.os_version),
    user_id        = coalesce(excluded.user_id, public.winchat_devices.user_id),
    last_seen      = now();

  return jsonb_build_object(
    'ok', true,
    'status', _status
  );
end;
$$;

grant execute on function public.winchat_report_device(text, boolean, text, text, text, text, text)
  to anon, authenticated;

-- ------------------------------------------------------------
-- 3. RPC: поиск OTA-обновления для устройства
-- ------------------------------------------------------------
-- Возвращает:
--   { ok: true, available: false }
--   { ok: true, available: true, url, version, target }
drop function if exists public.winchat_search_ota(text);
create or replace function public.winchat_search_ota(_device_id text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _url     text;
  _version text;
  _target  text;
  _allowed boolean := false;
begin
  select url, version, target into _url, _version, _target
    from public.winchat_ota
    where id = true;

  if _url is null or length(trim(_url)) = 0 then
    return jsonb_build_object('ok', true, 'available', false);
  end if;

  -- Без цели (NULL / пусто / *) обновление доступно всем.
  if _target is null or length(trim(_target)) = 0 or trim(_target) = '*' then
    _allowed := true;
  elsif _device_id is not null and trim(_target) = trim(_device_id) then
    _allowed := true;
  elsif left(trim(_target), 1) = '@' then
    -- Цель — username. Ищем, кому принадлежит это устройство.
    select exists (
      select 1
      from public.winchat_devices d
      join public.profiles p on p.id = d.user_id
      where d.device_id = _device_id
        and lower(p.username) = lower(replace(trim(_target), '@', ''))
    ) into _allowed;
  end if;

  if not _allowed then
    return jsonb_build_object('ok', true, 'available', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'available', true,
    'url', _url,
    'version', _version,
    'target', coalesce(nullif(trim(_target), ''), '*')
  );
end;
$$;

grant execute on function public.winchat_search_ota(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. RPC: check_version — понятный алиас для проверки версии
-- ------------------------------------------------------------
drop function if exists public.check_version();
create or replace function public.check_version()
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'wintozo_version'),
    '3.0.0'
  );
$$;

grant execute on function public.check_version() to anon, authenticated;

-- ------------------------------------------------------------
-- 5. RPC: установить OTA (только admin)
-- ------------------------------------------------------------
drop function if exists public.set_winchat_ota(uuid, text, text, text);
create or replace function public.set_winchat_ota(
  _admin_id uuid,
  _url      text,
  _version  text default null,
  _target   text default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _clean_url     text := nullif(trim(_url), '');
  _clean_version text := nullif(trim(_version), '');
  _clean_target  text := nullif(trim(_target), '');
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  -- Пустая ссылка = отключить OTA.
  if _clean_url is null then
    delete from public.winchat_ota where id = true;
    return jsonb_build_object('ok', true, 'message', 'OTA-обновление отключено');
  end if;

  if _clean_url !~* '^https?://' or length(_clean_url) > 2048 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ссылка должна начинаться с http:// или https://'
    );
  end if;

  if _clean_version is not null
     and _clean_version !~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok', false, 'error', 'Неверный формат версии. Пример: 3.1.0');
  end if;

  if _clean_target is not null
     and length(_clean_target) > 128 then
    return jsonb_build_object('ok', false, 'error', 'Слишком длинная цель (device_id / @username)');
  end if;

  insert into public.winchat_ota (id, url, version, target, updated_at)
  values (true, _clean_url, _clean_version, _clean_target, now())
  on conflict (id) do update set
    url        = excluded.url,
    version    = excluded.version,
    target     = excluded.target,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'message', 'OTA-обновление настроено',
    'url', _clean_url,
    'version', _clean_version,
    'target', coalesce(_clean_target, '*')
  );
end;
$$;

grant execute on function public.set_winchat_ota(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 6. RPC: посмотреть текущую OTA-настройку (только admin)
-- ------------------------------------------------------------
drop function if exists public.get_winchat_ota(uuid);
create or replace function public.get_winchat_ota(_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _url     text;
  _version text;
  _target  text;
  _updated timestamptz;
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select url, version, target, updated_at into _url, _version, _target, _updated
    from public.winchat_ota
    where id = true;

  return jsonb_build_object(
    'ok', true,
    'url', _url,
    'version', _version,
    'target', coalesce(_target, '*'),
    'updated_at', _updated
  );
end;
$$;

grant execute on function public.get_winchat_ota(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. RPC: список устройств для админа (чтобы выбрать цель)
-- ------------------------------------------------------------
drop function if exists public.get_winchat_ota_devices(uuid, integer);
create or replace function public.get_winchat_ota_devices(
  _admin_id uuid,
  _limit    integer default 50
) returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _devices jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into _devices
  from (
    select
      d.device_id,
      d.is_wintozo_web,
      d.status,
      d.platform,
      d.app_version,
      d.model,
      d.manufacturer,
      d.os_version,
      d.last_seen,
      p.username
    from public.winchat_devices d
    left join public.profiles p on p.id = d.user_id
    order by d.last_seen desc
    limit greatest(1, least(coalesce(_limit, 50), 200))
  ) t;

  return jsonb_build_object('ok', true, 'devices', _devices);
end;
$$;

grant execute on function public.get_winchat_ota_devices(uuid, integer) to authenticated;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_10_push.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 10 — Push-уведомления (веб + Android)
--  https://iksgubxxxspkjwsazrwq.supabase.co
--  Запустить в SQL Editor Supabase Dashboard
-- ============================================================

-- 1. Таблица подписок на пуш-уведомления
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,                 -- браузер / платформа
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

-- Пользователь читает и пишет только свои подписки
create policy "push_subscriptions_select" on public.push_subscriptions
  for select using (auth.uid() = user_id);

create policy "push_subscriptions_insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "push_subscriptions_update" on public.push_subscriptions
  for update using (auth.uid() = user_id);

create policy "push_subscriptions_delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- 2. RPC: сохранить / обновить подписку
drop function if exists public.save_push_subscription(text, text, text, text);
create or replace function public.save_push_subscription(
  _endpoint   text,
  _p256dh     text,
  _auth       text,
  _user_agent text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    return jsonb_build_object('ok', false, 'error', 'требуется авторизация');
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
  values (_uid, _endpoint, _p256dh, _auth, _user_agent, now())
  on conflict (user_id, endpoint)
  do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- 3. RPC: удалить подписку по endpoint
drop function if exists public.remove_push_subscription(text);
create or replace function public.remove_push_subscription(_endpoint text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.push_subscriptions
  where user_id = auth.uid() and endpoint = _endpoint;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.remove_push_subscription(text) to authenticated;

-- 4. RPC: получить свои подписки
drop function if exists public.get_my_push_subscriptions();
create or replace function public.get_my_push_subscriptions()
returns table (
  id uuid,
  endpoint text,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  select id, endpoint, p256dh, auth, user_agent, created_at
  from public.push_subscriptions
  where user_id = auth.uid();
end;
$$;

grant execute on function public.get_my_push_subscriptions() to authenticated;

-- 5. RPC: отправить пуш всем подписчикам пользователя (для админа / теста)
drop function if exists public.send_push_to_user(uuid, text, text);
create or replace function public.send_push_to_user(
  _target_user_id uuid,
  _title text,
  _body text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _is_admin boolean;
begin
  select exists (
    select 1 from public.profiles where id = auth.uid() and username = 'admin'
  ) into _is_admin;

  if not _is_admin then
    return jsonb_build_object('ok', false, 'error', 'только администратор');
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'пуш-отправка через Edge Function (подробности в src/lib/push.ts)',
    'subscriptions_to', _target_user_id
  );
end;
$$;

grant execute on function public.send_push_to_user(uuid, text, text) to authenticated;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_12_cleanup.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 12 — Cleanup (release-winchat.js)
--  /release-cleanup через RPC: удаляются чаты и сообщения,
--  кроме группы _kept_group_id и кроме бакета avatars.
-- ============================================================

create or replace function public.release_cleanup(
  _admin_id uuid,
  _kept_group_id text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  delete from public.messages where chat_id <> _kept_group_id;
  delete from public.chat_members where chat_id <> _kept_group_id;
  delete from public.chats where id <> _kept_group_id;

  return jsonb_build_object(
    'ok', true,
    'kept_group_id', _kept_group_id,
    'deleted_messages', true,
    'deleted_chats', true
  );
end;
$$;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_13_channels.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 13 — Каналы, синие галочки, редактирование
-- ============================================================
--  RPC:
--    create_winchat_ch(...)        — создать канал (может любой)
--    delete_winchat_ch(...)        — удалить канал
--    edit_wintozo_channel(...)     — изменить канал
--    edit_wintozo_message(...)     — изменить отправленное сообщение
-- ============================================================

-- 1. Флаги чатов ------------------------------------------------
alter table public.chats add column if not exists is_channel  boolean not null default false;
alter table public.chats add column if not exists is_official boolean not null default false;
alter table public.chats add column if not exists verified    boolean not null default false;

-- 2. Время редактирования сообщения -----------------------------
alter table public.messages add column if not exists edited_at timestamptz;

create index if not exists chats_channel_idx      on public.chats(is_channel);
create index if not exists chat_members_role_idx  on public.chat_members(chat_id, role);

-- 3. Хелперы ----------------------------------------------------
create or replace function public.is_global_admin(_user_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and lower(username) = 'admin'
  );
$$;

create or replace function public.is_chat_channel(_chat_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_channel from public.chats where id = _chat_id), false);
$$;

create or replace function public.is_chat_official(_chat_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_official from public.chats where id = _chat_id), false);
$$;

-- Владелец/админ канала или глобальный администратор WinChat.
create or replace function public.is_chat_admin(_chat_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_global_admin(_user_id)
      or exists (
        select 1 from public.chat_members
        where chat_id = _chat_id
          and user_id = _user_id
          and role in ('owner', 'admin')
      );
$$;

-- 4. RLS --------------------------------------------------------
-- Создавать чаты/каналы может любой авторизованный, но нельзя
-- самостоятельно выставить синюю галочку или официальность.
drop policy if exists "chats_insert" on public.chats;
create policy "chats_insert" on public.chats
  for insert with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and verified = false
    and is_official = false
  );

drop policy if exists "chats_update" on public.chats;
create policy "chats_update" on public.chats
  for update
  using (
    (created_by = auth.uid() and is_group = true)
    or public.is_chat_admin(id, auth.uid())
  )
  with check (
    (created_by = auth.uid() and is_group = true)
    or public.is_chat_admin(id, auth.uid())
  );

drop policy if exists "chat_members_insert" on public.chat_members;
create policy "chat_members_insert" on public.chat_members
  for insert with check (
    user_id = auth.uid()
    or public.is_chat_admin(chat_id, auth.uid())
    or (
      not public.is_chat_channel(chat_id)
      and public.is_chat_member(chat_id)
    )
    or exists (
      select 1 from public.chats c
      where c.id = chat_members.chat_id
        and c.is_group = true
        and c.created_by = auth.uid()
    )
  );

drop policy if exists "chat_members_update" on public.chat_members;
create policy "chat_members_update" on public.chat_members
  for update using (public.is_chat_admin(chat_id, auth.uid()))
  with check (public.is_chat_admin(chat_id, auth.uid()));

drop policy if exists "chat_members_delete" on public.chat_members;
create policy "chat_members_delete" on public.chat_members
  for delete using (
    not (user_id = auth.uid() and public.is_chat_official(chat_id))
    and (
      user_id = auth.uid()
      or public.is_chat_admin(chat_id, auth.uid())
    )
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and (
      public.is_chat_member(chat_id)
      or public.is_global_admin(auth.uid())
    )
    and (
      not public.is_chat_channel(chat_id)
      or public.is_chat_admin(chat_id, auth.uid())
    )
  );

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update using (
    sender_id = auth.uid()
    or public.is_chat_admin(chat_id, auth.uid())
  )
  with check (
    sender_id = auth.uid()
    or public.is_chat_admin(chat_id, auth.uid())
  );

-- Защита флагов от прямой подмены клиентом.
create or replace function public.protect_chat_flags()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.verified is distinct from old.verified
       or new.is_official is distinct from old.is_official)
     and not public.is_global_admin(auth.uid()) then
    raise exception 'Менять галочку и статус официального канала может только администратор WinChat';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_chat_flags_trg on public.chats;
create trigger protect_chat_flags_trg
  before update on public.chats
  for each row execute function public.protect_chat_flags();

-- Владельца канала/группы нельзя понизить в роли.
create or replace function public.protect_chat_owner_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.role = 'owner' and new.role is distinct from 'owner' then
    raise exception 'Владельца канала нельзя понизить в роли';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_chat_owner_role_trg on public.chat_members;
create trigger protect_chat_owner_role_trg
  before update on public.chat_members
  for each row execute function public.protect_chat_owner_role();

-- 5. RPC: создать канал -----------------------------------------
drop function if exists public.create_winchat_ch(uuid, text, text, text);
create or replace function public.create_winchat_ch(
  _creator_id uuid,
  _title text,
  _description text default null,
  _avatar_url text default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _chat_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Требуется вход');
  end if;

  if _creator_id <> auth.uid() and not public.is_global_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  if _title is null or length(btrim(_title)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Укажите название канала');
  end if;

  insert into public.chats (id, is_group, is_channel, title, description, avatar_url, created_by)
  values (
    _chat_id,
    true,
    true,
    btrim(_title),
    nullif(btrim(coalesce(_description, '')), ''),
    nullif(btrim(coalesce(_avatar_url, '')), ''),
    _creator_id
  );

  insert into public.chat_members (chat_id, user_id, role)
  values (_chat_id, _creator_id, 'owner');

  return jsonb_build_object('ok', true, 'chat_id', _chat_id, 'title', btrim(_title));
end;
$$;

grant execute on function public.create_winchat_ch(uuid, text, text, text) to authenticated;

-- 6. RPC: удалить канал -----------------------------------------
drop function if exists public.delete_winchat_ch(uuid, uuid);
create or replace function public.delete_winchat_ch(
  _user_id uuid,
  _chat_id uuid
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _official boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Требуется вход');
  end if;

  if _user_id <> auth.uid() and not public.is_global_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select is_official into _official
  from public.chats
  where id = _chat_id and is_channel = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Канал не найден');
  end if;

  if not public.is_chat_admin(_chat_id, _user_id) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  if _official and not public.is_global_admin(_user_id) then
    return jsonb_build_object('ok', false, 'error', 'Официальный канал может удалить только администратор WinChat');
  end if;

  delete from public.chats where id = _chat_id;

  return jsonb_build_object('ok', true, 'chat_id', _chat_id);
end;
$$;

grant execute on function public.delete_winchat_ch(uuid, uuid) to authenticated;

-- 7. RPC: изменить канал ----------------------------------------
drop function if exists public.edit_wintozo_channel(uuid, uuid, text, text, text, boolean, boolean);
create or replace function public.edit_wintozo_channel(
  _user_id uuid,
  _chat_id uuid,
  _title text default null,
  _description text default null,
  _avatar_url text default null,
  _verified boolean default null,
  _is_official boolean default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _chat public.chats%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Требуется вход');
  end if;

  if _user_id <> auth.uid() and not public.is_global_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select * into _chat from public.chats where id = _chat_id and is_channel = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Канал не найден');
  end if;

  if not public.is_chat_admin(_chat_id, _user_id) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  if (_verified is not null or _is_official is not null)
     and not public.is_global_admin(_user_id) then
    return jsonb_build_object('ok', false, 'error', 'Галочку и статус официального канала может менять только администратор WinChat');
  end if;

  if _title is not null and length(btrim(_title)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Название не может быть пустым');
  end if;

  update public.chats
  set title       = case when _title is null then title else btrim(_title) end,
      description = case when _description is null then description else nullif(btrim(_description), '') end,
      avatar_url  = case when _avatar_url is null then avatar_url else nullif(btrim(_avatar_url), '') end,
      verified    = coalesce(_verified, verified),
      is_official = coalesce(_is_official, is_official)
  where id = _chat_id;

  select * into _chat from public.chats where id = _chat_id;

  return jsonb_build_object(
    'ok', true,
    'chat_id', _chat_id,
    'title', _chat.title,
    'description', _chat.description,
    'avatar_url', _chat.avatar_url,
    'verified', _chat.verified,
    'is_official', _chat.is_official
  );
end;
$$;

grant execute on function public.edit_wintozo_channel(uuid, uuid, text, text, text, boolean, boolean) to authenticated;

-- 8. RPC: редактировать сообщение -------------------------------
drop function if exists public.edit_wintozo_message(uuid, uuid, text);
create or replace function public.edit_wintozo_message(
  _user_id uuid,
  _message_id uuid,
  _content text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _msg public.messages%rowtype;
  _edited_at timestamptz := now();
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Требуется вход');
  end if;

  if _user_id <> auth.uid() and not public.is_global_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select * into _msg from public.messages where id = _message_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Сообщение не найдено');
  end if;

  if _msg.sender_id <> _user_id
     and not public.is_chat_admin(_msg.chat_id, _user_id) then
    return jsonb_build_object('ok', false, 'error', 'Можно редактировать только свои сообщения');
  end if;

  if (_content is null or length(btrim(_content)) = 0)
     and _msg.image_url is null
     and _msg.audio_url is null
     and _msg.video_url is null then
    return jsonb_build_object('ok', false, 'error', 'Сообщение не может быть пустым');
  end if;

  update public.messages
  set content = nullif(btrim(_content), ''),
      edited_at = _edited_at
  where id = _message_id;

  return jsonb_build_object(
    'ok', true,
    'message_id', _message_id,
    'content', nullif(btrim(_content), ''),
    'edited_at', _edited_at
  );
end;
$$;

grant execute on function public.edit_wintozo_message(uuid, uuid, text) to authenticated;

-- 8.1 RPC: список каналов (для админ-терминала) ------------------
drop function if exists public.list_winchat_channels(uuid);
create or replace function public.list_winchat_channels(
  _user_id uuid
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Требуется вход');
  end if;

  if _user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  if not public.is_global_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  return jsonb_build_object(
    'ok', true,
    'channels', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'title', c.title,
            'verified', c.verified,
            'is_official', c.is_official,
            'subscribers', (
              select count(*) from public.chat_members m where m.chat_id = c.id
            )
          )
          order by c.is_official desc, c.created_at
        )
        from public.chats c
        where c.is_channel = true
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.list_winchat_channels(uuid) to authenticated;

-- 9. Официальный канал + синяя галочка группе ------------------
do $$
declare
  _admin_id uuid;
  _official_id uuid := '00000000-0000-4000-8000-000000000001';
begin
  select id into _admin_id
  from public.profiles
  where lower(username) = 'admin'
  limit 1;

  if _admin_id is null then
    select id into _admin_id from public.profiles order by created_at limit 1;
  end if;

  -- Синяя галочка уже существующей группе.
  update public.chats
  set verified = true
  where id = 'a7296d8e-f687-422b-886f-68a8f792af92';

  -- Официальный канал WinChat Official.
  insert into public.chats (
    id, is_group, is_channel, is_official, verified,
    title, description, created_by
  )
  values (
    _official_id,
    true,
    true,
    true,
    true,
    'WinChat Official',
    'Официальный канал WinChat — новости и объявления.',
    _admin_id
  )
  on conflict (id) do nothing;

  update public.chats
  set is_channel = true,
      is_official = true,
      verified = true
  where id = _official_id;

  if _admin_id is not null then
    insert into public.chat_members (chat_id, user_id, role)
    values (_official_id, _admin_id, 'owner')
    on conflict (chat_id, user_id) do update set role = 'owner';
  end if;

  -- Все существующие пользователи подписаны на официальный канал.
  insert into public.chat_members (chat_id, user_id, role)
  select _official_id, p.id, 'subscriber'
  from public.profiles p
  on conflict (chat_id, user_id) do nothing;

  if _admin_id is not null then
    update public.chat_members
    set role = 'owner'
    where chat_id = _official_id and user_id = _admin_id;
  end if;
end $$;

-- 10. Новые пользователи автоматически подписываются ------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, nickname, winpass)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', 'user_' || left(new.id::text, 6))),
    coalesce(new.raw_user_meta_data ->> 'nickname', 'Пользователь'),
    public.generate_winpass()
  );

  insert into public.chat_members (chat_id, user_id, role)
  select c.id, new.id, 'subscriber'
  from public.chats c
  where c.is_official = true
  on conflict (chat_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_14_ota_prerelease.sql
-- ------------------------------------------------------------
-- =============================================================
-- WinChat update 14: поддержки пререлизных версий (например 4.0.0-beta)
-- ------------------------------------------------------------
-- Что делает:
--   1. Ослабляет проверку формата версии в set_wintozo_version
--      (winchat_update_9.sql разрешал только X.Y / X.Y.Z)
--      → теперь можно суффикс пререлиза: 4.0.0-beta, 4.0.0-rc.1
--      и суффикс сборки: 4.0.0-beta+build123
--   2. Ослабляет такую же проверку в set_winchat_ota
--      (winchat_update_10_ota.sql).
--
-- Формат:  X.Y / X.Y.Z  +  опционально  -пререлиз  +  опционально  +сборка
--   пререлиз: буквы/цифры/точки/дефисы (alpha, beta, beta.1, rc1 …)
--   сборка:   буквы/цифры/точки/дефисы
--
-- Запускать в Supabase SQL Editor вручную.
-- =============================================================

-- ------------------------------------------------------------
-- 1. RPC: установить версию (только admin) — с пререлизами
-- ------------------------------------------------------------
drop function if exists public.set_wintozo_version(uuid, text);
create or replace function public.set_wintozo_version(
  _admin_id uuid,
  _version  text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _nickname text;
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  -- X.Y / X.Y.Z + опциональный пререлиз -beta… и сборка +build…
  if _version is null
     or trim(_version) !~ '^[0-9]+\.[0-9]+(\.[0-9]+)?(-[0-9A-Za-z][0-9A-Za-z.\-]*)?(\+[0-9A-Za-z.\-]+)?$'
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'Неверный формат версии. Пример: 3.0.1 или 4.0.0-beta'
    );
  end if;

  insert into public.app_settings (key, value, updated_at)
  values ('wintozo_version', trim(_version), now())
  on conflict (key)
  do update set value = trim(_version), updated_at = now();

  select nickname into _nickname from public.profiles where id = _admin_id;

  return jsonb_build_object(
    'ok', true,
    'version', trim(_version),
    'message', 'Версия обновлена на ' || trim(_version)
  );
end;
$$;

grant execute on function public.set_wintozo_version(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 2. RPC: установить OTA (только admin) — версия с пререлизом
-- ------------------------------------------------------------
drop function if exists public.set_winchat_ota(uuid, text, text, text);
create or replace function public.set_winchat_ota(
  _admin_id uuid,
  _url      text,
  _version  text default null,
  _target   text default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _clean_url     text := nullif(trim(_url), '');
  _clean_version text := nullif(trim(_version), '');
  _clean_target  text := nullif(trim(_target), '');
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  -- Пустая ссылка = отключить OTA.
  if _clean_url is null then
    delete from public.winchat_ota where id = true;
    return jsonb_build_object('ok', true, 'message', 'OTA-обновление отключено');
  end if;

  if _clean_url !~* '^https?://' or length(_clean_url) > 2048 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ссылка должна начинаться с http:// или https://'
    );
  end if;

  -- Тот же формат: X.Y.Z + опциональный пререлиз и сборка.
  if _clean_version is not null
     and _clean_version !~ '^[0-9]+\.[0-9]+(\.[0-9]+)?(-[0-9A-Za-z][0-9A-Za-z.\-]*)?(\+[0-9A-Za-z.\-]+)?$'
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'Неверный формат версии. Пример: 3.1.0 или 4.0.0-beta'
    );
  end if;

  if _clean_target is not null
     and length(_clean_target) > 128 then
    return jsonb_build_object('ok', false, 'error', 'Слишком длинная цель (device_id / @username)');
  end if;

  insert into public.winchat_ota (id, url, version, target, updated_at)
  values (true, _clean_url, _clean_version, _clean_target, now())
  on conflict (id) do update set
    url        = excluded.url,
    version    = excluded.version,
    target     = excluded.target,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'message', 'OTA-обновление настроено',
    'url', _clean_url,
    'version', _clean_version,
    'target', coalesce(_clean_target, '*')
  );
end;
$$;

grant execute on function public.set_winchat_ota(uuid, text, text, text) to authenticated;

-- =============================================================
-- Готово. Теперь можно: /set version 4.0.0-beta
-- и /set ota "https://…apk" 4.0.0-beta
-- =============================================================


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_15_stickers_text.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat: стикеры — ЧАСТЬ 1 из 2
--  ТЕКСТОВЫЙ СЕРВЕР (основная база WinChat: iksgubxxxspkjwsazrwq)
--
--  Выполнить в SQL Editor проекта iksgubxxxspkjwsazrwq.
--  Часть 2 (sticker-сервер) лежит в отдельном файле:
--    sql/winchat_update_15_stickers_server.sql
-- ============================================================

-- Храним только ссылку на стикер/GIF, сам файл лежит на sticker-сервере.
alter table public.messages
  add column if not exists sticker_url text;

-- Сообщение может состоять только из стикера (без текста/фото/видео).
alter table public.messages drop constraint if exists messages_not_empty;
alter table public.messages add constraint messages_not_empty
  check (
    content is not null or
    image_url is not null or
    sticker_url is not null or
    audio_url is not null or
    video_url is not null
  );

-- Быстрый поиск сообщений со стикерами (не обязательно, но полезно).
create index if not exists messages_sticker_idx
  on public.messages(chat_id, created_at)
  where sticker_url is not null;

-- Проверка (должна вернуть 1 строку):
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'messages'
--   and column_name = 'sticker_url';


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_16_invites.sql
-- ------------------------------------------------------------
-- ============================================================
-- WinChat 5.0.x — приглашения в группы и каналы
--
-- Новая колонка chats.invite_code + RPC get_chat_by_invite:
--   ссылка приглашения: /channel/invite/<code>  или  /group/invite/<code>
--   код — случайное число (например, 10000..330357).
--
-- Выполните этот файл в SQL Editor проекта Supabase.
-- ============================================================

alter table public.chats
  add column if not exists invite_code text;

create unique index if not exists chats_invite_code_key
  on public.chats (invite_code);

-- RPC: найти чат по коду приглашения.
create or replace function public.get_chat_by_invite(_invite_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.chats;
begin
  select *
    into c
    from public.chats
   where public.chats.invite_code = lower(trim(_invite_code))
   limit 1;

  if c.id is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  return json_build_object(
    'ok', true,
    'chat', json_build_object(
      'id', c.id,
      'direct_key', c.direct_key,
      'is_group', c.is_group,
      'is_channel', c.is_channel,
      'title', c.title,
      'description', c.description,
      'avatar_url', c.avatar_url,
      'created_by', c.created_by,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'invite_code', c.invite_code
    )
  );
end;
$$;

-- RPC: сгенерировать новый код приглашения для чата.
create or replace function public.regen_chat_invite(_chat_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.chats;
  code text;
begin
  select *
    into c
    from public.chats
   where public.chats.id = _chat_id
   limit 1;

  if c.id is null then
    return null;
  end if;

  loop
    code := (10000 + floor(random() * 320348))::text;
    exit when not exists (select 1 from public.chats where public.chats.invite_code = code);
  end loop;

  update public.chats
     set invite_code = code
   where public.chats.id = _chat_id;

  return code;
end;
$$;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_17_ota_desc.sql
-- ------------------------------------------------------------
-- =============================================================
-- WinChat update 17: описание OTA-обновления (пятый аргумент _desc)
-- ------------------------------------------------------------
-- Что делает:
--   1. Добавляет колонку winchat_ota.description (текст «что нового»).
--   2. Пересоздаёт set_winchat_ota с 5-м параметром _desc:
--        /set ota @user "https://…apk" 5.0.0 [@target|*] ["описание"]
--      Сигнатура: set_winchat_ota(uuid, text, text, text, text)
--      (старая 4-арговая версия удаляется — именно из-за неё терминал
--       получал «Could not find the function … in the schema cache»).
--   3. get_winchat_ota теперь возвращает и description.
--
-- Запускать в Supabase SQL Editor вручную.
-- =============================================================

-- ------------------------------------------------------------
-- 1. Колонка описания
-- ------------------------------------------------------------
alter table public.winchat_ota
  add column if not exists description text;

-- ------------------------------------------------------------
-- 2. RPC: установить/снять OTA (только admin) — с описанием
-- ------------------------------------------------------------
drop function if exists public.set_winchat_ota(uuid, text, text, text);
drop function if exists public.set_winchat_ota(uuid, text, text, text, text);
create or replace function public.set_winchat_ota(
  _admin_id uuid,
  _url      text,
  _version  text default null,
  _target   text default null,
  _desc     text default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _clean_url     text := nullif(trim(_url), '');
  _clean_version text := nullif(trim(_version), '');
  _clean_target  text := nullif(trim(_target), '');
  _clean_desc    text := nullif(trim(_desc), '');
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  if _clean_desc is not null and length(_clean_desc) > 500 then
    return jsonb_build_object('ok', false, 'error', 'Описание слишком длинное (макс. 500 символов)');
  end if;

  -- Пустая ссылка = отключить OTA.
  if _clean_url is null then
    delete from public.winchat_ota where id = true;
    return jsonb_build_object('ok', true, 'message', 'OTA-обновление отключено');
  end if;

  if _clean_url !~* '^https?://' or length(_clean_url) > 2048 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ссылка должна начинаться с http:// или https://'
    );
  end if;

  -- Формат версии: X.Y / X.Y.Z + опциональный пререлиз (-beta) и сборка (+build).
  if _clean_version is not null
     and _clean_version !~ '^[0-9]+\.[0-9]+(\.[0-9]+)?(-[0-9A-Za-z][0-9A-Za-z.\-]*)?(\+[0-9A-Za-z.\-]+)?$'
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'Неверный формат версии. Пример: 3.1.0 или 5.0.0-beta'
    );
  end if;

  if _clean_target is not null
     and length(_clean_target) > 128 then
    return jsonb_build_object('ok', false, 'error', 'Слишком длинная цель (device_id / @username)');
  end if;

  insert into public.winchat_ota (id, url, version, target, description, updated_at)
  values (true, _clean_url, _clean_version, _clean_target, _clean_desc, now())
  on conflict (id) do update set
    url         = excluded.url,
    version     = excluded.version,
    target      = excluded.target,
    description = excluded.description,
    updated_at  = now();

  return jsonb_build_object(
    'ok', true,
    'message', 'OTA-обновление настроено',
    'url', _clean_url,
    'version', _clean_version,
    'target', coalesce(_clean_target, '*'),
    'description', _clean_desc
  );
end;
$$;

grant execute on function public.set_winchat_ota(uuid, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. RPC: посмотреть текущую OTA-настройку (только admin)
-- ------------------------------------------------------------
drop function if exists public.get_winchat_ota(uuid);
create or replace function public.get_winchat_ota(_admin_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _url     text;
  _version text;
  _target  text;
  _desc    text;
  _updated timestamptz;
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select url, version, target, description, updated_at
    into _url, _version, _target, _desc, _updated
    from public.winchat_ota
    where id = true;

  return jsonb_build_object(
    'ok', true,
    'url', _url,
    'version', _version,
    'target', coalesce(_target, '*'),
    'description', _desc,
    'updated_at', _updated
  );
end;
$$;

grant execute on function public.get_winchat_ota(uuid) to authenticated;

-- =============================================================
-- Готово. Теперь можно:
--   /set ota @user "https://…/release%205.0.0.apk" 5.0.0
--   /get ota
-- =============================================================


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_18_glass.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 18 — WinChat Glass по флагу админа
--  /give glass @username   → is_winchat_glass_true
--  /delete glass @username → is_winchat_glass_no
-- ============================================================

-- 1. Колонка-флаг (по умолчанию Glass не выдан)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_winchat_glass text DEFAULT 'is_winchat_glass_no';

-- 2. RPC: выдать WinChat Glass
drop function if exists public.give_glass(uuid, text);
create or replace function public.give_glass(
  _admin_id uuid,
  _target_username text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _target_id uuid;
  _target_nickname text;
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select id, nickname into _target_id, _target_nickname
  from public.profiles where username = _target_username;

  if _target_id is null then
    return jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  end if;

  update public.profiles
  set is_winchat_glass = 'is_winchat_glass_true'
  where id = _target_id;

  return jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'message', 'WinChat Glass выдан @' || _target_username || ' (флаг is_winchat_glass_true)'
  );
end;
$$;

-- 3. RPC: снять WinChat Glass
drop function if exists public.delete_glass(uuid, text);
create or replace function public.delete_glass(
  _admin_id uuid,
  _target_username text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _target_id uuid;
  _target_nickname text;
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select id, nickname into _target_id, _target_nickname
  from public.profiles where username = _target_username;

  if _target_id is null then
    return jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  end if;

  update public.profiles
  set is_winchat_glass = 'is_winchat_glass_no'
  where id = _target_id;

  return jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'message', 'WinChat Glass снят с @' || _target_username || ' (флаг is_winchat_glass_no)'
  );
end;
$$;

-- 4. Policy: чтение is_winchat_glass только авторизованным
drop policy if exists "profiles_glass_select" on public.profiles;
create policy "profiles_glass_select" on public.profiles
  for select using (true);


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_19_oobe_version.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat Update 19 — OOBE назначенной версии
--  /set oobe @username "5.0" → profiles.oobe_version = '5.0'
--    (при следующем входе пользователю покажется OOBE 5.0)
--  /set oobe @username "6.0" → profiles.oobe_version = '6.0'
--  /set oobe @username off   → profiles.oobe_version = null
--    (обычная логика OOBE)
-- ============================================================

-- 1. Колонка: какая версия OOBE назначена пользователю (null — обычная логика)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS oobe_version text;

-- 2. RPC: назначить (или снять) версию OOBE пользователю
drop function if exists public.set_oobe(uuid, text, text);
create or replace function public.set_oobe(
  _admin_id uuid,
  _target_username text,
  _version text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _target_id uuid;
  _target_nickname text;
begin
  if not exists (select 1 from public.profiles where id = _admin_id and username = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select id, nickname into _target_id, _target_nickname
  from public.profiles where username = _target_username;

  if _target_id is null then
    return jsonb_build_object('ok', false, 'error', 'Пользователь не найден');
  end if;

  update public.profiles
  set oobe_version = _version
  where id = _target_id;

  if _version is null or _version = '' then
    return jsonb_build_object(
      'ok', true,
      'username', _target_username,
      'nickname', _target_nickname,
      'message', 'OOBE версии снята с @' || _target_username || ' — вернётся обычная логика'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'username', _target_username,
    'nickname', _target_nickname,
    'message', 'OOBE версии ' || _version || ' назначена @' || _target_username || ' — покажется при следующем входе'
  );
end;
$$;


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_20_ota_rebuild.sql
-- ------------------------------------------------------------
-- =============================================================
-- WinChat update 20: пересборка APK с той же версией через OTA
-- ------------------------------------------------------------
-- Проблема:
--   Тестер поставил 6.0.0-closed-beta, админ пересобрал APK с той же
--   версией → клиент считал версии равными и не предлагал обновление.
--   Приходилось поднимать суффикс (beta → beta2 → beta3 …).
--
-- Что делает:
--   winchat_search_ota теперь возвращает updated_at записи OTA
--   (он автоматически ставится в now() при каждом /set ota).
--   Клиент предлагает установку, если:
--     - версия OTA строго новее установленной (semver), ИЛИ
--     - запись OTA перезаливали (updated_at изменился) после того,
--       как пользователь ставил прошлую пересборку.
--
--   Итог: APK можно пересобирать сколько угодно раз в день с той же
--   версией — достаточно после каждой пересборки повторить
--   /set ota "https://…apk" 6.0.0-closed-beta, и тестеры снова
--   увидят «Доступно обновление».
--
-- Запускать в Supabase SQL Editor вручную.
-- =============================================================

-- ------------------------------------------------------------
-- RPC: поиск OTA-обновления для устройства (+ updated_at)
-- ------------------------------------------------------------
drop function if exists public.winchat_search_ota(text);
create or replace function public.winchat_search_ota(_device_id text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _url     text;
  _version text;
  _target  text;
  _updated timestamptz;
  _allowed boolean := false;
begin
  select url, version, target, updated_at
    into _url, _version, _target, _updated
    from public.winchat_ota
    where id = true;

  if _url is null or length(trim(_url)) = 0 then
    return jsonb_build_object('ok', true, 'available', false);
  end if;

  -- Без цели (NULL / пусто / *) обновление доступно всем.
  if _target is null or length(trim(_target)) = 0 or trim(_target) = '*' then
    _allowed := true;
  elsif _device_id is not null and trim(_target) = trim(_device_id) then
    _allowed := true;
  elsif left(trim(_target), 1) = '@' then
    -- Цель — username. Ищем, кому принадлежит это устройство.
    select exists (
      select 1
      from public.winchat_devices d
      join public.profiles p on p.id = d.user_id
      where d.device_id = _device_id
        and lower(p.username) = lower(replace(trim(_target), '@', ''))
    ) into _allowed;
  end if;

  if not _allowed then
    return jsonb_build_object('ok', true, 'available', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'available', true,
    'url', _url,
    'version', _version,
    'target', coalesce(nullif(trim(_target), ''), '*'),
    'updated_at', _updated
  );
end;
$$;

grant execute on function public.winchat_search_ota(text) to anon, authenticated;

-- =============================================================
-- Готово. Порядок работы с пересборками:
--   1. Пересобрал APK → выложил на GitHub Releases.
--   2. Повторил /set ota "ссылка" "6.0.0-closed-beta" (версию менять не нужно).
--   3. updated_at обновился → у тестеров снова появилась плашка обновления.
-- =============================================================


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_21_ota7_note.sql
-- ------------------------------------------------------------
-- =============================================================
-- WinChat update 21: описание OTA (`--note`) в экране обновления 7.x
-- ------------------------------------------------------------
-- Запускать в Supabase SQL Editor вручную.
--
-- Команды админа (работают обе):
--   /set ota https://ссылка.com/winchat.apk 7.0.0-closed-beta --note В версии 7.0 было добавлено...
--   /set ota @admin https://ссылка.com/winchat.apk 7.0.0-closed-beta --note "В версии 7.0 было добавлено..."
--
-- Подходит для любых версий, начинающихся с 7:
--   7.0.0-closed-beta · 7.0.0-beta · 7.0.0-release · 7.0.0
--
-- Что делает:
--   1. Гарантирует колонку winchat_ota.description (из update 17).
--   2. Пересоздаёт winchat_search_ota, чтобы клиент получал описание
--      вместе с URL/версией и мог показать красивый экран обновления.
-- =============================================================

alter table public.winchat_ota
  add column if not exists description text;

drop function if exists public.winchat_search_ota(text);
create or replace function public.winchat_search_ota(_device_id text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _url     text;
  _version text;
  _target  text;
  _desc    text;
  _updated timestamptz;
  _allowed boolean := false;
begin
  select url, version, target, description, updated_at
    into _url, _version, _target, _desc, _updated
    from public.winchat_ota
    where id = true;

  if _url is null or length(trim(_url)) = 0 then
    return jsonb_build_object('ok', true, 'available', false);
  end if;

  -- Без цели (NULL / пусто / *) обновление доступно всем.
  if _target is null or length(trim(_target)) = 0 or trim(_target) = '*' then
    _allowed := true;
  elsif _device_id is not null and trim(_target) = trim(_device_id) then
    _allowed := true;
  elsif left(trim(_target), 1) = '@' then
    -- Цель — username (например @admin).
    select exists (
      select 1
      from public.winchat_devices d
      join public.profiles p on p.id = d.user_id
      where d.device_id = _device_id
        and lower(p.username) = lower(replace(trim(_target), '@', ''))
    ) into _allowed;
  end if;

  if not _allowed then
    return jsonb_build_object('ok', true, 'available', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'available', true,
    'url', _url,
    'version', _version,
    'target', coalesce(nullif(trim(_target), ''), '*'),
    'description', _desc,
    'updated_at', _updated
  );
end;
$$;

grant execute on function public.winchat_search_ota(text) to anon, authenticated;

-- =============================================================
-- Готово. После /set ota клиент с версией 7.x увидит экран:
--   логотип в круге → красный «WinChat 7.0» → «Доступно обновление»
--   → описание из --note → зелёная кнопка «Установить» → прогресс.
-- =============================================================


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_22_beta_ota.sql
-- ------------------------------------------------------------
-- =============================================================
-- WinChat update 22: OTA-каналы beta/full + заявки на бета-тест
-- ------------------------------------------------------------
-- Запускать в Supabase SQL Editor вручную.
--
-- Формат команд админа (новый):
--   /set ota https://update.com/winchat.apk beta 7.0.0-closed-beta
--   /set ota https://update.com/winchat.apk full 7.0.0-closed-beta
--
-- Старые вызовы RPC без _channel продолжают работать как full.
-- Beta-OTA видят только устройства пользователей, которым админ
-- принял заявку (таблица public.winchat_beta_access).
-- =============================================================

-- ------------------------------------------------------------
-- 1. Два канала OTA (по одной записи на канал)
-- ------------------------------------------------------------
create table if not exists public.winchat_ota_channels (
  channel     text primary key check (channel in ('beta', 'full')),
  url         text not null,
  version     text,
  target      text,
  description text,
  updated_at  timestamptz not null default now()
);

-- Переносим существующую запись в канал full.
insert into public.winchat_ota_channels (channel, url, version, target, description, updated_at)
select 'full', url, version, target, description, updated_at
  from public.winchat_ota
  where id = true
on conflict (channel) do nothing;

alter table public.winchat_ota_channels enable row level security;

-- ------------------------------------------------------------
-- 2. Заявки и доступ к бета-программе
-- ------------------------------------------------------------
create table if not exists public.winchat_beta_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  device_id         text,
  requested_version text,
  status            text not null default 'pending'
                      check (status in ('pending', 'accepted', 'rejected')),
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.profiles(id) on delete set null,
  review_note       text
);

create unique index if not exists winchat_beta_requests_pending_uidx
  on public.winchat_beta_requests (user_id) where status = 'pending';

create table if not exists public.winchat_beta_access (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.winchat_beta_requests enable row level security;
alter table public.winchat_beta_access enable row level security;

-- Админ видит новые заявки без перезагрузки (in-app «бот»).
do $$
begin
  alter publication supabase_realtime add table public.winchat_beta_requests;
exception
  when duplicate_object then null;
  when others then
    if sqlstate <> '42710' then raise; end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.winchat_beta_access;
exception
  when duplicate_object then null;
  when others then
    if sqlstate <> '42710' then raise; end if;
end $$;

-- ------------------------------------------------------------
-- 3. Статус беты для пользователя
-- ------------------------------------------------------------
drop function if exists public.winchat_get_beta_status();
create or replace function public.winchat_get_beta_status()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _uid      uuid := auth.uid();
  _status   text := 'none';
  _version  text;
  _updated  timestamptz;
  _accepted boolean := false;
begin
  if _uid is null then
    return jsonb_build_object('ok', false, 'status', 'none');
  end if;

  select true into _accepted
    from public.winchat_beta_access
    where user_id = _uid and revoked_at is null
    limit 1;
  _accepted := coalesce(_accepted, false);

  select r.status, r.requested_version, r.created_at
    into _status, _version, _updated
    from public.winchat_beta_requests r
    where r.user_id = _uid
    order by r.created_at desc
    limit 1;

  if _accepted then
    select 'accepted', a.granted_at into _status, _updated
      from public.winchat_beta_access a
      where a.user_id = _uid and a.revoked_at is null
      limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', coalesce(_status, 'none'),
    'version', _version,
    'updated_at', _updated,
    'accepted', _accepted
  );
end;
$$;

grant execute on function public.winchat_get_beta_status() to authenticated;

-- ------------------------------------------------------------
-- 4. Пользователь запрашивает участие (кнопка «Активировать…»)
-- ------------------------------------------------------------
drop function if exists public.winchat_request_beta_access(text);
create or replace function public.winchat_request_beta_access(
  _version text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _uid      uuid := auth.uid();
  _accepted boolean := false;
  _status   text;
  _version2 text := nullif(trim(_version), '');
begin
  if _uid is null then
    return jsonb_build_object('ok', false, 'error', 'Нужно войти в WinChat');
  end if;

  select true into _accepted
    from public.winchat_beta_access
    where user_id = _uid and revoked_at is null
    limit 1;

  if coalesce(_accepted, false) then
    return jsonb_build_object(
      'ok', true, 'status', 'accepted',
      'message', 'Вы уже приняты в бета-программу'
    );
  end if;

  insert into public.winchat_beta_requests (user_id, device_id, requested_version, status)
  values (
    _uid,
    null,
    _version2,
    'pending'
  )
  on conflict (user_id) where status = 'pending' do update set
    requested_version = excluded.requested_version,
    created_at = now()
  returning status into _status;

  -- device_id берём из последнего зарегистрированного устройства,
  -- чтобы админ видел модель/платформу в заявке.
  update public.winchat_beta_requests r
     set device_id = d.device_id
    from (
      select device_id, user_id, row_number() over (
        partition by user_id order by last_seen desc
      ) as rn
      from public.winchat_devices
    ) d
   where r.user_id = _uid
     and r.status = 'pending'
     and d.user_id = r.user_id
     and d.rn = 1
     and r.device_id is distinct from d.device_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'version', _version2,
    'message', 'Заявка отправлена admin. Ожидайте решения'
  );
end;
$$;

grant execute on function public.winchat_request_beta_access(text) to authenticated;

-- ------------------------------------------------------------
-- 5. In-app «бот» админа: список заявок
-- ------------------------------------------------------------
drop function if exists public.winchat_admin_list_beta_requests(uuid, text);
create or replace function public.winchat_admin_list_beta_requests(
  _admin_id uuid,
  _status   text default 'pending'
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _rows jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'user_id', r.user_id,
      'username', p.username,
      'nickname', p.nickname,
      'device_id', r.device_id,
      'platform', d.platform,
      'model', d.model,
      'manufacturer', d.manufacturer,
      'os_version', d.os_version,
      'app_version', d.app_version,
      'requested_version', r.requested_version,
      'days_in_winchat', floor(extract(epoch from (now() - p.created_at)) / 86400)::int,
      'created_at', r.created_at,
      'status', r.status,
      'review_note', r.review_note
    ) order by r.created_at desc), '[]'::jsonb)
    into _rows
    from public.winchat_beta_requests r
    join public.profiles p on p.id = r.user_id
    left join lateral (
      select dd.device_id, dd.platform, dd.model, dd.manufacturer,
             dd.os_version, dd.app_version, dd.last_seen
        from public.winchat_devices dd
       where dd.user_id = r.user_id
         and (r.device_id is null or dd.device_id = r.device_id)
       order by dd.last_seen desc
       limit 1
    ) d on true
   where (_status = 'all' or r.status = _status);

  return jsonb_build_object('ok', true, 'requests', _rows);
end;
$$;

grant execute on function public.winchat_admin_list_beta_requests(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. In-app «бот» админа: принять / отклонить
-- ------------------------------------------------------------
drop function if exists public.winchat_admin_review_beta_request(uuid, uuid, boolean, text);
create or replace function public.winchat_admin_review_beta_request(
  _admin_id   uuid,
  _request_id uuid,
  _accept     boolean,
  _note       text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _uid       uuid;
  _new_status text;
  _admin_name text;
begin
  select username into _admin_name
    from public.profiles
   where id = _admin_id and lower(username) = 'admin';

  if _admin_name is null then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select user_id into _uid
    from public.winchat_beta_requests
   where id = _request_id and status = 'pending';

  if _uid is null then
    return jsonb_build_object('ok', false, 'error', 'Заявка не найдена или уже обработана');
  end if;

  _new_status := case when _accept then 'accepted' else 'rejected' end;

  update public.winchat_beta_requests
     set status = _new_status,
         reviewed_at = now(),
         reviewed_by = _admin_id,
         review_note = nullif(trim(_note), '')
   where id = _request_id;

  if _accept then
    insert into public.winchat_beta_access (user_id, granted_by, granted_at, revoked_at)
    values (_uid, _admin_id, now(), null)
    on conflict (user_id) do update set
      granted_by = excluded.granted_by,
      granted_at = now(),
      revoked_at = null;
  end if;

  insert into public.admin_audit (admin_id, admin_username, target_id, action, details)
  values (
    _admin_id,
    _admin_name,
    _uid,
    case when _accept then 'beta_accept' else 'beta_reject' end,
    coalesce(nullif(trim(_note), ''), 'Заявка на бета-тест ' || _request_id::text)
  );

  return jsonb_build_object(
    'ok', true,
    'status', _new_status,
    'message', case when _accept then 'Пользователь принят в бета-программу' else 'Заявка отклонена' end
  );
end;
$$;

grant execute on function public.winchat_admin_review_beta_request(uuid, uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- 7. OTA: каналы beta/full (старые вызовы = full)
-- ------------------------------------------------------------
drop function if exists public.set_winchat_ota(uuid, text, text, text, text);
drop function if exists public.set_winchat_ota(uuid, text, text, text, text, text);
create or replace function public.set_winchat_ota(
  _admin_id uuid,
  _url      text,
  _version  text default null,
  _target   text default null,
  _desc     text default null,
  _channel  text default 'full'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  _clean_url     text := nullif(trim(_url), '');
  _clean_version text := nullif(trim(_version), '');
  _clean_target  text := nullif(trim(_target), '');
  _clean_desc    text := nullif(trim(_desc), '');
  _ch            text := lower(coalesce(nullif(trim(_channel), ''), 'full'));
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  if _ch not in ('beta', 'full') then
    return jsonb_build_object('ok', false, 'error', 'Канал должен быть beta или full');
  end if;

  if _clean_desc is not null and length(_clean_desc) > 500 then
    return jsonb_build_object('ok', false, 'error', 'Описание слишком длинное (макс. 500 символов)');
  end if;

  if _clean_url is null then
    delete from public.winchat_ota_channels where channel = _ch;
    return jsonb_build_object(
      'ok', true,
      'message', case when _ch = 'beta' then 'Beta-OTA отключено' else 'OTA-обновление отключено' end,
      'channel', _ch
    );
  end if;

  if _clean_url !~* '^https?://' or length(_clean_url) > 2048 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ссылка должна начинаться с http:// или https://'
    );
  end if;

  if _clean_version is not null
     and _clean_version !~ '^[0-9]+\.[0-9]+(\.[0-9]+)?(-[0-9A-Za-z][0-9A-Za-z.\-]*)?(\+[0-9A-Za-z.\-]+)?$'
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'Неверный формат версии. Пример: 3.1.0 или 7.0.0-closed-beta'
    );
  end if;

  if _clean_target is not null and length(_clean_target) > 128 then
    return jsonb_build_object('ok', false, 'error', 'Слишком длинная цель (device_id / @username)');
  end if;

  insert into public.winchat_ota_channels (channel, url, version, target, description, updated_at)
  values (_ch, _clean_url, _clean_version, _clean_target, _clean_desc, now())
  on conflict (channel) do update set
    url         = excluded.url,
    version     = excluded.version,
    target      = excluded.target,
    description = excluded.description,
    updated_at  = now();

  return jsonb_build_object(
    'ok', true,
    'message', case when _ch = 'beta' then 'Beta-OTA настроено' else 'OTA-обновление настроено' end,
    'channel', _ch,
    'url', _clean_url,
    'version', _clean_version,
    'target', coalesce(_clean_target, '*'),
    'description', _clean_desc
  );
end;
$$;

grant execute on function public.set_winchat_ota(uuid, text, text, text, text, text) to authenticated;

drop function if exists public.get_winchat_ota(uuid);
drop function if exists public.get_winchat_ota(uuid, text);
create or replace function public.get_winchat_ota(
  _admin_id uuid,
  _channel  text default 'full'
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _ch      text := lower(coalesce(nullif(trim(_channel), ''), 'full'));
  _url     text;
  _version text;
  _target  text;
  _desc    text;
  _updated timestamptz;
begin
  if not exists (
    select 1 from public.profiles
    where id = _admin_id and lower(username) = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Доступ запрещён');
  end if;

  select url, version, target, description, updated_at
    into _url, _version, _target, _desc, _updated
    from public.winchat_ota_channels
   where channel = _ch;

  return jsonb_build_object(
    'ok', true,
    'channel', _ch,
    'url', _url,
    'version', _version,
    'target', coalesce(_target, '*'),
    'description', _desc,
    'updated_at', _updated
  );
end;
$$;

grant execute on function public.get_winchat_ota(uuid, text) to authenticated;

drop function if exists public.winchat_search_ota(text);
drop function if exists public.winchat_search_ota(text, text);
create or replace function public.winchat_search_ota(
  _device_id text,
  _channel   text default 'full'
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  _ch      text := lower(coalesce(nullif(trim(_channel), ''), 'full'));
  _url     text;
  _version text;
  _target  text;
  _desc    text;
  _updated timestamptz;
  _allowed boolean := false;
  _beta_ok boolean := false;
begin
  if _ch not in ('beta', 'full') then
    _ch := 'full';
  end if;

  select url, version, target, description, updated_at
    into _url, _version, _target, _desc, _updated
    from public.winchat_ota_channels
   where channel = _ch;

  if _url is null or length(trim(_url)) = 0 then
    return jsonb_build_object('ok', true, 'available', false, 'channel', _ch);
  end if;

  -- Канал beta: обновление увидят только принятые в бета-программу.
  -- Основная проверка — по устройству (Android). Для веба/теста используем
  -- привязку к текущему пользователю: accepted-запись в winchat_beta_access.
  if _ch = 'beta' then
    select exists (
      select 1
        from public.winchat_devices d
        join public.winchat_beta_access a
          on a.user_id = d.user_id and a.revoked_at is null
       where d.device_id = _device_id
    ) into _beta_ok;

    if not coalesce(_beta_ok, false) then
      select exists (
        select 1
          from public.winchat_beta_access a
         where a.user_id = auth.uid() and a.revoked_at is null
      ) into _beta_ok;
    end if;

    if not coalesce(_beta_ok, false) then
      return jsonb_build_object('ok', true, 'available', false, 'channel', _ch);
    end if;
  end if;

  if _target is null or length(trim(_target)) = 0 or trim(_target) = '*' then
    _allowed := true;
  elsif _device_id is not null and trim(_target) = trim(_device_id) then
    _allowed := true;
  elsif left(trim(_target), 1) = '@' then
    select exists (
      select 1
        from public.profiles p
       where lower(p.username) = lower(replace(trim(_target), '@', ''))
         and (
           p.id = auth.uid()
           or exists (
             select 1 from public.winchat_devices d
              where d.user_id = p.id and d.device_id = _device_id
           )
         )
    ) into _allowed;
  end if;

  if not coalesce(_allowed, false) then
    return jsonb_build_object('ok', true, 'available', false, 'channel', _ch);
  end if;

  return jsonb_build_object(
    'ok', true,
    'available', true,
    'channel', _ch,
    'url', _url,
    'version', _version,
    'target', coalesce(nullif(trim(_target), ''), '*'),
    'description', _desc,
    'updated_at', _updated
  );
end;
$$;

grant execute on function public.winchat_search_ota(text, text) to anon, authenticated;

-- =============================================================
-- Готово.
--   Пользователь: кнопка «Активировать бета программу» → заявка.
--   Admin: /get beta requests → /beta accept <id> → у пользователя
--   статус «вы приняты» и отдельная кнопка проверки бета-обновлений.
--   Основной канал обновлений при этом остаётся full.
-- =============================================================


-- ------------------------------------------------------------
-- FILE: sql\winchat_update_23_server_balancing.sql
-- ------------------------------------------------------------
-- ============================================================
--  WinChat 7.0.1 — глобальный балансировщик регистраций
--  Проект: СЕРВЕР 1 (https://iksgubxxxspkjwsazrwq.supabase.co)
--
--  Выполнить в Dashboard → SQL Editor → New query → Run
--  На сервере 2 выполнять НЕ обязательно: счётчик читается только с сервера 1.
--  Все аккаунты сервера 2 зеркалятся на сервер 1, поэтому общие профили,
--  чаты и сообщения остаются в одной базе и пользователи видят друг друга.
--
--  Даёт честное чередование между проектами для ВСЕХ устройств:
--    1–5   регистрация → сервер 1
--    6–10  регистрация → сервер 2
--    11–15 снова сервер 1 и т.д.
--  Счётчик общий, а не локальный в браузере.
-- ============================================================

create table if not exists public.winchat_registration_counter (
  id boolean primary key default true check (id),
  value bigint not null default 0
);

insert into public.winchat_registration_counter (id, value)
values (true, 0)
on conflict (id) do nothing;

alter table public.winchat_registration_counter enable row level security;

-- Прямого доступа нет: только security-definer функция ниже.
-- Политик намеренно не создаём.

create or replace function public.winchat_next_registration_server()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _n bigint;
begin
  update public.winchat_registration_counter
     set value = value + 1
   where id = true
  returning value into _n;

  -- 5 на сервер 1, следующие 5 на сервер 2, дальше по кругу.
  if ((coalesce(_n, 1) - 1) % 10) < 5 then
    return 'server1';
  end if;
  return 'server2';
end;
$$;

revoke all on function public.winchat_next_registration_server() from public;
grant execute on function public.winchat_next_registration_server() to anon, authenticated;

notify pgrst, 'reload schema';


-- ------------------------------------------------------------
-- FILE: supabase\migrations\20260320_add_is_winchat_legacy.sql
-- ------------------------------------------------------------
-- WinChat: per-user legacy UI flag
-- /set legacy @username  -> is_winchat_legacy_true  (force base/legacy UI)
-- /del legacy @username  -> is_winchat_legacy_false (new UI)
-- default: is_winchat_legacy_false

alter table public.profiles
  add column if not exists is_winchat_legacy text not null default 'is_winchat_legacy_false';

-- Optional: constrain allowed values (safe to re-run)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_is_winchat_legacy_check'
  ) then
    alter table public.profiles
      add constraint profiles_is_winchat_legacy_check
      check (is_winchat_legacy in ('is_winchat_legacy_true', 'is_winchat_legacy_false'));
  end if;
end $$;

comment on column public.profiles.is_winchat_legacy is
  'WinChat UI mode override: is_winchat_legacy_true = force legacy/base UI, is_winchat_legacy_false = new UI (default).';

