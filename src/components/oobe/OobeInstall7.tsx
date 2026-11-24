import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Gift,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Snowflake,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  emailFor,
  loginByWinpass,
  supabase,
  type Profile,
} from "../../lib/supabase";
import { mapAuthError } from "../Auth";
import { rememberLegacyPassword } from "../LegacyScreen";
import {
  normalizeWinpass,
  validateNickname,
  validatePassword,
  validateUsername,
} from "../../lib/utils";
import type { OobeVariant } from "./OobeThemeChooser";
import {
  HappyYearCountdown,
  HappyYearGarland,
  HappyYearGifts,
  HappyYearHangingOrnaments,
  HappyYearLoader,
  HappyYearMelody,
  HappyYearThemeToggle,
  HappyYearSnow,
  HappyYearTree,
} from "../HappyYearDecor";
import "./oobe-7.css";
import OobeIceIntro from "./OobeIceIntro";

interface Props {
  /** Есть ли сессия (во время проверки профиля профиль ещё null). */
  hasSession: boolean;
  /** Профиль текущего пользователя (null, пока грузится). */
  profile: Profile | null;
  /** Завершить OOBE и открыть мессенджер. */
  onFinish: () => void;
  /** Стиль OOBE (в 7.0 — новогодний). */
  variant?: OobeVariant;
}

type Step = "welcome" | "auth" | "winpass" | "checking" | "success";

const CHECK_STEPS = ["Аккаунт", "WinPro и подписка", "Безопасность профиля"];

/**
 * OOBE первого запуска WinChat 7.0 — отдельный новогодний экран.
 *
 * Это не перекрашенный Material You 6.0: своя двухпанельная вёрстка
 * (поздравительная открытка + форма), своя типографика, свои поля и кнопки.
 * Логика регистрации/входа прежняя: welcome → auth → WinPass → проверка → финал.
 */
