import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { devServerConnect } from "./devLogs";

/** Сервер 1 — основной, там живут все прежние аккаунты. */
export const SUPABASE_URL = "https://iksgubxxxspkjwsazrwq.supabase.co";
export const SUPABASE_KEY = "sb_publishable_uEwTj3pmRCCbVg4HaQFeOg_GFmVoaHl";

/** Сервер 2 — второй endpoint аутентификации; аккаунты зеркалятся на сервер 1. */
export const SUPABASE_URL_2 = "https://bjsjvozhkjktowqizidj.supabase.co";
export const SUPABASE_KEY_2 = "sb_publishable_pQsDC-YJAlRMTtK1KrZrfg_mANAtL7B";

devServerConnect(1, "system_info");

/** Синтетическая почта из username — Supabase Auth требует email. */
export const emailFor = (username: string) => `${username.toLowerCase()}@winchat.app`;

export type ServerId = "server1" | "server2";

export interface WinChatServer {
  id: ServerId;
  url: string;
  key: string;
  label: string;
}

export const SERVERS: WinChatServer[] = [
  { id: "server1", url: SUPABASE_URL, key: SUPABASE_KEY, label: "Сервер 1" },
  { id: "server2", url: SUPABASE_URL_2, key: SUPABASE_KEY_2, label: "Сервер 2" },
];

/**
 * Все общие данные — профили, чаты, сообщения, OTA — живут на сервере 1.
 * Сервер 2 принимает часть регистраций, но каждый такой аккаунт зеркалится
 * на сервер 1 с тем же username/паролем. Сессия приложения всегда берётся
 * на сервере 1, поэтому пользователи обоих серверов видят друг друга,
 * состоят в одних группах и читают одни и те же сообщения.
 */
export const DATA_SERVER: ServerId = "server1";
const AUTH_SERVER_PREFIX = "winchat_auth_server:";

const ACTIVE_SERVER_KEY = "winchat_active_server";
const REG_COUNT_KEY = "winchat_registration_count";
/** По 5 регистраций на сервер, потом снова на первый. */
const REG_BATCH_SIZE = 5;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* no-op: приватный режим браузера */
  }
}

/** Последний сервер, через который входили (только для будущего логина). */
export function getActiveServerId(): ServerId {
  return storageGet(ACTIVE_SERVER_KEY) === "server2" ? "server2" : "server1";
}

export function setActiveServerId(id: ServerId): void {
  storageSet(ACTIVE_SERVER_KEY, id);
}

/** Какой сервер аутентификации использовать для конкретного username. */
export function getPreferredAuthServer(username: string): ServerId {
  const value = storageGet(AUTH_SERVER_PREFIX + username.trim().toLowerCase());
  return value === "server2" ? "server2" : "server1";
}

export function setPreferredAuthServer(username: string, id: ServerId): void {
  storageSet(AUTH_SERVER_PREFIX + username.trim().toLowerCase(), id);
  setActiveServerId(id);
}

export function getServer(id: ServerId): WinChatServer {
  return SERVERS.find((s) => s.id === id) ?? SERVERS[0];
}

const clientCache = new Map<ServerId, SupabaseClient>();

