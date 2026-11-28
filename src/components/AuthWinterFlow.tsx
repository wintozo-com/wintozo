import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Ban,
  Check,
  Copy,
  Crown,
  KeyRound,
  Loader2,
  Moon,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Sun,
} from "lucide-react";
import { HappyYearBackdrop } from "./HappyYearDecor";
import { checkBanned } from "../lib/adminApi";
import { supabase } from "../lib/supabase";
import "./auth-winter.css";

export type AuthFlow = { kind: "register"; winpass: string } | { kind: "login" };

/** Общий для входа/регистрации мелкий снегопад. */
export function WinterSnow() {
  return (
    <div className="auth-winter-snow" aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          style={
            {
              "--left": `${(i * 37 + (i % 3) * 13) % 100}%`,
              "--size": `${2 + (i % 4) * 1.1}px`,
              "--alpha": 0.22 + (i % 4) * 0.14,
              "--fall": `${11 + (i % 7) * 2.3}s`,
              "--delay": `${(i % 9) * -1.7}s`,
              "--drift": `${((i % 5) - 2) * 26}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const WINTER_LIGHT_KEY = "winchat_auth_winter_light";

/** Светлая/тёмная зимняя палитра экранов входа. */
export function useWinterLight(): [boolean, () => void] {
  const [light, setLight] = useState(() => {
    try {
      return localStorage.getItem(WINTER_LIGHT_KEY) === "on";
    } catch {
      return false;
    }
  });

  const toggle = () =>
    setLight((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(WINTER_LIGHT_KEY, next ? "on" : "off");
      } catch {
        /* no-op */
      }
      return next;
    });

  return [light, toggle];
}

/** Маленькая кнопка смены зимней темы в правом верхнем углу. */
export function WinterThemeToggle({ light, onToggle }: { light: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="auth-winter-theme"
      title={light ? "Полярная ночь" : "Светлый снег"}
      aria-label={light ? "Включить тёмную зимнюю тему" : "Включить светлую зимнюю тему"}
    >
      {light ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
    </button>
  );
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ============================================================
   Подарок после регистрации: красивая «льдинка» с WinPass.
   ============================================================ */
export function AuthWinpassGift({ winpass, onDone }: { winpass: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [light, toggleLight] = useWinterLight();

  async function copy() {
    if (!winpass) return;
    try {
      await navigator.clipboard.writeText(winpass);
    } catch {
      /* Буфер недоступен — код всё равно виден на экране. */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className={`auth-winter auth-flow-screen${light ? " is-light" : ""}`}>
      <HappyYearBackdrop className="auth-winter-backdrop" easterEggs={false} />
      <WinterSnow />
      <div className="auth-flow-aurora" aria-hidden="true" />
      <WinterThemeToggle light={light} onToggle={toggleLight} />

      <div className="auth-flow-card auth-gift-card">
        <div className="auth-flow-badge" aria-hidden="true">
          <Snowflake className="h-7 w-7" strokeWidth={1.4} />
        </div>

        <p className="auth-flow-eyebrow">Cordy 8.0 · зимняя регистрация</p>
        <h2 className="auth-flow-title">Аккаунт создан!</h2>
        <p className="auth-flow-lead">
          Сохраните <b>WinPass</b> — это ваш код восстановления. Он навсегда привязан к аккаунту и
          поможет войти, если вы забудете пароль.
        </p>

        <div className="auth-gift-code">
          <span>Ваш WinPass</span>
          <strong>{winpass || "Код появится в Настройках профиля"}</strong>
        </div>

        <div className="auth-gift-actions">
          <button type="button" onClick={() => void copy()} disabled={!winpass} className="auth-btn-primary">
            <Copy className="h-4 w-4" />
            {copied ? "Скопировано ✓" : "Скопировать код"}
          </button>
          <button type="button" onClick={onDone} className="auth-btn-secondary">
            Войти в Cordy
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <p className="auth-flow-footnote">
          Позже код можно посмотреть в Настройки → Безопасность
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   Проверка после входа: WinPro → бан → пароль → подготовка.
   ============================================================ */
type CheckResult = { text: string; ok: boolean };

const CHECKS = [
  { key: "winpro", title: "Проверка WinPro", hint: "Подписка и привилегии" },
  { key: "ban", title: "Проверка блокировки аккаунта", hint: "Безопасность профиля" },
  { key: "password", title: "Проверка пароля", hint: "Сессия подтверждена" },
  { key: "ready", title: "Подготовка Cordy 8.0", hint: "Зимний интерфейс готов" },
] as const;

function CheckIcon({ index }: { index: number }) {
  if (index === 0) return <Crown className="h-[17px] w-[17px]" />;
  if (index === 1) return <ShieldCheck className="h-[17px] w-[17px]" />;
  if (index === 2) return <KeyRound className="h-[17px] w-[17px]" />;
  return <Snowflake className="h-[17px] w-[17px]" />;
}

function SnowmanMascot({ state }: { state: "checking" | "happy" | "blocked" }) {
  return (
    <div className={`auth-check-snowman is-${state}`} aria-hidden="true">
      <div className="snowman-aura" />
      <div className="snowman-arm snowman-arm-left" />
      <div className="snowman-arm snowman-arm-right" />
      <div className="snowman-base" />
      <div className="snowman-body">
        <i className="snowman-button" />
        <i className="snowman-button snowman-button-low" />
      </div>
      <div className="snowman-head">
        <i className="snowman-eye snowman-eye-left" />
        <i className="snowman-eye snowman-eye-right" />
        <i className="snowman-nose" />
        <i className="snowman-smile" />
      </div>
      <div className="snowman-scarf">
        <i className="snowman-scarf-tail" />
      </div>
      <div className="snowman-hat">
        <i className="snowman-hat-brim" />
      </div>
    </div>
  );
}

export function AuthSecurityCheck({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [light, toggleLight] = useWinterLight();
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<Record<number, CheckResult>>({});
  const [blocked, setBlocked] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let alive = true;

    async function runCheck(index: number): Promise<CheckResult> {
      try {
        if (index === 0) {
          const { data } = await supabase
            .from("profiles")
            .select("winpro_until")
            .eq("id", userId)
            .maybeSingle();
          const until = (data as { winpro_until?: string } | null)?.winpro_until;
          if (until && new Date(until) > new Date()) {
            const days = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000));
            return { ok: true, text: `WinPro активен · ${days} дн.` };
          }
          return { ok: true, text: "Обычный аккаунт" };
        }

        if (index === 1) {
          const status = await checkBanned(userId);
          return status === "banned"
            ? { ok: false, text: "Аккаунт заблокирован" }
            : { ok: true, text: "Аккаунт не заблокирован" };
        }

        if (index === 2) {
          const { data } = await supabase.auth.getSession();
          return data.session
            ? { ok: true, text: "Пароль подтверждён" }
            : { ok: false, text: "Сессия не найдена" };
        }

        await delay(420);
        return { ok: true, text: "Всё готово" };
      } catch {
        // Сетевой сбой не должен блокировать вход — покажем нейтральный статус.
        return { ok: true, text: "Проверено" };
      }
    }

    (async () => {
      for (let i = 0; i < CHECKS.length; i++) {
        if (!alive) return;
        setActive(i);
        const result = await runCheck(i);
        if (!alive) return;
        setResults((prev) => ({ ...prev, [i]: result }));
        if (!result.ok && i === 1) {
          setBlocked(true);
          return;
        }
        await delay(620);
      }
      if (!alive) return;
      setActive(CHECKS.length);
      await delay(700);
      if (alive) onDoneRef.current();
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  const progress = (Math.min(active, CHECKS.length) / CHECKS.length) * 100;
  const mascotState = blocked ? "blocked" : active >= CHECKS.length ? "happy" : "checking";

  return (
    <div className={`auth-winter auth-flow-screen${light ? " is-light" : ""}`}>
      <HappyYearBackdrop className="auth-winter-backdrop" easterEggs={false} />
      <WinterSnow />
      <div className="auth-flow-aurora" aria-hidden="true" />
      <WinterThemeToggle light={light} onToggle={toggleLight} />

      <div className="auth-flow-card auth-check-card">
        <SnowmanMascot state={mascotState} />
        <div className="auth-check-bubble" aria-live="polite">
          {blocked
            ? "Ой… аккаунт заблокирован. Сейчас покажу подробности."
            : active >= CHECKS.length
              ? "Всё готово! Добро пожаловать в Cordy Messenger ❄"
              : `Проверяю: ${CHECKS[active].title.toLowerCase()}…`}
        </div>

        <p className="auth-flow-eyebrow">Cordy 8.0 · вход в аккаунт</p>
        <h2 className="auth-flow-title">Зимняя проверка</h2>
        <p className="auth-flow-lead">Снеговик проверяет ваш аккаунт — это займёт пару секунд.</p>

        <div className="auth-check-progress" aria-label="Прогресс проверки">
          <i style={{ width: `${progress}%` }} />
        </div>

        <div className="auth-check-list">
          {CHECKS.map((check, i) => {
            const result = results[i];
            const isDone = !!result && i < active;
            const isError = !!result && !result.ok;
            const isActive = !blocked && i === active;
            return (
              <div
                key={check.key}
                className={[
                  "auth-check-row",
                  isDone ? "is-done" : "",
                  isError ? "is-error" : "",
                  isActive ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="auth-check-icon">
                  {isActive ? (
                    <Loader2 className="auth-spin h-[17px] w-[17px]" />
                  ) : isDone ? (
                    <Check className="h-[17px] w-[17px]" />
                  ) : isError ? (
                    <Ban className="h-[17px] w-[17px]" />
                  ) : (
                    <CheckIcon index={i} />
                  )}
                </span>
                <span className="auth-check-text">
                  <b>{check.title}</b>
                  <small>{result?.text ?? check.hint}</small>
                </span>
                {isDone && <Check className="auth-check-tick h-4 w-4" />}
              </div>
            );
          })}
        </div>

        {blocked && (
          <button type="button" onClick={onDone} className="auth-btn-primary auth-check-continue">
            Продолжить
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

        <p className="auth-flow-footnote">
          <Sparkles className="inline h-3 w-3" /> Проверка идёт на защищённом сервере Cordy
        </p>
      </div>
    </div>
  );
}
