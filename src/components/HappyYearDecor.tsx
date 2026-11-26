import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MoonStar, Snowflake, Sun, Volume2, VolumeX } from "lucide-react";
import code1 from "../bages/code_1.png";
import { useNyDark } from "../lib/nyTheme";
import "./happy-year.css";

/* ============================================================
   WinChat 7.0 — новогодний декор.
   Только SVG и CSS: никаких эмодзи и растровых стикеров.
   ============================================================ */

const GARLAND_COLORS = ["#d32f2f", "#f6b93b", "#2e7d32", "#1976d2", "#8e24aa"];
const NY_MOBILE_GARLAND_COLORS = ["#e53935", "#ffca28", "#43a047", "#1e88e5", "#8e24aa", "#ff7043", "#ab47bc"];

/** Гирлянда с провисающей нитью и светящимися лампочками. */
export function HappyYearGarland({
  bulbs = 16,
  className = "",
  stretch = true,
}: {
  bulbs?: number;
  className?: string;
  /** Растягивать по ширине (для узких рамок) или сохранять форму лампочек. */
  stretch?: boolean;
}) {
  const step = 56;
  const width = bulbs * step;
  const sags = Array.from({ length: bulbs }, (_, i) => 42 + (i % 3) * 4);
  const segments: string[] = [];
  for (let i = 0; i < bulbs; i++) {
    const x = i * step + step / 2;
    segments.push(`Q ${x} ${sags[i]} ${(i + 1) * step} 8`);
  }
  const path = `M 0 8 ${segments.join(" ")}`;

  return (
    <svg
      className={`hy-garland ${className}`}
      viewBox={`0 0 ${width} 104`}
      width="100%"
      height={104}
      preserveAspectRatio={stretch ? "none" : "xMidYMid meet"}
      aria-hidden="true"
      focusable="false"
    >
      <path className="hy-garland-wire" d={path} />
      <path className="hy-garland-wire hy-garland-wire--light" d={path} />
      {Array.from({ length: bulbs }, (_, i) => {
        const x = i * step + step / 2;
        // Точка на кривой Q: её середина чуть ниже контрольной точки.
        const y = (8 + 2 * sags[i] + 8) / 4;
        const color = GARLAND_COLORS[i % GARLAND_COLORS.length];
        return (
          <g
            className="hy-garland-bulb"
            key={i}
            style={{
              color,
              animationDelay: `${(i % 6) * 0.3}s`,
            }}
          >
            <circle cx={x} cy={y + 22} r="17" className="hy-garland-halo" />
            <line x1={x} y1={y - 2} x2={x} y2={y + 11} />
            <rect
              x={x - 4}
              y={y + 9}
              width="8"
              height="7"
              rx="2"
              className="hy-garland-cap"
            />
            <circle cx={x} cy={y + 24} r="10" fill={color} />
            <circle cx={x - 3.5} cy={y + 20} r="2.6" className="hy-garland-shine" />
            <g
              className="hy-garland-spark"
              transform={`translate(${x + 11} ${y + 17}) scale(${0.72 + (i % 3) * 0.22})`}
              style={{ animationDelay: `${(i % 5) * 0.42}s` }}
            >
              <path d="M0 -6.5 1.7 -1.7 6.5 0 1.7 1.7 0 6.5 -1.7 1.7 -6.5 0 -1.7 -1.7Z" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Мягкий снегопад из SVG-снежинок двух размеров. */
export function HappyYearSnow({
  count = 22,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  const flakes = Array.from({ length: count }, (_, i) => {
    const left = (i * 37 + 11) % 100;
    const delay = -((i * 1.7) % 14);
    const duration = 10 + (i % 6) * 2.4;
    const size = i % 3 === 0 ? 16 + (i % 4) * 4 : 9 + (i % 4) * 4;
    return { left, delay, duration, size, soft: i % 3 === 0 };
  });

  return (
    <div className={`hy-snow ${className}`} aria-hidden="true">
      {flakes.map((f, i) => (
        <svg
          key={i}
          className={`hy-snowflake ${f.soft ? "hy-snowflake--soft" : ""}`}
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            animationDelay: `${f.delay}s`,
            animationDuration: `${f.duration}s`,
          }}
          viewBox="0 0 24 24"
        >
          <g
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          >
            <path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10" />
            <path d="M12 6l-2-2M12 6l2-2M12 18l-2 2M12 18l2 2" />
            <path d="M6.5 9.5L4 9M6.5 9.5L6 6.7M17.5 14.5L20 15M17.5 14.5L18 17.3" />
            <path d="M6.5 14.5L4 15M6.5 14.5L6 17.3M17.5 9.5L20 9M17.5 9.5L18 6.7" />
          </g>
        </svg>
      ))}
    </div>
  );
}

/** Ёлочные шарики, подвешенные к верхнему краю экрана. */
export function HappyYearHangingOrnaments({ className = "" }: { className?: string }) {
  const ornaments = [
    { left: "5%", size: 46, drop: 54, tone: "red", delay: 0 },
    { left: "16%", size: 64, drop: 26, tone: "gold", delay: 1.2 },
    { left: "27%", size: 38, drop: 74, tone: "green", delay: 0.6 },
    { left: "39%", size: 54, drop: 40, tone: "blue", delay: 1.8 },
    { left: "58%", size: 42, drop: 64, tone: "violet", delay: 0.9 },
    { left: "69%", size: 66, drop: 22, tone: "red", delay: 2.1 },
    { left: "81%", size: 40, drop: 70, tone: "gold", delay: 1.5 },
    { left: "92%", size: 52, drop: 44, tone: "green", delay: 0.3 },
  ];

  return (
    <div className={`hy-hanging ${className}`} aria-hidden="true">
      {ornaments.map((o, i) => (
        <span
          key={i}
          className={`hy-hanging-item hy-tone-${o.tone}`}
          style={
            {
              left: o.left,
              "--hy-size": `${o.size}px`,
              "--hy-drop": `${o.drop}px`,
              animationDelay: `${o.delay}s`,
            } as CSSProperties
          }
        >
          <span className="hy-hanging-string" />
          <span className="hy-hanging-ball">
            <span className="hy-hanging-shine" />
          </span>
        </span>
      ))}
    </div>
  );
}

/** Подарки у подножия ёлки. */
export function HappyYearGifts({ className = "" }: { className?: string }) {
  return (
    <svg className={`hy-gifts ${className}`} viewBox="0 0 220 130" width={220} height={130} aria-hidden="true">
      <ellipse cx="110" cy="122" rx="92" ry="8" className="hy-gift-shadow" />
      <g className="hy-gift hy-gift--red">
        <rect x="8" y="62" width="62" height="58" rx="7" />
        <rect x="4" y="54" width="70" height="16" rx="5" className="hy-gift-lid" />
        <rect x="33" y="54" width="12" height="66" className="hy-gift-ribbon" />
        <path d="M39 54c-10-14-22-10-20 0 2 8 12 6 20 0z" className="hy-gift-bow" />
        <path d="M39 54c10-14 22-10 20 0-2 8-12 6-20 0z" className="hy-gift-bow" />
      </g>
      <g className="hy-gift hy-gift--green">
        <rect x="74" y="76" width="74" height="44" rx="7" />
        <rect x="70" y="68" width="82" height="15" rx="5" className="hy-gift-lid" />
        <rect x="106" y="68" width="13" height="52" className="hy-gift-ribbon" />
        <path d="M112 68c-11-13-23-9-21 0 2 8 12 6 21 0z" className="hy-gift-bow" />
        <path d="M112 68c11-13 23-9 21 0-2 8-12 6-21 0z" className="hy-gift-bow" />
      </g>
      <g className="hy-gift hy-gift--gold">
        <rect x="154" y="72" width="56" height="48" rx="7" />
        <rect x="150" y="64" width="64" height="15" rx="5" className="hy-gift-lid" />
        <rect x="176" y="64" width="12" height="56" className="hy-gift-ribbon" />
        <path d="M182 64c-10-13-22-9-20 0 2 8 12 6 20 0z" className="hy-gift-bow" />
        <path d="M182 64c10-13 22-9 20 0-2 8-12 6-20 0z" className="hy-gift-bow" />
      </g>
    </svg>
  );
}

/** Ёлочный шарик-кнопка: внутри — SVG-иконка (микрофон, отправка и т.д.). */
export function HappyYearOrb({
  icon,
  label,
  onClick,
  tone = "red",
  active = false,
  disabled = false,
  className = "",
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  tone?: "red" | "gold" | "green" | "blue" | "violet";
  active?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`hy-orb hy-orb--${tone} ${active ? "is-active" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
    >
      <span className="hy-orb-cap" aria-hidden="true" />
      <span className="hy-orb-string" aria-hidden="true" />
      <span className="hy-orb-ball">
        <span className="hy-orb-shine" aria-hidden="true" />
        <span className="hy-orb-icon">{icon}</span>
      </span>
    </button>
  );
}

const TARGET = new Date(2027, 0, 1, 0, 0, 0, 0).getTime();

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Отсчёт до 01.01.2027 00:00 (по местному времени устройства). */
export function HappyYearCountdown({
  compact = false,
  inline = false,
  className = "",
}: {
  compact?: boolean;
  inline?: boolean;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const diff = Math.max(0, TARGET - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  const finished = diff === 0;

  if (inline) {
    return (
      <div className={`hy-countdown hy-countdown--inline ${className}`} role="timer" aria-live="off">
        {finished ? (
          <span className="hy-countdown-inline-finished">С Новым 2027 годом!</span>
        ) : (
          <>
            <span className="hy-countdown-inline-label">До 2027</span>
            <span className="hy-countdown-inline-value">
              <strong>{days}</strong> дн
            </span>
            <span className="hy-countdown-inline-clock">
              {pad(hours)}:{pad(minutes)}:{pad(seconds)}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`hy-countdown ${compact ? "hy-countdown--compact" : ""} ${className}`}
      role="timer"
      aria-live="off"
    >
      {finished ? (
        <div className="hy-countdown-finished">С Новым 2027 годом!</div>
      ) : (
        <>
          <div className="hy-countdown-label">
            <span className="hy-countdown-label-line" aria-hidden />
            До 01.01.2027 · 00:00
            <span className="hy-countdown-label-line" aria-hidden />
          </div>
          <div className="hy-countdown-grid">
            {[
              { value: days, unit: "дней", live: false },
              { value: hours, unit: "часов", live: false },
              { value: minutes, unit: "минут", live: false },
              { value: seconds, unit: "секунд", live: true },
            ].map((item) => (
              <div className="hy-countdown-cell" key={item.unit}>
                <span
                  key={item.live ? item.value : undefined}
                  className={`hy-countdown-value ${item.live ? "is-live" : ""}`}
                >
                  {item.unit === "дней" ? item.value : pad(item.value)}
                </span>
                <span className="hy-countdown-unit">{item.unit}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------
   Новогодняя фоновая музыка.
   Автовоспроизведение браузеры блокируют, поэтому музыка
   стартует с первого касания/клика и всегда имеет переключатель.
   ------------------------------------------------------------ */

const MELODY_URLS = {
  oobe: new URL("../media_system_files/melodies/oobe_melody_new_year.mp3", import.meta.url).href,
  bg: new URL("../media_system_files/melodies/new-year.ogg", import.meta.url).href,
} as const;

const MELODY_KEY = "winchat_oobe_melody";

export function HappyYearMelody({
  className = "",
  track = "oobe",
  volume = 0.32,
  storageKey = MELODY_KEY,
  label = "Новогодняя мелодия",
  compact = false,
}: {
  className?: string;
  track?: keyof typeof MELODY_URLS;
  volume?: number;
  storageKey?: string;
  label?: string;
  /** Компактный режим: только значок шарика с нотой — для настроек. */
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantRef = useRef(true);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const src = MELODY_URLS[track];
  const posKey = `${storageKey}_pos`;

  useEffect(() => {
    try {
      wantRef.current = localStorage.getItem(storageKey) !== "off";
    } catch {
      wantRef.current = true;
    }
    try {
      const raw = localStorage.getItem(posKey);
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) {
          setPos(p);
          posRef.current = p;
        }
      }
    } catch {
      /* no-op */
    }

    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = volume;
    audio.preload = "auto";
    audioRef.current = audio;

    const start = () => {
      if (!wantRef.current || !audio.paused) return;
      void audio.play().catch(() => undefined);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    start();
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    window.addEventListener("touchstart", start, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      window.removeEventListener("touchstart", start);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [src, storageKey, volume]);

  const clampPos = (x: number, y: number) => {
    const w = btnRef.current?.offsetWidth ?? 170;
    const h = btnRef.current?.offsetHeight ?? 48;
    const pad = 8;
    return {
      x: Math.min(window.innerWidth - w - pad, Math.max(pad, x)),
      y: Math.min(window.innerHeight - h - pad, Math.max(pad, y)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Клик по самой кнопке не должен запускать трек через глобальный
    // pointerdown — иначе toggle() сразу выключает только что включенное.
    e.stopPropagation();
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const next = clampPos(e.clientX - d.dx, e.clientY - d.dy);
    const prev = posRef.current ?? next;
    if (Math.abs(next.x - prev.x) > 2 || Math.abs(next.y - prev.y) > 2) {
      d.moved = true;
      movedRef.current = true;
    }
    posRef.current = next;
    setPos(next);
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved && posRef.current) {
      try { localStorage.setItem(posKey, JSON.stringify(posRef.current)); } catch { /* no-op */ }
      setTimeout(() => { movedRef.current = false; }, 0);
    } else {
      movedRef.current = false;
    }
  };

  const toggle = () => {
    if (movedRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    // Ориентируемся на сам плеер, а не на React-стейт: global pointerdown
    // может уже запустить трек, и состояние окажется устаревшим.
    if (!audio.paused) {
      audio.pause();
      wantRef.current = false;
      try { localStorage.setItem(storageKey, "off"); } catch { /* no-op */ }
      return;
    }
    wantRef.current = true;
    try { localStorage.setItem(storageKey, "on"); } catch { /* no-op */ }
    void audio.play().catch(() => undefined);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`hy-melody ${playing ? "is-playing" : ""} ${compact ? "hy-melody--compact" : ""} ${pos ? "is-dragged" : ""} ${className}`}
      style={pos && !compact ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
      onClick={toggle}
      onPointerDown={compact ? (e) => e.stopPropagation() : onPointerDown}
      onPointerMove={compact ? undefined : onPointerMove}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerUp={compact ? undefined : onPointerUp}
      onPointerCancel={compact ? undefined : onPointerUp}
      aria-pressed={playing}
      aria-label={playing ? `Выключить: ${label}` : `Включить: ${label}`}
      title={playing ? `Выключить: ${label}` : `Включить: ${label}`}
    >
      {compact ? (
        <span className="hy-melody-badge">{playing ? <Volume2 /> : <VolumeX />}</span>
      ) : (
        <>
          <span className="hy-melody-badge">{playing ? <Volume2 /> : <VolumeX />}</span>
          <span className="hy-melody-eq" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="hy-melody-text">{playing ? label : "Включить музыку"}</span>
        </>
      )}
    </button>
  );
}

/* ------------------------------------------------------------
   Классическая тёмная тема WinChat 7.0.
   Гирлянды и шарики начинают по-настоящему светиться.
   ------------------------------------------------------------ */

export function HappyYearThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useNyDark();

  return (
    <button
      type="button"
      className={`hy-theme-toggle ${dark ? "is-dark" : ""} ${className}`}
      onClick={() => setDark()}
      aria-pressed={dark}
      aria-label={dark ? "Включить светлую новогоднюю тему" : "Включить классическую тёмную тему"}
      title={dark ? "Светлая новогодняя тема" : "Классическая тёмная тема"}
    >
      <span className="hy-theme-ball">
        <span className="hy-theme-shine" aria-hidden="true" />
        <span className="hy-theme-icon">{dark ? <Sun /> : <MoonStar />}</span>
      </span>
      <span className="hy-theme-text">{dark ? "Светлая" : "Тёмная"}</span>
    </button>
  );
}

/** Ледяная снежинка-загрузчик. */
export function HappyYearLoader({
  label,
  className = "",
  compact = false,
}: {
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`hy-loader ${compact ? "hy-loader--compact" : ""} ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="hy-loader-crystal" aria-hidden="true">
        <span className="hy-loader-crystal-ring" />
        <Snowflake />
      </span>
      {label && <span className="hy-loader-label">{label}</span>}
    </div>
  );
}

/** Двухрядная гирлянда-косичка (для телефона — ярче и компактнее). */
export function HappyYearBraidedGarland({
  className = "",
  bulbsPerRow = 12,
}: {
  className?: string;
  bulbsPerRow?: number;
}) {
  const step = 42;
  const width = bulbsPerRow * step;
  const topSegments: string[] = [];
  const bottomSegments: string[] = [];
  for (let i = 0; i < bulbsPerRow; i++) {
    const x = i * step + step / 2;
    topSegments.push(`Q ${x} 22 ${(i + 1) * step} 4`);
    bottomSegments.push(`Q ${x} 52 ${(i + 1) * step} 36`);
  }

  return (
    <svg
      className={`hy-braided ${className}`}
      viewBox={`0 0 ${width} 72`}
      width="100%"
      height={72}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* верхний ряд */}
      <path className="hy-braided-wire hy-braided-wire--top" d={`M 0 4 ${topSegments.join(" ")}`} />
      {Array.from({ length: bulbsPerRow }, (_, i) => {
        const x = i * step + step / 2;
        const color = NY_MOBILE_GARLAND_COLORS[i % NY_MOBILE_GARLAND_COLORS.length];
        return (
          <g key={`t${i}`} className="hy-braided-bulb hy-braided-bulb--top" style={{ color, animationDelay: `${(i % 6) * 0.25}s` }}>
            <circle cx={x} cy={22} r="12" className="hy-braided-halo" />
            <line x1={x} y1={14} x2={x} y2={20} />
            <circle cx={x} cy={22} r="7" fill={color} />
            <circle cx={x - 2} cy={20} r="1.8" className="hy-braided-shine" />
          </g>
        );
      })}
      {/* нижний ряд */}
      <path className="hy-braided-wire hy-braided-wire--bot" d={`M 0 36 ${bottomSegments.join(" ")}`} />
      {Array.from({ length: bulbsPerRow }, (_, i) => {
        const x = i * step + step / 2;
        const color = NY_MOBILE_GARLAND_COLORS[(i + 2) % NY_MOBILE_GARLAND_COLORS.length];
        return (
          <g key={`b${i}`} className="hy-braided-bulb hy-braided-bulb--bot" style={{ color, animationDelay: `${(i % 6) * 0.25 + 0.3}s` }}>
            <circle cx={x} cy={52} r="12" className="hy-braided-halo" />
            <line x1={x} y1={44} x2={x} y2={50} />
            <circle cx={x} cy={52} r="7" fill={color} />
            <circle cx={x - 2} cy={50} r="1.8" className="hy-braided-shine" />
          </g>
        );
      })}
      {/* косичка между рядами */}
      <path className="hy-braided-weave" d={Array.from({ length: bulbsPerRow - 1 }, (_, i) => {
        const x1 = i * step + step * 0.75;
        const y1 = 18;
        const x2 = (i + 1) * step + step * 0.25;
        const y2 = 40;
        return `${i === 0 ? "M" : "L"} ${x1} ${y1} Q ${(x1 + x2) / 2} 30 ${x2} ${y2}`;
      }).join(" ")} />
    </svg>
  );
}

/** Снежинки-балерины — кружатся по экрану как танцовщицы. */
export function HappyYearSnowflakeDancers({ className = "" }: { className?: string }) {
  const dancers = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        left: (i * 13 + 5) % 90 + 5,
        delay: i * 0.8,
        duration: 18 + i * 2,
        size: 14 + (i % 3) * 6,
        color: i % 2 === 0 ? "#a9d3ec" : "#ffffff",
      })),
    [],
  );

  return (
    <div className={`hy-dancers ${className}`} aria-hidden="true">
      {dancers.map((d, i) => (
        <svg
          key={i}
          className="hy-dancer"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
            color: d.color,
          }}
          viewBox="0 0 24 24"
        >
          <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none">
            <path d="M12 2v20M12 2l-4 4M12 2l4 4M2 12h20M4 4l2 2M18 4l-2 2M4 20l2-2M18 20l-2-2" />
            <circle cx="12" cy="12" r="3" />
          </g>
        </svg>
      ))}
    </div>
  );
}

