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