/** Клиент конкретного сервера (с кэшем на время сессии). */
export function getClient(id: ServerId = DATA_SERVER): SupabaseClient {
  const cached = clientCache.get(id);
  if (cached) return cached;

  const server = getServer(id);
  const client = createClient(server.url, server.key, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: {
      /** Сессия должна переживать перезагрузку ПК/браузера и «возврат на сайт». */
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  clientCache.set(id, client);
  return client;
}

/** Клиент данных. Все profile/chat/message/OTA-запросы идут сюда. */
export function getActiveClient(): SupabaseClient {
  return getClient(DATA_SERVER);
}

/**
 * Обычный `supabase` во всём приложении всегда указывает на сервер 1 —
 * общую базу данных. Благодаря прокси не нужно править 20 файлов: старый
 * код `.from()`, `.rpc()`, `.storage`, `.auth` работает как раньше.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient(DATA_SERVER);
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Сессия приложения — всегда сессия сервера 1 (общая база). */
export function onAnyAuthStateChange(
  cb: (event: AuthChangeEvent, session: Session | null) => void
): { data: { subscription: { unsubscribe: () => void } } } {
  const subscription = getClient(DATA_SERVER).auth.onAuthStateChange(cb).data.subscription;
  return { data: { subscription } };
}

/** Сколько успешных регистраций уже сделано (для отладки/статистики). */
export function getRegistrationCount(): number {
  const n = Number(storageGet(REG_COUNT_KEY) ?? "0");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Куда попадёт следующая регистрация: 5 на первый, 5 на второй, цикл.
 * Счётчик глобальный — лежит на сервере 1 в таблице
 * winchat_registration_counter. Если SQL ещё не применён или сервер 1
 * недоступен, используем локальный счётчик как запасной вариант.
 */
export async function nextRegistrationServer(): Promise<ServerId> {
  try {
    const { data, error } = await getClient("server1").rpc(
      "winchat_next_registration_server"
    );
    if (!error && (data === "server1" || data === "server2")) return data;
  } catch {
    /* fallback ниже */
  }
  const slot = getRegistrationCount() % (REG_BATCH_SIZE * 2);
  return slot < REG_BATCH_SIZE ? "server1" : "server2";
}

function bumpRegistrationCount(): void {
  storageSet(REG_COUNT_KEY, String(getRegistrationCount() + 1));
}

/** Имя занято, если есть хоть в одном из двух проектов. */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const clean = username.trim().toLowerCase();
  for (const server of SERVERS) {
    const { data } = await getClient(server.id)
      .from("profiles")
      .select("id")
      .ilike("username", clean)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}

export interface RegisterAccountResult {
  ok: boolean;
  server: ServerId;
  user: User | null;
  session: Session | null;
  winpass: string;
  error: unknown | null;
  notice: string | null;
}

const CONFIRM_EMAIL_NOTICE =
  "Аккаунт создан. Осталось отключить «Confirm email»: Supabase → Authentication → Sign In / Providers → Email → Save. После этого входите.";

/** Универсальный signUp: если аккаунт уже есть — просто логинимся с тем же паролем. */
async function upsertAuthAccount(
  client: SupabaseClient,
  email: string,
  password: string,
  username: string,
  nickname: string
): Promise<{
  user: User | null;
  session: Session | null;
  error: unknown | null;
  emailNotConfirmed: boolean;
}> {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { username, nickname } },
  });

  const identities = data?.user?.identities as unknown[] | undefined;
  const hiddenExisting =
    !error && !!data?.user && !data.session && Array.isArray(identities) && identities.length === 0;
  const raw = String((error as { message?: string } | null)?.message ?? "");
  const knownExisting =
    !!error && /already registered|user_already_exists|already exists/i.test(raw);

  if (!error && !hiddenExisting) {
    return { user: data.user ?? null, session: data.session ?? null, error: null, emailNotConfirmed: false };
  }
  if (error && !knownExisting) {
    return { user: null, session: null, error, emailNotConfirmed: false };
  }

  const { data: signed, error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (!signErr) {
    return { user: signed.user ?? null, session: signed.session ?? null, error: null, emailNotConfirmed: false };
  }
  if (/email not confirmed/i.test(String((signErr as { message?: string })?.message ?? ""))) {
    return { user: null, session: null, error: null, emailNotConfirmed: true };
  }
  return { user: null, session: null, error: signErr, emailNotConfirmed: false };
}

/**
 * Регистрация. Аккаунт создаётся на сервере из текущей пачки (5/5), затем
 * обязательно зеркалится на сервер данных. Сессия возвращается с сервера 1 —
 * только она даёт доступ к общим чатам, группам и профилям.
 */
export async function registerAccount(options: {
  username: string;
  password: string;
  nickname: string;
}): Promise<RegisterAccountResult> {
  const authServer = await nextRegistrationServer();
  const email = emailFor(options.username);
  const username = options.username.trim().toLowerCase();
  const nickname = options.nickname.trim();
  const empty = (): RegisterAccountResult => ({
    ok: false,
    server: authServer,
    user: null,
    session: null,
    winpass: "",
    error: null,
    notice: null,
  });

  try {
    const primary = await upsertAuthAccount(
      getClient(authServer),
      email,
      options.password,
      username,
      nickname
    );
    if (primary.emailNotConfirmed) return { ...empty(), notice: CONFIRM_EMAIL_NOTICE };
    if (primary.error) return { ...empty(), error: primary.error };

    let dataSession = primary.session;
    if (authServer !== DATA_SERVER) {
      const mirror = await upsertAuthAccount(
        getClient(DATA_SERVER),
        email,
        options.password,
        username,
        nickname
      );
      if (mirror.emailNotConfirmed) return { ...empty(), notice: CONFIRM_EMAIL_NOTICE };
      if (mirror.error) return { ...empty(), error: mirror.error };
      dataSession = mirror.session;
    }

    if (!dataSession) {
      const { data: signed, error: signErr } = await getClient(DATA_SERVER).auth.signInWithPassword({
        email,
        password: options.password,
      });
      if (signErr) {
        if (/email not confirmed/i.test(String((signErr as { message?: string })?.message ?? ""))) {
          return { ...empty(), notice: CONFIRM_EMAIL_NOTICE };
        }
        return { ...empty(), error: signErr };
      }
      dataSession = signed.session;
    }

    bumpRegistrationCount();
    setPreferredAuthServer(username, authServer);

    /* WinPass канонический — тот, что выдал триггер на сервере данных. */
    let winpass = "";
    const uid = dataSession.user?.id ?? primary.user?.id;
    if (uid) {
      for (let attempt = 0; attempt < 5 && !winpass; attempt++) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("winpass")
          .eq("id", uid)
          .maybeSingle();
        winpass = (prof as { winpass?: string } | null)?.winpass || "";
        if (!winpass) await new Promise((r) => setTimeout(r, 400));
      }
    }

    return {
      ok: true,
      server: authServer,
      user: dataSession.user ?? primary.user ?? null,
      session: dataSession,
      winpass,
      error: null,
      notice: null,
    };
  } catch (error) {
    return { ...empty(), error };
  }
}

