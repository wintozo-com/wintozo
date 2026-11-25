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
