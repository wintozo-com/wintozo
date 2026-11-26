import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./oobe-ice-intro.css";

const MIN_HITS = 5;
const MAX_HITS = 13;
const LOGO_SIZE = 148;
const BURST_MS = 1200;
const FLIGHT_MS = 1150;

function randHits() {
  return MIN_HITS + Math.floor(Math.random() * (MAX_HITS - MIN_HITS + 1));
}

/** До 13 трещин, каждая следующая ответвляется от предыдущей. */
const CRACK_PATHS = [
  "M104 96 L98 54 L104 22 L96 8 M101 36 L118 22 M100 62 L78 44",
  "M104 96 L150 68 L180 44 L192 26 M158 62 L166 40 M176 50 L190 54",
  "M104 96 L176 108 L196 126 M158 102 L172 86 M180 116 L196 114",
  "M104 96 L162 144 L178 176 M142 126 L158 122 M162 148 L180 158",
  "M104 96 L112 158 L104 192 M108 132 L126 148 M106 168 L90 186",
  "M104 96 L52 150 L36 180 M72 130 L50 126 M52 152 L30 160",
  "M104 96 L26 112 L6 130 M56 104 L38 92 M32 118 L10 112",
  "M104 96 L22 70 L6 52 M54 82 L40 62 M30 70 L12 74",
  "M104 96 L52 38 L34 16 M76 62 L58 44 M48 40 L26 40",
  "M104 96 L134 28 L128 8 M120 52 L142 38 M132 32 L150 16",
  "M104 96 L186 82 L194 60 M154 88 L172 72 M178 76 L192 80",
  "M104 96 L150 178 L138 194 M128 142 L146 160 M146 172 L166 184",
  "M104 96 L46 186 L26 196 M68 142 L44 162 M44 172 L20 178",
];

const SHARDS = [
  { clip: "polygon(50% 50%, 50% -60%, 110% -20%)", x: 0.35, y: -0.94, r: -18 },
  { clip: "polygon(50% 50%, 110% -20%, 150% 30%)", x: 0.9, y: -0.42, r: 14 },
  { clip: "polygon(50% 50%, 150% 30%, 150% 80%)", x: 1, y: 0.15, r: 22 },
  { clip: "polygon(50% 50%, 150% 80%, 110% 130%)", x: 0.82, y: 0.72, r: -16 },
  { clip: "polygon(50% 50%, 110% 130%, 50% 160%)", x: 0.28, y: 0.96, r: 20 },
  { clip: "polygon(50% 50%, 50% 160%, -10% 130%)", x: -0.28, y: 0.96, r: -24 },
  { clip: "polygon(50% 50%, -10% 130%, -50% 80%)", x: -0.82, y: 0.72, r: 18 },
  { clip: "polygon(50% 50%, -50% 80%, -50% 30%)", x: -1, y: 0.15, r: -20 },
  { clip: "polygon(50% 50%, -50% 30%, -10% -20%)", x: -0.9, y: -0.42, r: 16 },
  { clip: "polygon(50% 50%, -10% -20%, 50% -60%)", x: -0.35, y: -0.94, r: -14 },
];

const SNOW = Array.from({ length: 20 }, (_, i) => i);

type Phase = "frozen" | "burst" | "fly";
interface Flight { dx: number; dy: number; scale: number; }
interface Props { onDone: () => void; }

/** Ветер, затию что лёд треснул — лаконичная подсказка без лишней графики. */
const HINTS = ["Разбейте лёд", "Продолжайте", "Ещё чуть-чуть…"];