export interface LoginAccountResult {
  ok: boolean;
  server: ServerId;
  error: unknown | null;
}

/** Вход: проверяем пароль на обоих серверах, сессию приложения берём на сервере данных. */
export async function loginAccount(
  username: string,
  password: string
): Promise<LoginAccountResult> {
  const email = emailFor(username);
  const clean = username.trim().toLowerCase();
  const preferred = getPreferredAuthServer(clean);
  const order: ServerId[] = preferred === "server2" ? ["server2", "server1"] : ["server1", "server2"];
  let lastError: unknown = null;

  for (const server of order) {
    const { error } = await getClient(server).auth.signInWithPassword({ email, password });
    if (error) {
      lastError = error;
      continue;
    }

    setPreferredAuthServer(clean, server);

    /* Сессия приложения всегда на сервере 1 — иначе чаты и профили не общие. */
    const dataSignIn = await getClient(DATA_SERVER).auth.signInWithPassword({ email, password });
    if (dataSignIn.error) {
      const mirror = await upsertAuthAccount(
        getClient(DATA_SERVER),
        email,
        password,
        clean,
        clean
      );
      if (mirror.error) return { ok: false, server, error: mirror.error };
    }
    return { ok: true, server, error: null };
  }

  return { ok: false, server: getActiveServerId(), error: lastError };
}

