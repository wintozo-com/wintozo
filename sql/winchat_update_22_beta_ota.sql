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
