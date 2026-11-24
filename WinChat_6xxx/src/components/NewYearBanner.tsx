import { useEffect, useMemo, useState } from "react";

/** Момент выхода новогодней версии WinChat 7.0.0 (29.11.2026, 00:00 по Москве). */
const NEW_YEAR_DEADLINE_MS = Date.parse("2026-11-29T00:00:00+03:00");

/** Цвета лампочек гирлянды (повторяются по кругу). */
const BULB_COLORS = ["#ff5252", "#ffd400", "#52ffa0", "#54b8ff", "#ff7ad9"];

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function getTimeLeft(): TimeLeft {
  const diff = NEW_YEAR_DEADLINE_MS - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
    expired: false,
  };
}

/* ---------- SVG-иконки ---------- */

/** Снежинка из шести лучей с ответвлениями. */
function SnowflakeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {[0, 60, 120].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 12 12)`}>
            <line x1="12" y1="2.5" x2="12" y2="21.5" />
            <path d="M12 5.5 9.6 3.4M12 5.5l2.4-2.1" />
            <path d="M12 18.5l-2.4 2.1M12 18.5l2.4 2.1" />
            <path d="M12 9.2 9.9 7.4M12 9.2l2.1-1.8" />
            <path d="M12 14.8l-2.1 1.8M12 14.8l2.1 1.8" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Ёлочная игрушка — шарик на ниточке с бликом. */
function OrnamentIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden>
      <path d="M12 2v3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="10.2" y="4.6" width="3.6" height="2.6" rx="0.9" fill="currentColor" opacity="0.85" />
      <circle cx="12" cy="14.6" r="7" fill="currentColor" opacity="0.22" />
      <circle cx="12" cy="14.6" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.3 11.6a3.4 3.4 0 0 1 2-1.7" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

/** Звезда — маркер справа от заголовка. */
function StarIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden>
      <path d="M12 2.6c.5 4.6 2.2 6.9 7 7.4-4.8.5-6.5 2.8-7 7.4-.5-4.6-2.2-6.9-7-7.4 4.8-.5 6.5-2.8 7-7.4Z" />
      <path d="M19 15.2c.26 2.3 1.1 3.4 3.5 3.7-2.4.26-3.24 1.4-3.5 3.7-.26-2.3-1.1-3.44-3.5-3.7 2.4-.3 3.24-1.4 3.5-3.7Z" opacity="0.75" />
    </svg>
  );
}

/* ---------- Мелкие элементы ---------- */

/** Одна лампочка гирлянды с миганием и свечением. */
function Bulb({ index }: { index: number }) {
  const color = BULB_COLORS[index % BULB_COLORS.length];
  return (
    <span
      className="ny-banner-bulb"
      style={{
        background: `radial-gradient(circle at 35% 30%, #fff 0%, ${color} 55%, ${color} 100%)`,
        boxShadow: `0 0 7px 2px ${color}b3`,
        animationDelay: `${(index % 7) * 0.3}s`,
      }}
    />
  );
}

/** Падающие снежинки на фоне карточки. */
function Flakes() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        left: 6 + ((i * 13) % 90),
        size: 8 + (i % 3) * 4,
        delay: (i * 1.7) % 9,
        dur: 8 + (i % 4) * 2.5,
        sway: i % 2 === 0 ? 14 : -14,
      })),
    []
  );
  return (
    <div className="ny-banner-flakes" aria-hidden>
      {flakes.map((f, i) => (
        <SnowflakeIcon
          key={i}
          className="ny-banner-flake"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            animationDelay: `${f.delay}s`,
            animationDuration: `${f.dur}s`,
            // @ts-expect-error — CSS-переменная для размаха вправо/влево
            "--ny-sway": `${f.sway}px`,
          }}
        />
      ))}
    </div>
  );
}

/** Ячейка отсчёта: число + подпись. */
function Cell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="ny-banner-num">{String(value).padStart(2, "0")}</span>
      <span className="ny-banner-cell-label">{label}</span>
    </div>
  );
}

