import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  AtSign,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  User,
} from "lucide-react";
import {
  isUsernameTaken,
  loginAccount,
  loginByWinpass,
  registerAccount,
  supabase,
} from "../lib/supabase";
import { rememberLegacyPassword } from "./LegacyScreen";
import { normalizeWinpass, validateNickname, validatePassword, validateUsername } from "../lib/utils";
void normalizeWinpass; // канонизация в supabase.loginByWinpass
import { cn } from "../utils/cn";
import { devLog } from "../lib/devLogs";
import {
  WinterSnow,
  WinterThemeToggle,
  useWinterLight,
  type AuthFlow,
} from "./AuthWinterFlow";
import { HappyYearBackdrop } from "./HappyYearDecor";
import "./auth-winter.css";

const inputCls =
  "w-full rounded-xl border border-black/10 bg-white py-3 pr-4 pl-11 text-[15px] font-medium outline-none transition placeholder:text-black/30 focus:border-accent focus:ring-4 focus:ring-accent/15";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] font-semibold tracking-[0.16em] text-black/45 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Достаёт читаемый текст из любой ошибки (никогда не вернёт "{}"). */
function rawMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err === "{}" ? "" : err;
  const e = err as Record<string, unknown>;
  for (const key of ["message", "msg", "error_description", "error"]) {
    const v = e[key];
    if (typeof v === "string" && v.trim() && v !== "{}") return v;
  }
  try {
    const s = JSON.stringify(err);
    return s === "{}" ? "" : s;
  } catch {
    return "";
  }
}

/** Переводит ошибки Supabase Auth на русский и подсказывает действие. */
export function mapAuthError(err: unknown): string {
  console.error("[WinChat] ошибка авторизации:", err);
  const raw = rawMessage(err);
  const e = err as Record<string, unknown> | null;
  const code = String(e?.error_code ?? e?.code ?? "");
  const t = `${code} ${raw}`.toLowerCase();

  const NO_SERVER = "Нет подключения к серверу";
  const NO_SERVERS = "Не удалось подключится к серверам WinChat. У вас включен интернет?";

  // Сырые сетевые ошибки вроде "unable to host ...supabase.co" больше
  // не показываем пользователю — только понятное сообщение.
  if (
    t.includes("supabase.co") ||
    t.includes("unable to host") ||
    t.includes("err_name_not_resolved") ||
    t.includes("err_connection") ||
    t.includes("err_network_changed") ||
    t.includes("err_internet_disconnected") ||
    t.includes("enotfound") ||
    t.includes("eai_again") ||
    t.includes("getaddrinfo") ||
    t.includes("timed out") ||
    t.includes("timeout")
  )
    return NO_SERVERS;
  if (t.includes("failed to fetch") || t.includes("network") || t.includes("load failed"))
    return NO_SERVER;
  if (t.includes("rate limit") || t.includes("over_request_rate_limit") || t.includes("too many"))
    return "Слишком много попыток. Подождите пару минут и повторите.";
  if (t.includes("signup_disabled") || t.includes("email_provider_disabled") || t.includes("signups not allowed"))
    return "Регистрация временно недоступна.";
  if (t.includes("database error") || t.includes("unexpected_failure") || t.includes("error saving"))
    return NO_SERVER;
  if (t.includes("already registered") || t.includes("already exists") || t.includes("user_already_exists"))
    return "Такой аккаунт уже существует — войдите.";
  if (t.includes("invalid login credentials"))
    return "Неверный username или пароль. Если раньше вы входили по WinPass — пароль был сброшен: войдите по WinPass, затем задайте новый пароль в Настройки → Безопасность.";
  if (t.includes("email_address_invalid") || (t.includes("invalid") && t.includes("email")))
    return "Не удалось создать аккаунт. Попробуйте другой username.";
  if (t.includes("weak_password") || (t.includes("password") && (t.includes("least") || t.includes("short") || t.includes("weak"))))
    return "Пароль слишком простой — минимум 6 символов с английскими буквами.";
  if (raw) return NO_SERVER;
  return NO_SERVER;
}