export default function OobeInstall7({
  hasSession,
  profile,
  onFinish,
  variant = "you",
}: Props) {
  const [step, setStep] = useState<Step>(() =>
    hasSession ? "checking" : "welcome",
  );
  const [mode, setMode] = useState<"register" | "login">("register");

  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [wpInput, setWpInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [issuedWinpass, setIssuedWinpass] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkPhase, setCheckPhase] = useState(0);
  /* Ледяная заставка 7.0: 6 кликов по W → логотип перелетает в OOBE. */
  const [iceIntro, setIceIntro] = useState(true);

  /* Пока OOBE открыт — гасим фоновые анимации WinPro на <html>. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("oobe-active");
    return () => root.classList.remove("oobe-active");
  }, []);

  /* Уже вошли (сессия сохранена) → сразу проверка. */
  useEffect(() => {
    if (hasSession && step === "welcome") setStep("checking");
  }, [hasSession, step]);

  /* Профиль получен → успех проверок (бан проверяется в App). */
  useEffect(() => {
    if (step === "checking" && profile) setStep("success");
  }, [step, profile]);

  /* Поэтапные статусы проверки — просто чтобы экран «жил». */
  useEffect(() => {
    if (step !== "checking") return;
    setCheckPhase(0);
    const t1 = window.setTimeout(() => setCheckPhase(1), 850);
    const t2 = window.setTimeout(() => setCheckPhase(2), 1700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const stepIndex =
    step === "welcome"
      ? 0
      : step === "auth" || step === "winpass"
        ? 1
        : step === "checking"
          ? 2
          : 3;

  const stepLabel =
    step === "welcome"
      ? "Первый запуск"
      : step === "auth"
        ? "Аккаунт"
        : step === "winpass"
          ? "WinPass"
          : step === "checking"
            ? "Проверка"
            : "Готово";

  /* ---------------- Аутентификация (register / login / winpass) ---------------- */
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const uErr = validateUsername(username);
    if (uErr) return setError(uErr);
    const pErr = validatePassword(password);
    if (pErr) return setError(pErr);

    setLoading(true);
    try {
      if (mode === "register") {
        const nErr = validateNickname(nickname);
        if (nErr) return setError(nErr);

        const { data: taken } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", username.trim())
          .maybeSingle();
        if (taken) return setError("Такой username уже занят");

        const { data, error: upErr } = await supabase.auth.signUp({
          email: emailFor(username),
          password,
          options: {
            data: {
              username: username.trim().toLowerCase(),
              nickname: nickname.trim(),
            },
          },
        });
        if (upErr) return setError(mapAuthError(upErr));

        /* Пароль нужен для моста «Память о Wintozo» */
        void rememberLegacyPassword(password);

        if (data.user && !data.session) {
          const { error: siErr } = await supabase.auth.signInWithPassword({
            email: emailFor(username),
            password,
          });
          if (siErr) return setError(mapAuthError(siErr));
        }

        /* Забрать WinPass, выданный триггером на сервере */
        const uid = data.user?.id;
        if (uid) {
          let code: string | null = null;
          for (let attempt = 0; attempt < 5 && !code; attempt++) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("winpass")
              .eq("id", uid)
              .maybeSingle();
            code = (prof as { winpass?: string } | null)?.winpass || null;
            if (!code) await new Promise((r) => setTimeout(r, 400));
          }
          if (code) {
            setIssuedWinpass(code);
            setStep("winpass");
            return;
          }
        }
        /* Сессия появилась — App прогрузит профиль и включится экран «Проверка..» */
        setStep("checking");
      } else {
        const { error: inErr } = await supabase.auth.signInWithPassword({
          email: emailFor(username),
          password,
        });
        if (inErr) return setError(mapAuthError(inErr));
        setStep("checking");
      }
    } catch {
      setError("Нет соединения с сервером. Проверьте интернет.");
    } finally {
      setLoading(false);
    }
  }

  async function submitWinpass(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const code = normalizeWinpass(wpInput);
    if (!code)
      return setError("Неверный формат WinPass. Пример: 33b42-a1b2c3d4e5f6");

    setLoading(true);
    try {
      await loginByWinpass(code);
      setStep("checking");
    } catch (errCaught) {
      setError(mapAuthError(errCaught));
    } finally {
      setLoading(false);
    }
  }

  function closeWinpass() {
    setStep("checking");
  }

  function switchMode(next: "register" | "login") {
    setMode(next);
    setError(null);
  }

  function copyWinpass() {
    if (!issuedWinpass) return;
    navigator.clipboard?.writeText(issuedWinpass).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="ny7" data-variant={variant}>
      <div className="ny7-bg" aria-hidden="true" />
      <HappyYearGarland className="ny7-garland" bulbs={22} />
      <HappyYearHangingOrnaments className="ny7-hanging" />
      <HappyYearSnow className="ny7-snow" count={30} />
      <HappyYearTree className="ny7-tree" />
      <HappyYearGifts className="ny7-gifts" />
      <HappyYearMelody className="ny7-melody" />
      <HappyYearThemeToggle className="ny7-theme" />

      <header className="ny7-topbar">
        <div className="ny7-brand">
          <span className="ny7-logo">
            <img
              data-oobe-intro-target
              src="/logo.jpg"
              alt="WinChat"
              width={52}
              height={52}
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </span>
          <span className="ny7-brand-copy">
            <strong>WinChat</strong>
            <small>7.0 · Новый год</small>
          </span>
        </div>
        <span className="ny7-badge">
          <Snowflake /> 2027
        </span>
      </header>

      <main className="ny7-shell">
        {/* ---------- Поздравительная половина ---------- */}
        <section className="ny7-hero">
          <span className="ny7-eyebrow">
            <Sparkles /> {stepLabel}
          </span>
          <h1 className="ny7-hero-title">
            С наступающим
            <em>2027 годом!</em>
          </h1>
          <p className="ny7-hero-text">
            Праздничная версия WinChat уже установлена. Создайте аккаунт —
            и мессенджер откроется в новогоднем стиле: с гирляндами, снегом
            и кнопками-шариками.
          </p>

          <div className="ny7-year" aria-hidden="true">
            <span className="ny7-year-snow">
              <Snowflake />
            </span>
            <span className="ny7-year-digits">2027</span>
          </div>

          <HappyYearCountdown className="ny7-countdown" compact />

          <ul className="ny7-features">
            <li>
              <span className="ny7-feature-orb ny7-feature-orb--red">
                <Sparkles />
              </span>
              Новогодний интерфейс
            </li>
            <li>
              <span className="ny7-feature-orb ny7-feature-orb--green">
                <ShieldCheck />
              </span>
              Аккаунт защищён
            </li>
            <li>
              <span className="ny7-feature-orb ny7-feature-orb--gold">
                <Clock3 />
              </span>
              Отсчёт до полуночи
            </li>
          </ul>
        </section>

        {/* ---------- Панель действий ---------- */}
        <section className="ny7-panel">
          <div className="ny7-panel-top">
            <span className="ny7-panel-step">
              Шаг {Math.min(stepIndex + 1, 3)} из 3
            </span>
            <div className="ny7-progress" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={
                    stepIndex > i
                      ? "is-done"
                      : stepIndex === i
                        ? "is-active"
                        : ""
                  }
                />
              ))}
            </div>
          </div>

          {step === "welcome" && (
            <div className="ny7-step" key="welcome">
              <div className="ny7-mark">
                <span className="ny7-mark-ring" aria-hidden="true" />
                <img
                  data-oobe-intro-target
                  src="/logo.jpg"
                  alt=""
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <h2>
                Добро пожаловать
                <br />в WinChat 7.0
              </h2>
              <p>
                Установка завершена. Осталось создать аккаунт или войти —
                и можно встречать Новый год вместе.
              </p>

              <div className="ny7-actions">
                <button
                  type="button"
                  className="ny7-primary"
                  onClick={() => {
                    setError(null);
                    setStep("auth");
                  }}
                >
                  <span>Создать аккаунт</span>
                  <ArrowRight />
                </button>
                <button
                  type="button"
                  className="ny7-secondary"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setStep("auth");
                  }}
                >
                  У меня уже есть аккаунт
                </button>
              </div>

              <div className="ny7-chips">
                <span>
                  <Snowflake /> Гирлянды и шарики
                </span>
                <span>
                  <Gift /> Подарок внутри
                </span>
              </div>
            </div>
          )}

          {step === "auth" && (
            <div className="ny7-step" key="auth">
              <button
                type="button"
                className="ny7-back"
                onClick={() => {
                  setError(null);
                  setStep("welcome");
                }}
              >
                <ArrowLeft /> Назад
              </button>

              <h2>
                {mode === "register" ? "Создайте аккаунт" : "С возвращением"}
              </h2>
              <p>
                {mode === "register"
                  ? "Это займёт меньше минуты — и вы внутри."
                  : "Войдите, чтобы продолжить с того же места."}
              </p>

              <div className="ny7-tabs" data-mode={mode}>
                <span className="ny7-tab-thumb" aria-hidden="true" />
                <button
                  type="button"
                  aria-selected={mode === "register"}
                  onClick={() => switchMode("register")}
                >
                  Регистрация
                </button>
                <button
                  type="button"
                  aria-selected={mode === "login"}
                  onClick={() => switchMode("login")}
                >
                  Вход
                </button>
              </div>

              <form className="ny7-form" onSubmit={submit}>
                {mode === "register" && (
                  <NyField
                    icon={<UserRound />}
                    label="Ваше имя"
                    value={nickname}
                    onChange={setNickname}
                    placeholder="Как вас звать?"
                    maxLength={30}
                    autoFocus
                    autoComplete="nickname"
                  />
                )}
                <NyField
                  icon={<AtSign />}
                  label="Username"
                  value={username}
                  onChange={setUsername}
                  placeholder="юзернейм латиницей"
                  maxLength={20}
                  autoComplete="username"
                />
                <NyField
                  icon={<LockKeyhole />}
                  label="Пароль"
                  value={password}
                  onChange={setPassword}
                  placeholder={
                    mode === "register" ? "минимум 6 символов" : "ваш пароль"
                  }
                  type={showPw ? "text" : "password"}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  trailing={
                    <button
                      type="button"
                      className="ny7-field-trail"
                      aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                      onClick={() => setShowPw((v) => !v)}
                    >
                      {showPw ? <Eye /> : <EyeOff />}
                    </button>
                  }
                />

                {error && (
                  <div className="ny7-error">
                    <CircleAlert />
                    <span>{error}</span>
                  </div>
                )}

                <button type="submit" className="ny7-primary" disabled={loading}>
                  {loading ? (
                    <Loader2 className="ny7-spin" />
                  ) : (
                    <>
                      <span>
                        {mode === "register" ? "Создать аккаунт" : "Войти"}
                      </span>
                      <ArrowRight />
                    </>
                  )}
                </button>
              </form>

              <NyWinpassSection
                onSubmit={submitWinpass}
                value={wpInput}
                onChange={setWpInput}
                loading={loading}
              />
            </div>
          )}

          {step === "winpass" && issuedWinpass && (
            <div className="ny7-step ny7-step--center" key="winpass">
              <div className="ny7-mark ny7-mark--gift">
                <Gift />
              </div>
              <h2>Аккаунт создан</h2>
              <p>
                Сохраните <b>WinPass</b> — код восстановления, привязанный
                к аккаунту навсегда.
              </p>

              <div className="ny7-code">{issuedWinpass}</div>

              <div className="ny7-actions">
                <button
                  type="button"
                  className="ny7-secondary"
                  onClick={copyWinpass}
                >
                  {copied ? <CheckCheck /> : <Copy />}
                  {copied ? "Скопировано" : "Скопировать код"}
                </button>
                <button type="button" className="ny7-primary" onClick={closeWinpass}>
                  <span>Продолжить</span>
                  <ArrowRight />
                </button>
              </div>
            </div>
          )}

          {step === "checking" && (
            <div className="ny7-step ny7-step--center" key="checking">
              <HappyYearLoader className="ny7-tree-loader" compact label="Готовим праздник…" />
              <div className="ny7-loader" aria-hidden="true">
                <span />
                <span />
                <span />
                <Snowflake />
              </div>
              <h2>Проверяем аккаунт…</h2>
              <p>Совсем чуть-чуть — проверяем профиль, WinPro и безопасность.</p>

              <div className="ny7-checks">
                {CHECK_STEPS.map((label, i) => {
                  const on = checkPhase >= i;
                  const done = checkPhase > i;
                  return (
                    <div key={label} className={`ny7-check ${on ? "is-on" : ""}`}>
                      <i>
                        {done ? (
                          <Check />
                        ) : (
                          <Loader2 className={on ? "ny7-spin" : ""} />
                        )}
                      </i>
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="ny7-step ny7-step--center" key="success">
              <div className="ny7-success-mark">
                <CheckCheck />
              </div>
              <h2>
                С Новым годом,
                <br />
                <em>{profile?.nickname?.trim() || "друг"}!</em>
              </h2>
              <p>
                Аккаунт проверен. Внутри — чаты, каналы и новогоднее
                оформление WinChat 7.0.
              </p>

              <div className="ny7-actions">
                <button type="button" className="ny7-primary" onClick={onFinish}>
                  <span>Открыть WinChat</span>
                  <ArrowRight />
                </button>
              </div>

              <div className="ny7-chips">
                <span>
                  <ShieldCheck /> Профиль защищён
                </span>
                <span>
                  <Snowflake /> Новогодний стиль
                </span>
              </div>
            </div>
          )}
        </section>
      </main>

      {iceIntro && <OobeIceIntro onDone={() => setIceIntro(false)} />}
    </div>
  );
}

/* ---------- Поле ввода новогодней формы ---------- */
function NyField({
  label,
  value,
  onChange,
  placeholder,
  icon,
  type = "text",
  maxLength,
  autoFocus,
  autoComplete,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon: ReactNode;
  type?: string;
  maxLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
  trailing?: ReactNode;
}) {
  return (
    <label className="ny7-field">
      <span className="ny7-field-label">{label}</span>
      <span className="ny7-field-box">
        {icon}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          maxLength={maxLength}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
        />
        {trailing}
      </span>
    </label>
  );
}

/* ---------- Вход по WinPass (сворачиваемая секция) ---------- */
function NyWinpassSection({
  onSubmit,
  value,
  onChange,
  loading,
}: {
  onSubmit: (e: FormEvent) => void;
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ny7-winpass">
      {!open ? (
        <button
          type="button"
          className="ny7-winpass-cta"
          onClick={() => setOpen(true)}
        >
          <KeyRound />
          Войти по WinPass
        </button>
      ) : (
        <div className="ny7-winpass-card">
          <h3>Вход по WinPass</h3>
          <p>Введите код восстановления, который сохранили при регистрации.</p>
          <form onSubmit={onSubmit}>
            <NyField
              icon={<KeyRound />}
              label="WinPass"
              value={value}
              onChange={onChange}
              placeholder="33b42-a1b2c3d4e5f6"
              autoComplete="off"
            />
            <div className="ny7-actions ny7-actions--row">
              <button type="submit" className="ny7-primary" disabled={loading}>
                {loading ? <Loader2 className="ny7-spin" /> : <span>Войти</span>}
              </button>
              <button
                type="button"
                className="ny7-back"
                onClick={() => setOpen(false)}
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