/** Катающийся снеговик — пасхалка внизу экрана. */
export function HappyYearRollingSnowman({
  className = "",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`hy-snowman ${className}`}
      onClick={onClick}
      aria-label="Снеговик-пасхалка"
      title="Нажми на снеговика!"
    >
      <svg viewBox="0 0 80 90" width={72} height={81} aria-hidden="true">
        {/* тень */}
        <ellipse cx="40" cy="86" rx="30" ry="4" fill="rgba(0,0,0,0.08)" />
        {/* низ */}
        <circle cx="40" cy="68" r="22" fill="#fff" stroke="#d6e8f0" strokeWidth="1" />
        {/* середина */}
        <circle cx="40" cy="46" r="16" fill="#fff" stroke="#d6e8f0" strokeWidth="1" />
        {/* голова */}
        <circle cx="40" cy="28" r="13" fill="#fff" stroke="#d6e8f0" strokeWidth="1" />
        {/* глаза */}
        <circle cx="35" cy="25" r="2" fill="#1d2a24" />
        <circle cx="45" cy="25" r="2" fill="#1d2a24" />
        {/* морковка */}
        <path d="M40 27l10 4-10 3z" fill="#ff7043" />
        {/* улыбка */}
        <path d="M34 32 Q40 36 46 32" stroke="#1d2a24" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {/* шапка */}
        <rect x="30" y="10" width="20" height="18" rx="3" fill="#1d2a24" />
        <rect x="26" y="24" width="28" height="4" rx="2" fill="#1d2a24" />
        {/* шарф */}
        <rect x="28" y="36" width="24" height="6" rx="3" fill="#e53935" />
        <rect x="46" y="36" width="6" height="14" rx="3" fill="#e53935" />
        {/* пуговицы */}
        <circle cx="40" cy="42" r="1.5" fill="#1d2a24" />
        <circle cx="40" cy="50" r="1.5" fill="#1d2a24" />
        <circle cx="40" cy="58" r="1.5" fill="#1d2a24" />
        {/* руки-палки */}
        <line x1="24" y1="44" x2="10" y2="34" stroke="#7a4b20" strokeWidth="2" strokeLinecap="round" />
        <line x1="56" y1="44" x2="70" y2="38" stroke="#7a4b20" strokeWidth="2" strokeLinecap="round" />
        {/* ведро на руке */}
        <rect x="66" y="28" width="8" height="10" rx="2" fill="#5f6b63" />
      </svg>
    </button>
  );
}

