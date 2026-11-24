import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MoonStar, Sun, Volume2, VolumeX } from "lucide-react";
import code1 from "../bages/code_1.png";
import { useNyDark } from "../lib/nyTheme";
import "./happy-year.css";

/* ============================================================
   WinChat 7.0 — новогодний декор.
   Только SVG и CSS: никаких эмодзи и растровых стикеров.
   ============================================================ */

const GARLAND_COLORS = ["#d32f2f", "#f6b93b", "#2e7d32", "#1976d2", "#8e24aa"];

/** Гирлянда с провисающей нитью и светящимися лампочками. */
export function HappyYearGarland({
  bulbs = 16,
  className = "",
}: {
  bulbs?: number;
  className?: string;
}) {
  const step = 56;
  const width = bulbs * step;
  const segments: string[] = [];
  for (let i = 0; i < bulbs; i++) {
    const x = i * step + step / 2;
    segments.push(`Q ${x} 48 ${(i + 1) * step} 8`);
  }
  const path = `M 0 8 ${segments.join(" ")}`;

  return (
    <svg
      className={`hy-garland ${className}`}
      viewBox={`0 0 ${width} 104`}
      width="100%"
      height={104}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="hy-garland-wire" d={path} />
      <path className="hy-garland-wire hy-garland-wire--light" d={path} />
      {Array.from({ length: bulbs }, (_, i) => {
        const x = i * step + step / 2;
        const y = 28;
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

/** Ёлочка с ярусами, снежными шапками и звездой. */
export function HappyYearTree({ className = "" }: { className?: string }) {
  return (
    <svg className={`hy-tree ${className}`} viewBox="0 0 120 156" width={120} height={156} aria-hidden="true">
      <ellipse className="hy-tree-shadow" cx="60" cy="148" rx="34" ry="5" />
      <path className="hy-tree-trunk" d="M53 124h14v22H53z" />
      <path className="hy-tree-tier" d="M60 8 31 58h17L17 98h27L13 128h94L80 98h27L76 58h17z" />
      <path
        className="hy-tree-snow"
        d="M31 58h17L17 98h27l-9 8H13l31-48zm58 0H76l31 40H80l9 8h25L89 58z"
      />
      <path className="hy-tree-star" d="M60 0l4.2 8.4 9.3 1.3-6.7 6.6 1.6 9.2-8.4-4.4-8.4 4.4 1.6-9.2-6.7-6.6 9.3-1.3z" />
      <circle cx="45" cy="60" r="4.2" fill="#e53935" />
      <circle cx="76" cy="60" r="4.2" fill="#1e88e5" />
      <circle cx="36" cy="96" r="4.2" fill="#f9a825" />
      <circle cx="84" cy="96" r="4.2" fill="#e53935" />
      <circle cx="60" cy="80" r="4.2" fill="#8e24aa" />
      <circle cx="52" cy="116" r="4.2" fill="#f9a825" />
      <circle cx="72" cy="116" r="4.2" fill="#1e88e5" />
    </svg>
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
  className = "",
}: {
  compact?: boolean;
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
}: {
  className?: string;
  track?: keyof typeof MELODY_URLS;
  volume?: number;
  storageKey?: string;
  label?: string;
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
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => undefined);
    };

    start();
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    window.addEventListener("touchstart", start, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      window.removeEventListener("touchstart", start);
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
    if (playing) {
      audio.pause();
      wantRef.current = false;
      try { localStorage.setItem(storageKey, "off"); } catch { /* no-op */ }
      setPlaying(false);
      return;
    }
    wantRef.current = true;
    try { localStorage.setItem(storageKey, "on"); } catch { /* no-op */ }
    void audio.play().then(() => setPlaying(true)).catch(() => undefined);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`hy-melody ${playing ? "is-playing" : ""} ${pos ? "is-dragged" : ""} ${className}`}
      style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
      onClick={toggle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-pressed={playing}
      aria-label={playing ? `Выключить: ${label}` : `Включить: ${label}`}
      title={playing ? "Выключить музыку (можно перетащить)" : `${label} (можно перетащить)`}
    >
      <span className="hy-melody-badge">{playing ? <Volume2 /> : <VolumeX />}</span>
      <span className="hy-melody-eq" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="hy-melody-text">{playing ? label : "Включить музыку"}</span>
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

/** Анимированная ёлка-загрузчик с мигающей гирляндой. */
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
      <svg className="hy-loader-tree" viewBox="0 0 120 156" width={compact ? 54 : 78} height={compact ? 70 : 101} aria-hidden="true">
        <path className="hy-loader-tier" d="M60 10 34 54h15L22 92h22L14 126h92L78 92h22L73 54h15z" />
        <path className="hy-loader-snow" d="M34 54h15L22 92h22l-8 8H14l26-46zm52 0H73l27 38H78l8 8h22L86 54z" />
        <path className="hy-loader-trunk" d="M53 122h14v24H53z" />
        <path className="hy-loader-star" d="M60 0l4.4 8.8 9.7 1.4-7 6.8 1.7 9.6-8.8-4.6-8.8 4.6 1.7-9.6-7-6.8 9.7-1.4z" />
        {[
          { cx: 46, cy: 58, fill: "#ff5252", delay: 0 },
          { cx: 74, cy: 58, fill: "#ffd54f", delay: 0.35 },
          { cx: 37, cy: 90, fill: "#69f0ae", delay: 0.7 },
          { cx: 83, cy: 90, fill: "#ff5252", delay: 1.05 },
          { cx: 60, cy: 76, fill: "#40c4ff", delay: 0.2 },
          { cx: 52, cy: 114, fill: "#ffd54f", delay: 0.55 },
          { cx: 72, cy: 114, fill: "#69f0ae", delay: 0.9 },
        ].map((light, i) => (
          <circle
            key={i}
            className="hy-loader-light"
            cx={light.cx}
            cy={light.cy}
            r="4.4"
            fill={light.fill}
            style={{ animationDelay: `${light.delay}s` }}
          />
        ))}
      </svg>
      {label && <span className="hy-loader-label">{label}</span>}
    </div>
  );
}

/** Фоновый новогодний слой: снег, ёлки, огоньки, пасхалки. */
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
      <HappyYearTree className="hy-backdrop-tree hy-backdrop-tree--l1" />
      <HappyYearTree className="hy-backdrop-tree hy-backdrop-tree--l2" />
      <HappyYearTree className="hy-backdrop-tree hy-backdrop-tree--l3" />
      <HappyYearTree className="hy-backdrop-tree hy-backdrop-tree--r1" />
      <HappyYearTree className="hy-backdrop-tree hy-backdrop-tree--r2" />
      <HappyYearTree className="hy-backdrop-tree hy-backdrop-tree--r3" />
      <HappyYearTree className="hy-backdrop-tree hy-backdrop-tree--c1" />
      <HappyYearTree className="hy-backdrop-tree hy-backdrop-tree--c2" />
      <HappyYearGifts className="hy-backdrop-gifts" />
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