export default function Auth({
  initialMode,
  onAuthenticated,
}: {
  initialMode?: "login" | "register";
  onAuthenticated?: (flow: AuthFlow) => void;
} = {}) {
  const [mode, setMode] = useState<"login" | "register" | "winpass">(initialMode ?? "login");
  const [winterLight, toggleWinterLight] = useWinterLight();
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverOk, setServerOk] = useState<"checking" | "ok" | "fail">("checking");
  /* WinPass */
  const [wpInput, setWpInput] = useState("");

  /* Проверка: выполнен ли SQL на сервере (таблица profiles существует) */
  useEffect(() => {
    let alive = true;
    supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .then(({ error: pingErr }) => {
        if (alive) setServerOk(pingErr ? "fail" : "ok");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const uErr = validateUsername(username);
    if (uErr) return setError(uErr);
    const pErr = validatePassword(password);
    if (pErr) return setError(pErr);

    setLoading(true);
    try {
      if (mode === "register") {
        const nErr = validateNickname(nickname);
        if (nErr) return setError(nErr);
        devLog(`auth: registering @${username.trim().toLowerCase()}`);

        if (await isUsernameTaken(username.trim())) {
          return setError("Такой username уже занят");
        }

        const result = await registerAccount({
          username: username.trim().toLowerCase(),
          password,
          nickname: nickname.trim(),
        });
        if (!result.ok) {
          if (result.notice) return setNotice(result.notice);
          return setError(mapAuthError(result.error));
        }

        /* Пароль нужен для моста «Память о Wintozo» — запоминаем его */
        void rememberLegacyPassword(password);

        devLog(`auth: account created on ${result.server}`);
        onAuthenticated?.({ kind: "register", winpass: result.winpass });
      } else {
        devLog(`auth: signing in @${username.trim().toLowerCase()}`);
        const result = await loginAccount(username.trim(), password);
        if (!result.ok) return setError(mapAuthError(result.error));
        devLog(`auth: signed in on ${result.server}`);
        onAuthenticated?.({ kind: "login" });
      }
    } catch (errCaught) {
      setError(mapAuthError(errCaught));
    } finally {
      setLoading(false);
    }
  }

  async function submitWinpass(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const code = normalizeWinpass(wpInput);
    if (!code) return setError("Неверный формат WinPass. Пример: 33b42-a1b2c3d4e5f6");

    setLoading(true);
    try {
      devLog("auth: signing in with winpass");
      // Вход по WinPass без пароля — сервер сам сбрасывает пароль и выдаёт сессию
      await loginByWinpass(code);
      onAuthenticated?.({ kind: "login" });
    } catch (errCaught) {
      setError(mapAuthError(errCaught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`auth-winter flex min-h-dvh bg-paper${winterLight ? " is-light" : ""}`}>
      <HappyYearBackdrop className="auth-winter-backdrop" easterEggs={false} />
      <WinterSnow />
      <WinterThemeToggle light={winterLight} onToggle={toggleWinterLight} />
      {/* ---- Зимняя сцена ---- */}
      <div className="auth-aurora-ribbon" aria-hidden="true" />
      <main className="auth-stage relative flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="auth-hero relative z-10 flex flex-col items-center text-center">
          <div className="auth-hero-emblem" aria-hidden="true">
            <i className="auth-hero-ring auth-hero-ring-a" />
            <i className="auth-hero-ring auth-hero-ring-b" />
            <span className="auth-hero-spark auth-hero-spark-a" />
            <span className="auth-hero-spark auth-hero-spark-b" />
            <span className="auth-hero-spark auth-hero-spark-c" />
            <b>W</b>
          </div>
          <h1 className="auth-hero-title">
            Зима начинается <span>здесь</span>
          </h1>
          <p className="auth-hero-sub">Тёплое место для ваших сообщений.</p>
        </div>

        <div className="auth-card-holder relative z-10 mt-8 w-full max-w-[430px]">
          <div className="auth-winter-card animate-slide-up relative">
            <h2 className="text-[28px] font-extrabold tracking-tight">
            {mode === "login" ? "С возвращением" : "Создать аккаунт"}
          </h2>
          <p className="mt-1 text-sm font-medium text-black/45">
            {mode === "login"
              ? "Войдите в свой аккаунт"
              : "Никнейм, username и пароль"}
          </p>

          {serverOk === "fail" && (
            <div className="animate-fade-in mt-5 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed font-semibold text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Нет подключения к серверу</span>
            </div>
          )}

          <div className="mt-7 flex rounded-full bg-black/5 p-1">
            {([
              ["login", "Вход"],
              ["register", "Регистрация"],
              ["winpass", "WinPass"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
                className={cn(
                  "flex-1 rounded-full py-2 text-[13px] font-bold transition",
                  mode === m
                    ? "bg-ink text-white shadow-sm"
                    : "text-black/45 hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={mode === "winpass" ? submitWinpass : submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <Field label="Никнейм">
                <div className="relative">
                  <User className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-black/35" />
                  <input
                    className={inputCls}
                    placeholder="Как вас видят люди"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    autoComplete="nickname"
                  />
                </div>
              </Field>
            )}

            {mode === "winpass" && (
              <Field label="WinPass">
                <div className="relative">
                  <KeyRound className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-black/35" />
                  <input
                    className={cn(inputCls, "font-mono")}
                    placeholder="33b42-a1b2c3d4e5f6"
                    value={wpInput}
                    onChange={(e) => setWpInput(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <p className="mt-1.5 text-xs font-medium text-black/40">
                  Код восстановления, полученный при регистрации. Внимание: после входа по WinPass
                  прежний пароль сбрасывается — новый задайте в Настройки → Безопасность.
                </p>
              </Field>
            )}

            {(mode === "login" || mode === "register") && (
              <Field label="Username">
                <div className="relative">
                  <AtSign className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-black/35" />
                  <input
                    className={cn(inputCls, "font-mono")}
                    placeholder="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                    autoComplete="username"
                  />
                </div>
                {mode === "register" && (
                  <p className="mt-1.5 text-xs font-medium text-black/40">
                    Английские строчные буквы, цифры, «_» и «.»
                  </p>
                )}
              </Field>
            )}

            {(mode === "login" || mode === "register") && (
              <Field label="Пароль">
                <div className="relative">
                  <Lock className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-black/35" />
                  <input
                    className={cn(inputCls, "pr-11")}
                    type={showPw ? "text" : "password"}
                    placeholder="Минимум 6 символов"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1.5 text-black/35 transition hover:bg-black/5 hover:text-ink"
                    aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm font-semibold text-red-600 animate-fade-in">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3 text-sm font-semibold text-accent animate-fade-in">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14px] font-bold text-white transition hover:bg-black active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "Войти" : mode === "register" ? "Создать" : "Войти"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          </div>
        </div>
      </main>
    </div>
  );
}