/**
 * Новогодний баннер-отсчёт до выхода WinChat 7.0.0.
 * Жёлтое окошко с анимированной гирляндой сверху и падающими снежинками;
 * показывается на ПК и телефонах до 29.11.2026, после — сообщение
 * об ожидании обновления.
 */
export default function NewYearBanner() {
  const [closed, setClosed] = useState(false);
  const [time, setTime] = useState<TimeLeft>(getTimeLeft);

  useEffect(() => {
    const id = window.setInterval(() => setTime(getTimeLeft()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /* Гирлянда: провод с провисающими дугами и лампочками. */
  const garland = useMemo(() => {
    const sections = 7;
    const perSection = 2;
    let bulbIndex = 0;
    return (
      <div className="ny-banner-garland" aria-hidden>
        <svg viewBox={`0 0 ${sections * 100} 26`} preserveAspectRatio="none" className="ny-banner-wire">
          {Array.from({ length: sections }, (_, s) => (
            <path
              key={s}
              d={`M${s * 100} 4 Q ${s * 100 + 50} 22 ${(s + 1) * 100} 4`}
              fill="none"
              stroke="#a8790a"
              strokeWidth="2"
            />
          ))}
        </svg>
        <div className="ny-banner-bulbs">
          {Array.from({ length: sections }, (_, s) =>
            Array.from({ length: perSection }, (_, b) => {
              const idx = bulbIndex++;
              const t = (b + 0.5) / perSection;
              const droop = 12 * 4 * t * (1 - t);
              return (
                <span key={idx} className="ny-banner-bulb-slot" style={{ bottom: `${droop - 4}px` }}>
                  <Bulb index={idx} />
                </span>
              );
            })
          )}
        </div>
      </div>
    );
  }, []);

  if (closed) return null;

  return (
    <div className="font-app pointer-events-none fixed inset-x-0 top-0 z-[97] flex justify-center px-3 pt-[max(10px,env(safe-area-inset-top))]">
      <div className="ny-banner animate-banner-drop pointer-events-auto relative w-full max-w-xl overflow-hidden">
        {/* Бегущий световой блик */}
        <div className="ny-banner-shine" aria-hidden />
        <Flakes />
        {garland}

        <button type="button" onClick={() => setClosed(true)} className="ny-banner-close" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>

        <div className="relative px-5 pb-4 pt-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <OrnamentIcon className="ny-icon-sway ny-icon-ornament h-5 w-5 shrink-0 text-[#0f8a4d]" />
            <p className="text-[13.5px] font-extrabold leading-snug text-[#5c4300] sm:text-[15px]">
              До выхода новогодней версии WinChat : 7.0.0
            </p>
            <StarIcon className="ny-icon-spin ny-icon-star h-5 w-5 shrink-0 text-[#e8a400]" />
          </div>

          {time.expired ? (
            <div className="mt-3 inline-flex items-center gap-2.5 rounded-full bg-white/50 px-4 py-2 shadow-[inset_0_0_0_1.5px_rgba(196,144,0,0.4)]">
              <SnowflakeIcon className="ny-icon-pulse h-5 w-5 shrink-0 text-[#2f7fd1]" />
              <p className="text-[14px] font-extrabold text-[#5c4300] sm:text-[15px]">
                Ожидайте обновление, оно придёт в течении дня
              </p>
            </div>
          ) : (
            <div className="mt-3.5 flex items-start justify-center gap-1.5 sm:gap-2.5">
              <Cell value={time.days} label="дни" />
              <span className="ny-banner-sep">:</span>
              <Cell value={time.hours} label="часы" />
              <span className="ny-banner-sep">:</span>
              <Cell value={time.minutes} label="минуты" />
              <span className="ny-banner-sep">:</span>
              <Cell value={time.seconds} label="секунды" />
            </div>
          )}

          <p className="mt-3 flex items-center justify-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#8a6a00]">
            <SnowflakeIcon className="h-3 w-3 text-[#b98d00]" />
            Отчёт до 29.11.2026
            <SnowflakeIcon className="h-3 w-3 text-[#b98d00]" />
          </p>
        </div>
      </div>

      <style>{`
        .ny-banner {
          border-radius: 24px;
          background: linear-gradient(180deg, #ffe98f 0%, #ffd54a 55%, #ffc93c 100%);
          border: 2px solid #f3b90f;
          box-shadow: 0 18px 44px -18px rgba(160, 110, 0, 0.55),
                      inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }
        .ny-banner-shine {
          position: absolute;
          top: -60%;
          left: -30%;
          width: 40%;
          height: 220%;
          transform: rotate(18deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: ny-shine 4.5s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes ny-shine {
          0%, 55% { left: -35%; }
          100% { left: 115%; }
        }
        .ny-banner-flakes {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .ny-banner-flake {
          position: absolute;
          top: -16px;
          color: #fff;
          opacity: 0;
          animation-name: ny-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes ny-fall {
          0% { transform: translate(0, -16px) rotate(0deg); opacity: 0; }
          12% { opacity: 0.8; }
          85% { opacity: 0.55; }
          100% { transform: translate(var(--ny-sway, 12px), 150px) rotate(180deg); opacity: 0; }
        }
        .ny-banner-garland {
          position: absolute;
          top: -2px;
          left: 14px;
          right: 14px;
          height: 30px;
          pointer-events: none;
        }
        .ny-banner-wire {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .ny-banner-bulbs {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: repeat(14, 1fr);
        }
        .ny-banner-bulb-slot {
          position: relative;
          justify-self: center;
          align-self: end;
          display: inline-flex;
        }
        .ny-banner-bulb {
          width: 9px;
          height: 12px;
          border-radius: 50% 50% 55% 55%;
          margin-top: 3px;
          animation: ny-bulb-blink 1.9s ease-in-out infinite;
        }
        .ny-banner-bulb::before {
          content: "";
          position: absolute;
          top: -3px;
          left: 50%;
          width: 4px;
          height: 3.5px;
          transform: translateX(-50%);
          border-radius: 1.5px;
          background: #8a6a00;
        }
        @keyframes ny-bulb-blink {
          0%, 100% { opacity: 1; filter: brightness(1.15); }
          50% { opacity: 0.4; filter: brightness(0.85); }
        }
        .ny-banner-close {
          position: absolute;
          top: 10px;
          right: 12px;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 50%;
          background: rgba(92, 67, 0, 0.12);
          color: #5c4300;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .ny-banner-close:hover { background: rgba(92, 67, 0, 0.22); transform: rotate(90deg); }
        .ny-banner-close svg { width: 13px; height: 13px; }
        .ny-icon-sway {
          transform-origin: 50% 12%;
          animation: ny-sway 3.2s ease-in-out infinite;
        }
        @keyframes ny-sway {
          0%, 100% { transform: rotate(-9deg); }
          50% { transform: rotate(9deg); }
        }
        .ny-icon-spin {
          animation: ny-sparkle 2.6s ease-in-out infinite;
        }
        @keyframes ny-sparkle {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
          50% { transform: scale(1.25) rotate(20deg); opacity: 0.8; }
        }
        .ny-icon-pulse {
          animation: ny-pulse 2.2s ease-in-out infinite;
        }
        @keyframes ny-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.75; }
        }
        .ny-banner-num {
          display: inline-flex;
          min-width: 46px;
          justify-content: center;
          padding: 7px 8px;
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.6);
          box-shadow: inset 0 0 0 1.5px rgba(196, 144, 0, 0.45),
                      0 4px 10px -6px rgba(120, 84, 0, 0.45);
          color: #4a3600;
          font-size: 20px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .ny-banner-cell-label {
          margin-top: 3px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #8a6a00;
        }
        .ny-banner-sep {
          padding-top: 11px;
          font-size: 18px;
          font-weight: 900;
          color: #a37b00;
          animation: ny-sep-blink 1s steps(2, start) infinite;
        }
        @keyframes ny-sep-blink {
          0%, 60% { opacity: 1; }
          61%, 100% { opacity: 0.25; }
        }
        .animate-banner-drop {
          animation: banner-drop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes banner-drop {
          from { transform: translateY(-28px) scale(0.96); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