export type VerifyLevel = "user" | "grey" | "green" | "full";

export interface Profile {
  id: string;
  username: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  verified?: boolean | null;
  verify_status?: VerifyLevel;
  winpass?: string | null;
  winpro_until?: string | null;
  /** WinChat Glass: 'is_winchat_glass_true' — доступ есть, иначе 'is_winchat_glass_no'. */
  is_winchat_glass?: string | null;
  /** Принудительный базовый интерфейс (legacy): 'is_winchat_legacy_true' | 'is_winchat_legacy_false'. */
  is_winchat_legacy?: string | null;
  /** OOBE какой версии показать пользователю при следующем входе
   *  («5.0», «6.0» и т.д.). Пусто/null — обычная логика OOBE. */
  oobe_version?: string | null;
  /** Выданные бейджи: коды через запятую, например «1» или «1,2». */
  badges?: string | null;
  created_at: string;
}

/** Аккаунты, которым галочка положена всегда. */
export const ALWAYS_VERIFIED = ["admin", "winchat"];

/** Активна ли подписка WinPro (базовая серая галочка и корона). */
export const isWinProActive = (p?: Profile | null): boolean => {
  if (!p?.winpro_until) return false;
  return new Date(p.winpro_until) > new Date();
};

/** Есть ли у профиля доступ к WinChat Glass (флаг профиля). */
export const isGlassGranted = (p?: Profile | null): boolean =>
  p?.is_winchat_glass === "is_winchat_glass_true";

/** Принудительный базовый (legacy) интерфейс для пользователя. */
export const isWinChatLegacy = (p?: Profile | null): boolean =>
  p?.is_winchat_legacy === "is_winchat_legacy_true";

/** Уровень верификации пользователя (для галочек). */
export const verifyLevel = (p?: Profile | null): VerifyLevel => {
  if (!p) return "user";
  const lvl = (p.verify_status || "user") as VerifyLevel;
  // Системные аккаунты всегда "full"
  if (ALWAYS_VERIFIED.includes(p.username.toLowerCase())) return "full";
  // WinPro даёт базовую серую галочку
  if (lvl === "user" && isWinProActive(p)) return "grey";
  return lvl;
};

/** Есть ли у пользователя хоть какая-то галочка. */
export const isVerified = (p?: Profile | null): boolean => verifyLevel(p) !== "user";

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string | null;
  image_url: string | null;
  /** Стикер/GIF: файл лежит на sticker-сервере, здесь только ссылка. */
  sticker_url?: string | null;
  audio_url: string | null;
  audio_duration: number | null;
  video_url: string | null;
  video_duration: number | null;
  created_at: string;
  /** Когда сообщение было отредактировано (null — не редактировалось). */
  edited_at?: string | null;
}

export interface ChatRow {
  id: string;
  direct_key: string | null;
  is_group: boolean;
  title: string | null;
  description: string | null;
  avatar_url: string | null;
  created_by: string | null;
  updated_at: string;
  /** Канал: писать могут только владелец/админы. */
  is_channel?: boolean | null;
  /** Официальный канал WinChat — на него подписаны все, нельзя отписаться. */
  is_official?: boolean | null;
  /** Синяя галочка канала/группы. */
  verified?: boolean | null;
  /** Случайный код приглашения в группу/канал (ссылка /channel/invite/<code>). */
  invite_code?: string | null;
}

export interface ChatItem {
  id: string;
  isGroup: boolean;
  /** Канал: писать могут только владелец/админы. */
  isChannel?: boolean;
  /** Официальный канал WinChat (все подписаны, отписка запрещена). */
  isOfficial?: boolean;
  /** Синяя галочка канала/группы. */
  verified?: boolean;
  /** Роль текущего пользователя в чате: owner/admin/subscriber/member. */
  myRole?: string | null;
  /** Роли участников: user_id → role. */
  memberRoles?: Record<string, string>;
  /** Случайный код приглашения в группу/канал (для шаринга). */
  invite_code?: string | null;
  /** Отображаемое имя: никнейм собеседника или название группы */
  title: string;
  description: string | null;
  avatarUrl: string | null;
  /** Собеседник в личном чате, null — в группе */
  other: Profile | null;
  members: Profile[];
  ownerId: string | null;
  lastMessage: Message | null;
  updatedAt: string;
  /** Личный чат «Избранное» — заметки, которые видит только владелец. */
  isSaved?: boolean;
}

