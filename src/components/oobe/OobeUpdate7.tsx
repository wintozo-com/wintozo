import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  Clock3,
  Gift,
  Mic,
  Music,
  ShieldCheck,
  Snowflake,
  Sparkles,
} from "lucide-react";
import type { OobeVariant } from "./OobeThemeChooser";
import {
  HappyYearCountdown,
  HappyYearGarland,
  HappyYearHangingOrnaments,
  HappyYearMelody,
  HappyYearThemeToggle,
  HappyYearSnow,
} from "../HappyYearDecor";
import "./oobe-7.css";
import OobeIceIntro from "./OobeIceIntro";

interface Props {
  /** Активен ли WinPro у пользователя (null — ещё проверяется). */
  winPro: boolean | null;
  /** Завершить OOBE и открыть список чатов. */
  onFinish: () => void;
  /** Стиль OOBE (в 7.0 — новогодний). */
  variant?: OobeVariant;
}

const WHATS_NEW = [
  {
    icon: <Sparkles />,
    tone: "red" as const,
    title: "Новогодний интерфейс",
    text: "Ледяное стекло, зимний пейзаж и мягкий свет в классическом оформлении.",
  },
  {
    icon: <Mic />,
    tone: "green" as const,
    title: "Кнопки-шарики",
    text: "Праздничные акценты украшают привычные действия в чатах.",
  },
  {
    icon: <Clock3 />,
    tone: "gold" as const,
    title: "Отсчёт до 2027",
    text: "До полуночи 01.01.2027 — прямо на экране обновления.",
  },
  {
    icon: <Music />,
    tone: "blue" as const,
    title: "Музыка праздника",
    text: "Новогодняя мелодия включается одной кнопкой.",
  },
];

/**
 * Новогоднее OOBE обновления до WinChat 7.0 — отдельный дизайн.
 * Шаг 1: поздравление + отсчёт до 01.01.2027.
 * Шаг 2: что нового в 7.0.
 */
export default function OobeUpdate7({ winPro, onFinish, variant = "you" }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  /* Ледяная заставка 7.0: 6 кликов по W → логотип перелетает в OOBE. */
  const [iceIntro, setIceIntro] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("oobe-active");
    return () => root.classList.remove("oobe-active");
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  return (
    <div className="ny7 ny7--update" data-variant={variant}>
      <div className="ny7-bg" aria-hidden="true" />
      <HappyYearGarland className="ny7-garland" bulbs={22} />
      <HappyYearHangingOrnaments className="ny7-hanging" />
      <HappyYearSnow className="ny7-snow" count={34} />
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
            <small>7.0 · Closed Beta</small>
          </span>
        </div>
        <span className="ny7-badge">
          <Snowflake /> 2027
        </span>
      </header>

      <main className="ny7-shell ny7-shell--update">
        <section className="ny7-hero">
          <span className="ny7-eyebrow">
            <Sparkles /> {step === 1 ? "Обновление завершено" : "Что нового"}
          </span>
          <h1 className="ny7-hero-title">
            {step === 1 ? (
              <>
                С наступающим
                <em>2027 годом!</em>
              </>
            ) : (
              <>
                Подарки
                <em>WinChat 7.0</em>
              </>
            )}
          </h1>
          <p className="ny7-hero-text">
            {step === 1
              ? "WinChat 7.0 установлен. Пусть каждый чат светится теплом, сообщения приходят вовремя, а рядом всегда будут близкие люди."
              : "Мы украсили мессенджер к празднику: новогодний стиль, кнопки-шарики, отсчёт до 2027 и мелодия."}
          </p>

          <div className="ny7-year" aria-hidden="true">
            <span className="ny7-year-snow">
              <Snowflake />
            </span>
            <span className="ny7-year-digits">2027</span>
          </div>

          <HappyYearCountdown className="ny7-countdown" />

          <ul className="ny7-features">
            <li>
              <span className="ny7-feature-orb ny7-feature-orb--red">
                <Gift />
              </span>
              Новогодний стиль
            </li>
            <li>
              <span className="ny7-feature-orb ny7-feature-orb--green">
                <ShieldCheck />
              </span>
              {winPro === null
                ? "Проверяем WinPro"
                : winPro
                  ? "WinPro активен"
                  : "Доступно всем"}
            </li>
            <li>
              <span className="ny7-feature-orb ny7-feature-orb--gold">
                <Clock3 />
              </span>
              До 01.01.2027
            </li>
          </ul>
        </section>

        <section className="ny7-panel ny7-panel--wide">
          <div className="ny7-panel-top">
            <span className="ny7-panel-step">Шаг {step} из 2</span>
            <div className="ny7-progress" aria-hidden="true">
              <span className={step >= 1 ? "is-active" : ""} />
              <span className={step >= 2 ? "is-active" : ""} />
            </div>
          </div>

          {step === 1 ? (
            <div className="ny7-step ny7-step--center" key="u1">
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
                Обновление завершено!
                <br />
                <em>WinChat 7.0</em>
              </h2>
              <p>
                Праздничная версия готова. Загляните, что нового, или сразу
                откройте мессенджер.
              </p>

              <div className="ny7-actions">
                <button type="button" className="ny7-primary" onClick={() => setStep(2)}>
                  <span>Смотреть, что нового</span>
                  <ArrowRight />
                </button>
                <button type="button" className="ny7-secondary" onClick={onFinish}>
                  Открыть WinChat
                </button>
              </div>
            </div>
          ) : (
            <div className="ny7-step" key="u2">
              <button type="button" className="ny7-back" onClick={() => setStep(1)}>
                <ArrowLeft /> Назад
              </button>
              <h2>
                Что нового в <em>7.0</em>
              </h2>
              <p>Четыре праздничных изменения, которые уже ждут вас внутри.</p>

              <div className="ny7-news">
                {WHATS_NEW.map((item) => (
                  <article className="ny7-news-card" key={item.title}>
                    <span className={`ny7-news-orb ny7-news-orb--${item.tone}`} aria-hidden="true">
                      {item.icon}
                    </span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </div>
                  </article>
                ))}
              </div>

              {winPro !== null && (
                <p className="ny7-footnote">
                  <ShieldCheck />
                  {winPro
                    ? "WinPro активен — новогоднее оформление доступно полностью."
                    : "Базовое новогоднее оформление доступно всем."}
                </p>
              )}

              <div className="ny7-actions">
                <button type="button" className="ny7-primary" onClick={onFinish}>
                  <span>Открыть WinChat</span>
                  <CheckCheck />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {iceIntro && <OobeIceIntro onDone={() => setIceIntro(false)} />}
    </div>
  );
}