/** Падающая звезда — пролетает по экрану раз в несколько секунд. */
export function HappyYearShootingStars({ className = "" }: { className?: string }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        delay: i * 7 + 3,
        duration: 2.2,
        startX: 10 + i * 18,
        startY: 5 + (i % 3) * 12,
      })),
    [],
  );

  return (
    <div className={`hy-shooting ${className}`} aria-hidden="true">
      {stars.map((s, i) => (
        <div
          key={i}
          className="hy-shooting-star"
          style={{
            left: `${s.startX}%`,
            top: `${s.startY}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
            <line x1="0" y1="0" x2="36" y2="36" stroke="#f6d47a" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="36" cy="36" r="3" fill="#f6d47a" />
            <circle cx="36" cy="36" r="6" fill="none" stroke="#f6d47a" strokeWidth="0.8" opacity="0.5" />
          </svg>
        </div>
      ))}
    </div>
  );
}

/** Секретный мигающий шарик с конфетти — появляется случайно. */
export function HappyYearSecretOrb({ className = "" }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  const activate = useCallback(() => {
    setVisible(true);
    setCount((c) => c + 1);
    setTimeout(() => setVisible(false), 4000);
  }, []);

  useEffect(() => {
    const show = () => {
      const delay = 15000 + Math.random() * 25000;
      const timer = setTimeout(() => {
        setVisible(true);
        setTimeout(() => setVisible(false), 3500);
      }, delay);
      return () => clearTimeout(timer);
    };
    const cleanup = show();
    return cleanup;
  }, []);

  if (!visible) {
    return (
      <button
        type="button"
        className={`hy-secret-trigger ${className}`}
        onClick={activate}
        aria-label="Секретный шарик"
        title="Что-то мерцает...?"
      >
        <span className="hy-secret-dot" />
      </button>
    );
  }

  return (
    <div className="hy-secret-reveal" aria-hidden="true">
      <svg viewBox="0 0 120 120" width={120} height={120}>
        <circle cx="60" cy="60" r="48" fill="url(#hy-secret-grad)">
          <animate attributeName="r" values="44;50;44" dur="1.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="48" cy="46" r="12" fill="rgba(255,255,255,0.45)" />
        {/* конфетти */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i * 60 * Math.PI) / 180;
          const r = 56;
          return (
            <circle
              key={i}
              cx={60 + Math.cos(angle) * r}
              cy={60 + Math.sin(angle) * r}
              r={2.5 + (i % 2)}
              fill={["#e53935", "#ffca28", "#43a047", "#1e88e5", "#ab47bc", "#ff7043"][i]}
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                values={`${i * 60} 60 60;${i * 60 + 360} 60 60`}
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
        <defs>
          <radialGradient id="hy-secret-grad">
            <stop offset="0%" stopColor="#ffd54f" />
            <stop offset="60%" stopColor="#ff7043" />
            <stop offset="100%" stopColor="#e53935" />
          </radialGradient>
        </defs>
      </svg>
      {count > 0 && (
        <span className="hy-secret-count">✨ x{count}</span>
      )}
    </div>
  );
}

/** Фоновый новогодний слой: снег, огоньки и пасхалки. */
export function HappyYearBackdrop({
  className = "",
  dense = false,
  easterEggs = true,
}: {
  className?: string;
  dense?: boolean;
  easterEggs?: boolean;
}) {
  const stars = useMemo(
    () =>
      Array.from({ length: dense ? 28 : 18 }, (_, i) => ({
        left: (i * 37) % 100,
        top: (i * 19) % 60,
        size: 2 + (i % 3),
        delay: (i % 9) * 0.7,
      })),
    [dense],
  );

  const eggs = [
    { left: "8%", top: "72%", size: 34, rotate: -10, delay: "0s" },
    { left: "86%", top: "18%", size: 28, rotate: 12, delay: "1.8s" },
    { left: "92%", top: "74%", size: 30, rotate: -8, delay: "3.2s" },
  ];

  return (
    <div className={`hy-backdrop ${className}`} aria-hidden="true">
      <div className="hy-backdrop-glow hy-backdrop-glow--red" />
      <div className="hy-backdrop-glow hy-backdrop-glow--green" />
      <div className="hy-backdrop-glow hy-backdrop-glow--gold" />
      <HappyYearGarland className="hy-backdrop-garland" bulbs={22} stretch={false} />
      <HappyYearHangingOrnaments className="hy-backdrop-hanging" />
      <div className="hy-backdrop-stars">
        {stars.map((s, i) => (
          <span
            key={i}
            className="hy-backdrop-star"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>
      <HappyYearSnow className="hy-backdrop-snow" count={dense ? 34 : 24} />
      {easterEggs &&
        eggs.map((egg, i) => (
          <img
            key={i}
            src={code1}
            alt=""
            className="hy-easter-egg"
            style={{
              left: egg.left,
              top: egg.top,
              width: egg.size,
              animationDelay: egg.delay,
              ["--hy-egg-rot" as string]: `${egg.rotate}deg`,
            }}
            loading="lazy"
            decoding="async"
          />
        ))}
    </div>
  );
}