/** Глобальный администратор WinChat (@admin). */
export const isGlobalAdmin = (p?: Profile | null): boolean =>
  !!p && p.username.toLowerCase() === "admin";

/** Может ли пользователь писать в этот чат (в каналах — только админы). */
export const canPostInChat = (chat: ChatItem, me?: Profile | null): boolean => {
  if (!chat.isChannel) return true;
  if (isGlobalAdmin(me)) return true;
  if (chat.myRole === "owner" || chat.myRole === "admin") return true;
  return !!me && chat.ownerId === me.id;
};

/** Может ли пользователь управлять группой/каналом. */
export const canManageChat = (chat: ChatItem, me?: Profile | null): boolean => {
  if (!me) return false;
  if (isGlobalAdmin(me)) return true;
  if (chat.ownerId === me.id) return true;
  return !!chat.isChannel && (chat.myRole === "owner" || chat.myRole === "admin");
};

/** Ключ для градиента аватара */
export const chatSeed = (c: ChatItem) =>
  c.isSaved ? `saved-${c.id}` : c.isGroup ? `group-${c.id}` : c.other?.username || c.id;

/* ============================================================ */
/*  Admin types and helpers                                      */
/* ============================================================ */

export interface UserRow {
  id: string;
  username: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  verified: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  admin_id: string;
  admin_username: string;
  target_id: string;
  action: 'ban' | 'unban' | 'delete' | 'verify' | 'unverify' | 'edit' | 'impersonate' | 'resign';
  details: Record<string, unknown>;
  created_at: string;
  target_nickname?: string;
  target_username?: string;
}

/** Storage key for impersonation session override */
const IMPERSONATE_KEY = "winchat_impersonate";

interface ImpersonateSession {
  targetId: string;
  targetUsername: string;
  targetNickname: string;
  startedAt: number;
}