export default function OobeIceIntro({ onDone }: Props) {
  const [hits, setHits] = useState(0);
  const [phase, setPhase] = useState<Phase>("frozen");
  const [flight, setFlight] = useState<Flight | null>(null);
  const hitsToBreak = useMemo(() => randHits(), []);
  const doneRef = useRef(onDone);
  const timers = useRef<number[]>([]);
  doneRef.current = onDone;

  useEffect(() => {
    document.documentElement.classList.add("oobe-intro-active");
    return () => {
      document.documentElement.classList.remove("oobe-intro-active");
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  function hit() {
    if (phase !== "frozen") return;
    const next = hits + 1;
    setHits(next);
    if (next < hitsToBreak) return;

    setPhase("burst");
    timers.current.push(
      window.setTimeout(() => {
        const target =
          document.querySelector<HTMLElement>(".ny7-mark [data-oobe-intro-target]") ??
          document.querySelector<HTMLElement>(".ny7-topbar [data-oobe-intro-target]") ??
          document.querySelector<HTMLElement>("[data-oobe-intro-target]");
        const rect = target?.getBoundingClientRect();
        const startSize =
          document.querySelector<HTMLElement>(".oobe-ice-logo-flight")?.getBoundingClientRect().width ||
          LOGO_SIZE;
        setFlight({
          dx: rect ? rect.left + rect.width / 2 - window.innerWidth / 2 : 0,
          dy: rect ? rect.top + rect.height / 2 - window.innerHeight / 2 : 0,
          scale: rect && startSize > 0 ? rect.width / startSize : 1,
        });
        setPhase("fly");
      }, BURST_MS),
    );
    timers.current.push(
      window.setTimeout(() => doneRef.current(), BURST_MS + FLIGHT_MS),
    );
  }

  const left = hitsToBreak - hits;
  const hint = left <= 2 ? HINTS[2] : hits === 0 ? HINTS[0] : HINTS[1];

  return createPortal(
    <div className="oobe-ice-intro" data-phase={phase} role="dialog" aria-label="WinChat 7.0 — разбейте лёд">
      {/* SVG-фильтры: неровные трещины и ледяная зернистость. */}
      <svg className="oobe-ice-defs" aria-hidden="true">
        <filter id="oobe-ice-jag" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={2} seed={7} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={7} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <div className="oobe-ice-bg" aria-hidden="true" />
      <div className="oobe-ice-snow" aria-hidden="true">
        {SNOW.map((i) => (
          <span
            key={i}
            style={
              {
                left: `${(i * 41 + (i % 3) * 13) % 100}%`,
                width: `${1.5 + (i % 4) * 0.9}px`,
                "--fall": `${12 + (i % 7) * 2.4}s`,
                "--delay": `${(i % 9) * -1.8}s`,
                "--drift": `${((i % 5) - 2) * 22}px`,
                "--alpha": 0.25 + (i % 4) * 0.11,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <button
        type="button"
        className="oobe-ice-hit"
        disabled={phase !== "frozen"}
        onClick={hit}
        aria-label={`Разбейте лёд, нажмите ещё ${Math.max(left, 0)} раз`}
        style={{ "--hits": hits, "--p": Math.min(hits / hitsToBreak, 1) } as CSSProperties}
      >
        <span className="oobe-ice-shadow" aria-hidden="true" />

        <span className="oobe-ice-slab" aria-hidden="true">
          <span className="oobe-ice-depth" />
          <span className="oobe-ice-cloud" />
          <span className="oobe-ice-bubbles" />
          <span className="oobe-ice-grain" />
          <span className="oobe-ice-edges" />

          {/* Снежинка — процарапана внутри льда, а не наклейка сверху. */}
          <svg className="oobe-ice-etched" viewBox="0 0 200 200">
            <g>
              <path d="M100 18V182M29 59L171 141M29 141L171 59" />
              <path d="M100 40l-12-12M100 40l12-12M100 160l-12 12M100 160l12 12" />
              <path d="M29 59l3-17M29 59l16 5M171 141l-3 17M171 141l-16-5" />
              <path d="M29 141l3 17M29 141l16-5M171 59l-3-17M171 59l-16 5" />
            </g>
          </svg>

          {/* W находится внутри глыбы: чёрная основа + ледяная корка сверху. */}
          <span className="oobe-ice-w-under" key={`u${hits}`}>W</span>
          <span className="oobe-ice-w-frost">W</span>

          <svg className="oobe-ice-cracks" viewBox="0 0 200 200" preserveAspectRatio="none">
            {CRACK_PATHS.slice(0, hitsToBreak).map((d, i) => (
              <g key={i} className={i < hits ? "is-open" : ""}>
                <path d={d} pathLength={100} strokeDasharray={100} strokeDashoffset={i < hits ? 0 : 100} />
              </g>
            ))}
          </svg>
        </span>

        <span className="oobe-ice-shards" aria-hidden="true">
          {SHARDS.map((s, i) => (
            <span
              key={i}
              className="oobe-ice-shard"
              style={
                {
                  clipPath: s.clip,
                  "--sx": s.x,
                  "--sy": s.y,
                  "--rot": `${s.r}deg`,
                  "--delay": `${i * 24}ms`,
                } as CSSProperties
              }
            >
              W
            </span>
          ))}
        </span>

        <span className={`oobe-ice-hint ${hits >= hitsToBreak ? "is-gone" : ""}`} aria-hidden="true">
          <span className="oobe-ice-hint-text">{hint}</span>
          <span className="oobe-ice-progress"><span className="oobe-ice-progress-fill" /></span>
        </span>
      </button>

      {phase === "frozen" && (
        <button type="button" className="oobe-ice-skip" onClick={() => doneRef.current()}>
          Пропустить заставку
        </button>
      )}

      {phase !== "frozen" && (
        <div className="oobe-ice-reveal" aria-hidden="true">
          <div
            className="oobe-ice-logo-flight"
            style={
              {
                "--fly-x": `${flight?.dx ?? 0}px`,
                "--fly-y": `${flight?.dy ?? 0}px`,
                "--fly-scale": flight?.scale ?? 1,
              } as CSSProperties
            }
          >
            <span className="oobe-ice-logo-pop">
              <img src="/logo.jpg" alt="" draggable={false} />
            </span>
          </div>
          <span className="oobe-ice-version">WinChat 7.0</span>
        </div>
      )}
    </div>,
    document.body,
  );
}
