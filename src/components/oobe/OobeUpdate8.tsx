import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { OobeVariant } from "./OobeThemeChooser";
import "./oobe-8.css";

interface Props {
  /** Активен ли WinPro у пользователя (null — ещё проверяется). */
  winPro: boolean | null;
  /** Завершить OOBE и открыть мессенджер. */
  onFinish: () => void;
  /** Сохранённый стиль OOBE (совместимость с настройками 7.x). */
  variant?: OobeVariant;
}

type Step = 1 | 2;

const OLD_NAME = "WinChat".split("");
const NEW_NAME = "Cordy".split("");
const SHARDS = [1, 2, 3, 4];

const FEATURES = [
  {
    icon: Sparkles,
    title: "Новое имя",
    text: "Тот же мессенджер, но теперь под названием Cordy Messenger.",
  },
  {
    icon: Zap,
    title: "Обновлённый интерфейс",
    text: "Версия 8.0 стала чище, спокойнее и заметно отзывчивее.",
  },
  {
    icon: MessageCircle,
    title: "Всё на месте",
    text: "Чаты, каналы, друзья и история переписки остались с вами.",
  },
];

/**
 * OOBE обновления до Cordy 8.0.
 *
 * Макет повторяет лучшие экраны прошлых версий: слева — крупный
 * заголовок, описание и действия, справа — карточка-сцена. В карточке
 * логотип WinChat и подпись «WinChat 8.0» рассыпаются, цифры 8.0
 * остаются на месте, рядом снизу поднимается «Cordy».
 */
export default function OobeUpdate8({ winPro, onFinish, variant = "you" }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("oobe-active");
    return () => root.classList.remove("oobe-active");
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    if (step !== 1) return;
    setRevealed(false);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setRevealed(true), reduce ? 350 : 1600);
    return () => window.clearTimeout(timer);
  }, [step]);

  return (
    <div
      className="c8"
      data-variant={variant}
      data-revealed={revealed ? "1" : "0"}
    >
      <div className="c8-bg" aria-hidden />

      <header className="c8-topbar">
        <div className="c8-brand">
          <img src="/cordy-logo.svg" alt="" decoding="async" />
          <span>Cordy</span>
        </div>
        <span className="c8-chip">8.0 · Closed Beta</span>
      </header>

      <main className="c8-main">
        <div className="c8-grid">
          <section className="c8-copy" key={`copy-${step}`}>
            {step === 1 ? (
              <>
                <p className="c8-kicker">
                  <span className="c8-dot" aria-hidden />
                  Обновление установлено
                </p>
                <h1 className="c8-title">
                  Cordy
                  <em>Messenger</em>
                </h1>
                <p className="c8-lead">
                  Эпоха WinChat прошла. Встречайте обновленный WinChat только под
                  названием Cordy Messenger!
                </p>

                <ul className="c8-points">
                  <li>
                    <Check /> Тот же аккаунт
                  </li>
                  <li>
                    <Check /> Все чаты на месте
                  </li>
                  <li>
                    <Check /> Версия 8.0
                  </li>
                </ul>

                <div className="c8-actions">
                  <button
                    type="button"
                    className="c8-btn c8-btn--primary"
                    onClick={() => setStep(2)}
                  >
                    Продолжить
                    <ArrowRight />
                  </button>
                  <button
                    type="button"
                    className="c8-btn c8-btn--ghost"
                    onClick={onFinish}
                  >
                    Открыть Cordy
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="c8-kicker">
                  <span className="c8-dot" aria-hidden />
                  Версия 8.0
                </p>
                <h1 className="c8-title">
                  Что
                  <em>нового</em>
                </h1>
                <p className="c8-lead">
                  Коротко о главном — и можно возвращаться к общению.
                </p>

                <ul className="c8-features">
                  {FEATURES.map(({ icon: Icon, title, text }) => (
                    <li key={title}>
                      <span className="c8-feature-icon" aria-hidden>
                        <Icon />
                      </span>
                      <span className="c8-feature-copy">
                        <strong>{title}</strong>
                        <span>{text}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {winPro !== null && (
                  <p className="c8-footnote">
                    <ShieldCheck />
                    {winPro
                      ? "WinPro активен — доступны все возможности."
                      : "Базовые возможности доступны всем."}
                  </p>
                )}

                <div className="c8-actions">
                  <button
                    type="button"
                    className="c8-btn c8-btn--primary"
                    onClick={onFinish}
                  >
                    Открыть Cordy Messenger
                    <CheckCheck />
                  </button>
                  <button
                    type="button"
                    className="c8-btn c8-btn--ghost"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft />
                    Назад
                  </button>
                </div>
              </>
            )}

            <div className="c8-progress" aria-label={`Шаг ${step} из 2`}>
              <span className={step >= 1 ? "is-active" : ""} />
              <span className={step >= 2 ? "is-active" : ""} />
              <small>Шаг {step} из 2</small>
            </div>
          </section>

          <aside className="c8-panel">
            <div className="c8-panel-top">
              <span className="c8-panel-label">
                {step === 1 ? "Преображение" : "Готово"}
              </span>
              <span className="c8-panel-chip">
                {step === 1 ? "WinChat → Cordy" : "8.0 · Closed Beta"}
              </span>
            </div>

            <div className="c8-panel-body">
              {step === 1 ? (
                <div className="c8-stage" aria-label="WinChat становится Cordy 8.0">
                  <div className="c8-icon" aria-hidden>
                    {SHARDS.map((n) => (
                      <span key={n} className={`c8-shard c8-shard--${n}`}>
                        <span className="c8-tile">
                          <img src="/logo.jpg" alt="" decoding="async" />
                        </span>
                      </span>
                    ))}
                    <span className="c8-new-icon">
                      <img src="/cordy-logo.svg" alt="" decoding="async" />
                    </span>
                  </div>

                  <div className="c8-line">
                    <span className="c8-slot">
                      <span className="c8-old" aria-hidden>
                        {OLD_NAME.map((ch, i) => (
                          <span key={i} className="c8-old-ch">
                            {ch}
                          </span>
                        ))}
                      </span>
                      <span className="c8-new">
                        {NEW_NAME.map((ch, i) => (
                          <span key={i} className="c8-new-ch">
                            {ch}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="c8-ver">8.0</span>
                    <span className="c8-ring" aria-hidden />
                    <span className="c8-ring c8-ring--late" aria-hidden />
                  </div>
                </div>
              ) : (
                <div className="c8-final">
                  <div className="c8-final-mark">
                    <span className="c8-final-ring" aria-hidden />
                    <span className="c8-final-ring c8-final-ring--late" aria-hidden />
                    <img src="/cordy-logo.svg" alt="" decoding="async" />
                  </div>
                  <p className="c8-final-name">
                    Cordy <span>8.0</span>
                  </p>
                  <p className="c8-final-note">Тот же мессенджер. Новое имя.</p>
                </div>
              )}
            </div>

            <div className="c8-panel-foot">
              {step === 1 ? (
                <>
                  <span className="c8-foot-old">WinChat</span>
                  <ArrowRight aria-hidden />
                  <span className="c8-foot-new">Cordy</span>
                </>
              ) : (
                <>
                  <span className="c8-foot-new">
                    <CheckCheck aria-hidden /> Обновление установлено
                  </span>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