/** Get current impersonation session from localStorage */
export function getImpersonateSession(): ImpersonateSession | null {
  try {
    const raw = localStorage.getItem(IMPERSONATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImpersonateSession;
    // Auto-expire after 15 minutes
    if (Date.now() - parsed.startedAt > 15 * 60 * 1000) {
      clearImpersonateSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Set impersonation session in localStorage */
export function setImpersonateSession(targetId: string, targetUsername: string, targetNickname: string): void {
  const session: ImpersonateSession = {
    targetId,
    targetUsername,
    targetNickname,
    startedAt: Date.now(),
  };
  localStorage.setItem(IMPERSONATE_KEY, JSON.stringify(session));
}

/** Clear impersonation session from localStorage */
export function clearImpersonateSession(): void {
  localStorage.removeItem(IMPERSONATE_KEY);
}

/** Check if currently impersonating another user */
export function isImpersonating(): boolean {
  return getImpersonateSession() !== null;
}

/** Returns the effective user ID — impersonated target or actual auth user */
export function getEffectiveUserId(realUserId: string): string {
  const imp = getImpersonateSession();
  return imp?.targetId ?? realUserId;
}

/* ============================================================ */
/*  WinPass — код восстановления аккаунта (33b42-XXXXXXXX)      */
/* ============================================================ */

/** RPC: найти пользователя по WinPass на любом из двух серверов. */
export async function findWinpass(winpass: string): Promise<{
  ok: boolean;
  server?: ServerId;
  user_id?: string;
  username?: string;
  nickname?: string;
  temp_password?: string;
  error?: string;
}> {
  let lastError: unknown = null;
  const order: ServerId[] = [DATA_SERVER, ...SERVERS.map((s) => s.id).filter((id) => id !== DATA_SERVER)];

  for (const server of order) {
    try {
      const { data, error } = await getClient(server).rpc("login_by_winpass", {
        _winpass: winpass,
      });
      if (error) {
        lastError = error;
        continue;
      }
      const result = data as {
        ok?: boolean;
        user_id?: string;
        username?: string;
        nickname?: string;
        temp_password?: string;
        error?: string;
      } | null;
      if (result?.ok) return { ...result, ok: true, server };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return { ok: false, error: "not_found" };
}

/* ============================================================ */
/*  Приглашения в группы/каналы                                   */
/* ============================================================ */

/** RPC: найти чат по коду приглашения. */
export async function getChatByInvite(inviteCode: string): Promise<{
  ok: boolean;
  chat?: ChatItem | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("get_chat_by_invite", { _invite_code: inviteCode });
  if (error) throw error;
  const d = (data as any) ?? {};
  if (!d.ok) return { ok: false, error: d.error || "not_found" };
  return { ok: true, chat: (d.chat ?? null) as ChatItem | null };
}

/** Сгенерировать случайный числовой код приглашения. */
export function genInviteCode(): string {
  const min = 10000;
  const max = 330357;
  const n = min + Math.floor(Math.random() * Math.floor(max - min + 1));
  return String(n);
}

/**
 * Войти по WinPass без пароля:
 *   1. login_by_winpass (RPC security definer) -> проверяет код и ставит
 *      пароль аккаунта = временный ключ из кода, возвращает его
 *   2. signInWithPassword(username, temp_password)
 * Секретный ключ в браузере не используется — вся привилегия на стороне Postgres.
 */
export async function loginByWinpass(winpass: string): Promise<void> {
  const code = normalizeWinpass(winpass);
  const res = await findWinpass(code);
  if (!res.ok || !res.username || !res.temp_password) {
    throw new Error(res.error || "Неверный WinPass");
  }

  const authServer = res.server ?? DATA_SERVER;
  const username = res.username.trim().toLowerCase();
  const email = emailFor(username);

  /* Если код нашли только на сервере 2 — зеркалим аккаунт на сервер данных. */
  if (authServer !== DATA_SERVER) {
    const mirror = await upsertAuthAccount(
      getClient(DATA_SERVER),
      email,
      res.temp_password,
      username,
      username
    );
    if (mirror.error) throw new Error(String((mirror.error as { message?: string })?.message ?? mirror.error));
  }

  const { error: signErr } = await getClient(DATA_SERVER).auth.signInWithPassword({
    email,
    password: res.temp_password,
  });
  if (signErr) throw new Error(signErr.message);
  setPreferredAuthServer(username, authServer);
}

/**
 * Нормализовать ввод WinPass — канонический вид «33b42-xxxxxxxxxxxx».
 * Локально, чтобы не тянуть utils по кругу.
 */
export function normalizeWinpass(v: string): string {
  let s = v.trim().toLowerCase().replace(/\s+/g, "");
  if (s.startsWith("33b42")) s = s.slice(5).replace(/^-/, "");
  if (!/^[0-9a-f]{12}$/.test(s)) return "";
  return `33b42-${s}`;
}

/** RPC: получить свой WinPass. */
export async function getMyWinpass(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_winpass", { _user_id: userId });
  if (error) throw error;
  return data as string | null;
}

/** RPC: сгенерировать новый WinPass (сброс кода). */
export async function regenerateWinpass(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("regenerate_winpass", { _user_id: userId });
  if (error) throw error;
  return data as string;
}

/** Проверка пароля через вход: сессия при успехе гарантированно на сервере данных. */
export async function verifyPasswordFor(username: string, password: string): Promise<boolean> {
  return (await loginAccount(username, password)).ok;
}

