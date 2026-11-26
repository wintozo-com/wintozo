import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./boot.css";

type Phase = "loading" | "converge" | "reveal" | "exit";

const OUTER_DOTS = 16;
const INNER_DOTS = 10;

/** Минимум, чтобы точки успели покрутиться, а не просто мигнули. */
const MIN_LOAD_MS = 950;
/** Даём ёлочкам совершить часть оборота даже при быстрой загрузке. */
const CLASSIC_MIN_LOAD_MS = 3200;
/** Первый запуск / запуск после обновления: вся анимация длится ~10–13 с
 *  (7–10 с крутятся точки + ~3 с на сход, логотип и подпись). */
const LONG_LOAD_MIN_MS = 7000;
const LONG_LOAD_MAX_MS = 10000;
const CONVERGE_MS = 680;
const REVEAL_MS = 1800;
const CLASSIC_CONVERGE_MS = 1250;
const CLASSIC_REVEAL_MS = 2500;
const EXIT_MS = 460;

interface Props {
  /** Приложение загружено — точкам пора сходиться в логотип. */
  ready: boolean;
  /** Первый запуск или обновление: анимация загрузки заметно длиннее. */
  long?: boolean;
  /** classic — зимняя стандартная заставка, dots — заставка с орбитами. */
  variant?: "dots" | "classic";
  onDone: () => void;
}

function Orbit({ count, layer }: { count: number; layer: "outer" | "inner" }) {
  return (
    <div className={`boot__orbit boot__orbit--${layer}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        /* Хвост кометы: точки в начале круга ярче и крупнее. */
        const t = (count - i) / count;
        return (
          <span
            key={i}
            className="boot__dot"
            style={
              {
                "--i": i,
                "--step": `${360 / count}deg`,
                "--o": (0.18 + 0.82 * t).toFixed(3),
                "--k": (0.7 + 0.45 * t).toFixed(3),
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/** Монохромные ёлочки вращаются, пока приложение готовится к запуску. */
function FirOrbit({ count, layer }: { count: number; layer: "outer" | "middle" | "inner" }) {
  return (
    <div className={`boot-fir__orbit boot-fir__orbit--${layer}`}>
      {Array.from({ length: count }, (_, i) => (
        <span className="boot-fir__tree" key={i} style={{
          "--angle": `${i * 360 / count}deg`,
          "--tree-opacity": 0.55 + (i % 4) * 0.14,
          "--tree-delay": `${(i % 5) * -0.55}s`,
        } as CSSProperties}>
          <svg viewBox="0 0 32 44" focusable="false">
            <path className="boot-fir__tree-shape" d="M16 2 7.2 15h4.5L5.2 25h5.2L3 35h11v5h4v-5h11l-7.4-10h5.2l-6.5-10h4.5L16 2Z" />
            <path className="boot-fir__tree-detail" d="M16 9v22M11 21l5 3 5-3M9 30l7 3 7-3" />
          </svg>
        </span>
      ))}
    </div>
  );
}

function FestiveBoot() {
  return (
    <div className="boot-fir" aria-hidden="true">
      <div className="boot-fir__sky">
        {Array.from({ length: 48 }, (_, i) => (
          <span key={i} className={`boot-fir__particle ${i % 9 === 0 ? "is-star" : ""}`} style={{
            "--x": `${(i * 37 + 7) % 100}%`,
            "--y": `${(i * 53 + 11) % 100}%`,
            "--particle-size": `${i % 9 === 0 ? 8 : 2 + (i % 3)}px`,
            "--particle-delay": `${(i % 8) * -0.65}s`,
          } as CSSProperties} />
        ))}
      </div>
      <div className="boot-fir__stage">
        <span className="boot-fir__aura" />
        <span className="boot-fir__track boot-fir__track--outer" />
        <span className="boot-fir__track boot-fir__track--middle" />
        <span className="boot-fir__track boot-fir__track--inner" />
        <FirOrbit count={16} layer="outer" />
        <FirOrbit count={11} layer="middle" />
        <FirOrbit count={7} layer="inner" />
        <div className="boot-fir__core"><i /><i /><span /></div>
        <span className="boot-fir__ripple boot-fir__ripple--one" />
        <span className="boot-fir__ripple boot-fir__ripple--two" />
        <div className="boot-fir__circle">
          <div className="boot-fir__logo">
            <img src="/logo.jpg" alt="" draggable={false} />
            <span>W</span>
          </div>
        </div>
        <div className="boot-fir__word">WinChat</div>
      </div>
    </div>
  );
}

/**
 * Стартовый экран WinChat. Стандартная заставка наследует светлую или
 * тёмную тему мессенджера; вариант dots сохраняет свою анимацию орбит.
 */
export default function BootAnimation({
  ready,
  long = false,
  variant = "classic",
  onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  /* Длительность фиксируем на маунт (10–13 с при первом запуске/обновлении). */
  const minWaitMs = useMemo(
    () =>
      long
        ? LONG_LOAD_MIN_MS + Math.random() * (LONG_LOAD_MAX_MS - LONG_LOAD_MIN_MS)
        : variant === "classic" ? CLASSIC_MIN_LOAD_MS : MIN_LOAD_MS,
    [long, variant],
  );
  const startedAt = useRef(Date.now());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  /* Загрузка: точки крутятся, пока сервер не отдал данные (ready). */
  useEffect(() => {
    if (phase !== "loading" || !ready) return;
    const elapsed = Date.now() - startedAt.current;
    const wait = Math.max(0, minWaitMs - elapsed);
    const timer = window.setTimeout(() => setPhase("converge"), wait);
    return () => window.clearTimeout(timer);
  }, [phase, ready, minWaitMs]);

  /* Дальше фазы идут строго по таймеру. */
  useEffect(() => {
    if (phase === "converge") {
      const timer = window.setTimeout(() => setPhase("reveal"), variant === "classic" ? CLASSIC_CONVERGE_MS : CONVERGE_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "reveal") {
      const timer = window.setTimeout(() => setPhase("exit"), variant === "classic" ? CLASSIC_REVEAL_MS : REVEAL_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "exit") {
      const timer = window.setTimeout(() => doneRef.current(), EXIT_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase, variant]);

  return (
    <div
      className="boot"
      data-phase={phase}
      data-variant={variant}
      role="status"
      aria-live="polite"
      aria-label="Загрузка WinChat"
    >
      {variant === "classic" ? (
        <FestiveBoot />
      ) : (
        <div className="boot__stage" aria-hidden="true">
          <div className="boot__orbits">
            <Orbit count={OUTER_DOTS} layer="outer" />
            <Orbit count={INNER_DOTS} layer="inner" />
          </div>
          <span className="boot__core" />
          <span className="boot__flash" />
          <span className="boot__halo" />
          <span className="boot__pulse" />
          <span className="boot__line" />
          <div className="boot__mark">
            <img src="/logo.jpg" alt="" draggable={false} />
            <span className="boot__shine" />
          </div>
          <div className="boot__word"><span>WinChat</span></div>
        </div>
      )}
    </div>
  );
}
