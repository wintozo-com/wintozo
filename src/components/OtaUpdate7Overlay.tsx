import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Snowflake,
  Sparkles,
  X,
} from "lucide-react";
import {
  installOta,
  markOtaSeen,
  onOtaStatus,
  type OtaInfo,
  type OtaState,
} from "../lib/ota";

interface Props {
  ota: OtaInfo | null;
  version: string | null;
  url: string;
  onClose: () => void;
}

type Phase = "intro" | "ready" | "installing";

const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
const BULB_COLORS = ["#ff4d4d", "#ffd45e", "#61f5a4", "#63c6ff", "#ff83d6"];

/** Разбить текст `--note` на красивые строки для списка. */
function descriptionLines(text: string): string[] {
  return text
    .split(/\n+|;+/)
    .map((line) => line.trim().replace(/^(?:[•\-–—]|\d+[.)])\s*/, ""))
    .filter(Boolean);
}

function statusLabel(state: OtaState | null, progress: number, error: string | null): string {
  if (error) return error;
  if (state === "permission") {
    return "Разрешите установку из этого источника и вернитесь в WinChat";
  }
  if (state === "installing") return "Устанавливаем… почти готово";
  if (state === "downloading") return `Загружаем новогоднее обновление… ${progress}%`;
  return "Готовим обновление…";
}

/** Полноэкранный новогодний экран OTA-обновления WinChat 7.x. */
export default function OtaUpdate7Overlay({ ota, version, url, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<OtaState | null>(null);
  const [progress, setProgress] = useState(0);
  const [realProgress, setRealProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const flakeLayout = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: (i * 37 + 7) % 100,
        size: 7 + (i % 4) * 4,
        delay: (i * 0.83) % 8,
        duration: 7 + (i % 5) * 2.2,
        sway: i % 2 === 0 ? 18 : -18,
        opacity: 0.35 + (i % 3) * 0.2,
      })),
    []
  );

  /* Короткий «вылет» логотипа, затем спокойный экран обновления. */
  useEffect(() => {
    const timer = window.setTimeout(() => setPhase("ready"), 3200);
    return () => window.clearTimeout(timer);
  }, []);

  /* Живой прогресс нативного установщика. */
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    void onOtaStatus((event) => {
      if (disposed) return;
      setStatus(event.state);
      if (event.state === "error") {
        setError(event.message ?? "Не удалось скачать обновление");
      } else {
        setError(null);
      }
      if (typeof event.progress === "number" && Number.isFinite(event.progress)) {
        setRealProgress(true);
        setProgress(Math.max(0, Math.min(100, Math.round(event.progress))));
      }
      if (event.state === "permission" || event.state === "installing") {
        setProgress(100);
      }
    }).then((fn) => {
      if (disposed) fn();
      else unsubscribe = fn;
    });

    return () => {
      disposed = true;
      unsubscribe?.();
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  /* Плавный «псевдопрогресс», пока нативный плагин не прислал проценты. */
  useEffect(() => {
    if (phase !== "installing" || status !== "downloading" || realProgress) return;
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(92, value + Math.max(1, (92 - value) * 0.22)));
    }, 420);
    return () => window.clearInterval(timer);
  }, [phase, status, realProgress]);

  function beginInstall() {
    setBusy(true);
    setError(null);
    setFallback(false);
    setStatus("downloading");
    setProgress(0);
    setPhase("installing");

    markOtaSeen({
      url,
      version,
      target: ota?.target ?? "*",
      updatedAt: ota?.updatedAt ?? null,
      description: ota?.description ?? null,
    });

    void installOta(url)
      .then((res) => {
        if (!res.fallback) return; // нативный плагин продолжит слать otaStatus
        setFallback(true);
        setStatus("installing");
        setProgress(100);
        closeTimer.current = window.setTimeout(() => onClose(), 2200);
      })
      .catch((e: unknown) => {
        setBusy(false);
        setStatus("error");
        setError(e instanceof Error ? e.message : "Не удалось установить обновление");
      });
  }

  const noteText =
    ota?.description?.trim() ||
    "Новогоднее обновление WinChat 7.0: свежий дизайн, новые возможности и исправления.";
  const lines = descriptionLines(noteText);
  const fullVersion = version ?? "7.0.0";
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress / 100);

  if (typeof document === "undefined") return null;

  const overlay = (
    <div
      className="ota7-root font-app"
      role="dialog"
      aria-modal="true"
      aria-label="Доступно обновление WinChat 7.0"
      style={{ position: "fixed", inset: 0, zIndex: 400 }}
    >
      <style>{`
        .ota7-root {
          position: fixed; inset: 0; z-index: 400;
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px; overflow-y: auto;
          background:
            radial-gradient(circle at 50% 8%, rgba(22, 92, 64, 0.95) 0%, transparent 46%),
            radial-gradient(circle at 8% 92%, rgba(122, 18, 28, 0.55) 0%, transparent 42%),
            linear-gradient(180deg, #061c13 0%, #03110b 58%, #010805 100%);
          color: #f4fff8;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .ota7-root::before {
          content: ""; position: fixed; inset: 0; pointer-events: none;
          background-image:
            radial-gradient(1.5px 1.5px at 12% 22%, rgba(255,255,255,.9) 50%, transparent 51%),
            radial-gradient(1.5px 1.5px at 78% 16%, rgba(255,255,255,.8) 50%, transparent 51%),
            radial-gradient(2px 2px at 38% 72%, rgba(255,255,255,.75) 50%, transparent 51%),
            radial-gradient(1.5px 1.5px at 88% 64%, rgba(255,255,255,.8) 50%, transparent 51%),
            radial-gradient(1.5px 1.5px at 58% 38%, rgba(255,255,255,.7) 50%, transparent 51%);
          background-size: 220px 220px, 310px 310px, 260px 260px, 190px 190px, 280px 280px;
          animation: ota7-twinkle 5s ease-in-out infinite alternate;
        }
        @keyframes ota7-twinkle { from { opacity: .45; } to { opacity: 1; } }

        .ota7-snow { position: fixed; inset: 0; overflow: hidden; pointer-events: none; }
        .ota7-flake {
          position: absolute; top: -24px; color: #fff;
          animation-name: ota7-fall; animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes ota7-fall {
          0% { transform: translate3d(0, -24px, 0) rotate(0deg); opacity: 0; }
          12% { opacity: var(--ota7-flake-opacity, .6); }
          88% { opacity: var(--ota7-flake-opacity, .6); }
          100% { transform: translate3d(var(--ota7-sway, 14px), 105vh, 0) rotate(220deg); opacity: 0; }
        }

        .ota7-garland { position: fixed; top: 0; left: 0; right: 0; height: 34px; pointer-events: none; }
        .ota7-wire { position: absolute; inset: 0; width: 100%; height: 100%; }
        .ota7-bulbs { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(16, 1fr); }
        .ota7-bulb-slot { position: relative; justify-self: center; align-self: end; display: inline-flex; }
        .ota7-bulb {
          width: 9px; height: 12px; border-radius: 50% 50% 58% 58%;
          animation: ota7-blink 1.7s ease-in-out infinite;
        }
        .ota7-bulb::before {
          content: ""; position: absolute; top: -3px; left: 50%; width: 4px; height: 3px;
          transform: translateX(-50%); border-radius: 2px; background: #7d6427;
        }
        @keyframes ota7-blink {
          0%, 100% { opacity: 1; filter: brightness(1.25); }
          50% { opacity: .35; filter: brightness(.8); }
        }

        .ota7-glow { position: fixed; border-radius: 999px; filter: blur(70px); pointer-events: none; }
        .ota7-glow-a { width: 340px; height: 340px; left: -120px; top: 18%; background: rgba(54, 220, 130, .22); animation: ota7-float 7s ease-in-out infinite; }
        .ota7-glow-b { width: 300px; height: 300px; right: -110px; bottom: 12%; background: rgba(255, 74, 74, .2); animation: ota7-float 9s ease-in-out infinite reverse; }
        @keyframes ota7-float { 0%, 100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(18px,-24px,0); } }

        .ota7-tree { position: fixed; bottom: -10px; width: 170px; height: 250px; pointer-events: none; opacity: .5; }
        .ota7-tree::before, .ota7-tree::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(180deg, #1c7a4d 0%, #0a3a25 70%, #062016 100%);
          clip-path: polygon(50% 0, 100% 100%, 0 100%);
        }
        .ota7-tree::after { transform: translateY(58px) scale(.82); opacity: .85; }
        .ota7-tree-left { left: -42px; }
        .ota7-tree-right { right: -42px; transform: scaleX(-1); }

        .ota7-close {
          position: fixed; top: 46px; right: 18px; z-index: 3;
          width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(255,255,255,.16); border-radius: 50%;
          background: rgba(255,255,255,.08); color: rgba(255,255,255,.8); cursor: pointer;
          transition: transform .18s ease, background .18s ease;
        }
        .ota7-close:hover { transform: rotate(90deg); background: rgba(255,255,255,.16); }
        .ota7-close svg { width: 16px; height: 16px; }

        .ota7-card {
          position: relative; z-index: 2; width: 100%; max-width: 420px;
          border-radius: 32px; padding: 30px 24px 26px; text-align: center;
          background: linear-gradient(180deg, rgba(10, 48, 34, .96) 0%, rgba(4, 21, 14, .98) 100%);
          border: 1px solid rgba(255, 215, 122, .38);
          box-shadow:
            0 30px 90px -30px rgba(0,0,0,.9),
            0 0 0 1px rgba(255,255,255,.04) inset,
            0 0 60px -22px rgba(63, 231, 138, .55);
          overflow: hidden;
        }
        .ota7-card::before {
          content: ""; position: absolute; top: -70%; left: -40%; width: 40%; height: 240%;
          transform: rotate(18deg); pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent);
          animation: ota7-card-shine 4.8s ease-in-out infinite;
        }
        @keyframes ota7-card-shine { 0%, 55% { left: -40%; } 100% { left: 120%; } }

        .ota7-intro-stage { padding: 34px 0 26px; animation: ota7-intro-in 3.2s cubic-bezier(.2,.9,.25,1.2) both; }
        @keyframes ota7-intro-in { 0% { opacity: 0; transform: scale(.9) translateY(16px); } 94% { opacity: 1; transform: scale(1) translateY(0); } 100% { opacity: 0; transform: none; } }
        .ota7-rays {
          position: absolute; left: 50%; top: 120px; width: 520px; height: 520px;
          transform: translate(-50%, -50%); pointer-events: none;
          background: repeating-conic-gradient(from 0deg, rgba(255,222,130,.18) 0deg 9deg, transparent 9deg 26deg);
          border-radius: 50%; animation: ota7-rays-spin 12s linear infinite;
        }
        @keyframes ota7-rays-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        .ota7-logo-wrap { position: relative; z-index: 1; display: flex; justify-content: center; }
        .ota7-logo-fly { animation: ota7-fly 3.2s cubic-bezier(.3, 1.5, .45, 1) both; }
        @keyframes ota7-fly {
          0% { transform: scale(.2) translateY(110px) rotate(-20deg); opacity: 0; }
          26% { transform: scale(1.9) translateY(-18px) rotate(8deg); opacity: 1; }
          50% { transform: scale(1.45) translateY(-10px) rotate(-2deg); }
          76% { transform: scale(1.12) translateY(0) rotate(0); }
          100% { transform: scale(1) translateY(0) rotate(0); opacity: 1; }
        }
        .ota7-logo-ring {
          position: relative; width: 122px; height: 122px; border-radius: 50%; overflow: hidden;
          padding: 7px; background: conic-gradient(from 20deg, #ffd45e, #4be08c, #ff5a5a, #ffd45e);
          box-shadow: 0 0 0 5px rgba(255,255,255,.07), 0 0 46px -6px rgba(255, 216, 110, .85);
        }
        .ota7-logo-ring img {
          width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
          background: #06231a; display: block;
        }
        .ota7-logo-ring::after {
          content: ""; position: absolute; inset: 7px; border-radius: 50%;
          background: linear-gradient(130deg, rgba(255,255,255,.5), transparent 45%);
          pointer-events: none;
        }
        .ota7-title-red {
          position: relative; z-index: 1; margin: 22px 0 8px;
          font-size: clamp(32px, 9vw, 44px); line-height: 1; font-weight: 1000;
          letter-spacing: -.02em; color: #ff4747;
          text-shadow: 0 0 12px rgba(255, 60, 60, .75), 0 0 40px rgba(255, 60, 60, .45), 0 3px 0 #6a0d0d;
          animation: ota7-title-in 3.2s cubic-bezier(.2, 1.25, .3, 1) both;
        }
        @keyframes ota7-title-in {
          0%, 18% { transform: scale(.35); letter-spacing: .34em; opacity: 0; filter: blur(8px); }
          42% { transform: scale(1.3); letter-spacing: .01em; opacity: 1; filter: blur(0); }
          62% { transform: scale(1.05); letter-spacing: -.02em; opacity: 1; }
          100% { transform: scale(1); letter-spacing: -.02em; opacity: 1; }
        }
        .ota7-intro-note {
          position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 7px;
          font-size: 12px; font-weight: 800; letter-spacing: .04em; color: #ffe6a1;
          animation: ota7-intro-note 3.2s ease both;
        }
        .ota7-intro-note svg { width: 14px; height: 14px; }
        @keyframes ota7-intro-note { 0%, 52% { opacity: 0; transform: translateY(10px); } 72%, 100% { opacity: 1; transform: none; } }

        .ota7-ready { animation: ota7-settle .65s cubic-bezier(.2, 1.5, .3, 1) both; }
        @keyframes ota7-settle { from { opacity: 0; transform: translateY(18px) scale(.96); } to { opacity: 1; transform: none; } }
        .ota7-logo-orbit { position: relative; width: 132px; height: 132px; margin: 2px auto 12px; animation: ota7-orbit-in 1s cubic-bezier(.2, 1.4, .3, 1) both; }
        @keyframes ota7-orbit-in { from { opacity: 0; transform: scale(.72); } to { opacity: 1; transform: scale(1); } }
        .ota7-logo-orbit-ring {
          position: absolute; inset: -8px; border-radius: 50%;
          border: 2px dashed rgba(255, 216, 122, .55);
          animation: ota7-orbit-spin 14s linear infinite;
        }
        @keyframes ota7-orbit-spin { to { transform: rotate(360deg); } }
        .ota7-logo-circle {
          position: absolute; inset: 0; border-radius: 50%; overflow: hidden; padding: 6px;
          background: conic-gradient(from 30deg, #ffd45e, #4be08c, #ff5a5a, #ffd45e);
          box-shadow: 0 0 0 4px rgba(255,255,255,.06), 0 0 44px -8px rgba(86, 239, 150, .8);
          animation: ota7-logo-breathe 3.4s ease-in-out infinite;
        }
        @keyframes ota7-logo-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } }
        .ota7-logo-circle img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: #06231a; display: block; }
        .ota7-orbit-dot {
          position: absolute; width: 10px; height: 10px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #fff, #ffd45e 55%, #e8a400);
          box-shadow: 0 0 12px 3px rgba(255, 212, 94, .7);
        }
        .ota7-orbit-dot-a { top: 2px; right: 10px; animation: ota7-blink 1.5s ease-in-out infinite; }
        .ota7-orbit-dot-b { bottom: 8px; left: 2px; background: radial-gradient(circle at 35% 30%, #fff, #ff5a5a 55%, #b01010); box-shadow: 0 0 12px 3px rgba(255, 80, 80, .65); animation: ota7-blink 1.9s ease-in-out infinite .4s; }

        .ota7-red-mini {
          margin: 0 0 6px; font-size: 15px; font-weight: 1000; letter-spacing: .06em;
          color: #ff5757; text-shadow: 0 0 14px rgba(255, 70, 70, .6);
        }
        .ota7-heading {
          margin: 0; font-size: 23px; line-height: 1.15; font-weight: 1000; letter-spacing: -.02em;
          color: #fffdf5; text-shadow: 0 2px 14px rgba(0,0,0,.5);
        }
        .ota7-version-pill {
          margin: 12px auto 0; display: inline-flex; align-items: center; gap: 7px;
          padding: 6px 13px; border-radius: 999px; font-size: 12px; font-weight: 900;
          color: #ffe8ac; background: rgba(255, 216, 122, .12);
          border: 1px solid rgba(255, 216, 122, .35);
        }
        .ota7-version-pill svg { width: 14px; height: 14px; animation: ota7-orbit-spin 9s linear infinite; }

        .ota7-desc-card {
          position: relative; margin: 18px 0 20px; padding: 16px 16px 15px;
          border-radius: 20px; text-align: left;
          background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.035));
          border: 1px solid rgba(255, 216, 122, .26);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 10px 30px -20px rgba(0,0,0,.9);
        }
        .ota7-desc-title {
          display: flex; align-items: center; gap: 7px; margin-bottom: 9px;
          font-size: 12px; font-weight: 1000; letter-spacing: .03em; color: #ffdf94;
        }
        .ota7-desc-title svg { width: 14px; height: 14px; }
        .ota7-desc-text { margin: 0; font-size: 13.5px; line-height: 1.55; font-weight: 600; color: rgba(255,255,255,.86); }
        .ota7-desc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .ota7-desc-list li {
          display: flex; align-items: flex-start; gap: 9px;
          font-size: 13px; line-height: 1.45; font-weight: 600; color: rgba(255,255,255,.86);
        }
        .ota7-desc-list svg { flex: none; width: 14px; height: 14px; margin-top: 2px; color: #7bf3ad; }

        .ota7-install {
          position: relative; width: 100%; min-height: 52px; overflow: hidden; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 9px;
          border: none; border-radius: 17px; font-size: 16px; font-weight: 1000;
          color: #06301c; background: linear-gradient(180deg, #6df2a1 0%, #2bc46f 55%, #16a65b 100%);
          box-shadow: 0 12px 28px -10px rgba(43, 196, 111, .85), inset 0 1px 0 rgba(255,255,255,.6);
          transition: transform .16s ease, box-shadow .16s ease, filter .16s ease;
          animation: ota7-install-pulse 2.6s ease-in-out infinite;
        }
        @keyframes ota7-install-pulse {
          0%, 100% { box-shadow: 0 12px 28px -10px rgba(43,196,111,.8), 0 0 0 0 rgba(78,230,140,.35); }
          50% { box-shadow: 0 14px 32px -10px rgba(43,196,111,.9), 0 0 0 8px rgba(78,230,140,0); }
        }
        .ota7-install:hover { transform: translateY(-2px); filter: brightness(1.05); }
        .ota7-install:active { transform: translateY(1px) scale(.985); }
        .ota7-install:disabled { cursor: default; transform: none; filter: saturate(.8); }
        .ota7-install svg { width: 19px; height: 19px; }
        .ota7-install-shine {
          position: absolute; top: -60%; left: -30%; width: 34%; height: 220%;
          transform: rotate(20deg); pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
          animation: ota7-card-shine 3.2s ease-in-out infinite;
        }
        .ota7-later {
          margin-top: 13px; padding: 7px 12px; cursor: pointer;
          border: none; background: transparent; color: rgba(255,255,255,.55);
          font-size: 12.5px; font-weight: 800; transition: color .15s ease;
        }
        .ota7-later:hover { color: rgba(255,255,255,.9); }

        .ota7-progress-stage { animation: ota7-settle .45s ease both; }
        .ota7-progress-stage .ota7-logo-circle {
          position: relative; inset: auto; width: 74px; height: 74px; margin: 0 auto 16px;
        }
        .ota7-ring { position: relative; width: 172px; height: 172px; margin: 18px auto 14px; }
        .ota7-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ota7-ring-track { fill: none; stroke: rgba(255,255,255,.09); stroke-width: 9; }
        .ota7-ring-value {
          fill: none; stroke: url(#ota7Gradient); stroke-width: 9; stroke-linecap: round;
          transition: stroke-dashoffset .45s cubic-bezier(.2,.8,.3,1);
          filter: drop-shadow(0 0 7px rgba(88, 240, 155, .75));
        }
        .ota7-ring-center {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 2px;
        }
        .ota7-percent { font-size: 44px; font-weight: 1000; line-height: 1; color: #fff; font-variant-numeric: tabular-nums; }
        .ota7-percent small { font-size: 18px; margin-left: 2px; color: #8bf7b7; }
        .ota7-ring-label { font-size: 10px; font-weight: 900; letter-spacing: .11em; text-transform: uppercase; color: rgba(255,255,255,.5); }
        .ota7-progress-bar {
          position: relative; height: 8px; border-radius: 999px; overflow: hidden;
          background: rgba(255,255,255,.09); box-shadow: inset 0 1px 2px rgba(0,0,0,.4);
        }
        .ota7-progress-fill {
          height: 100%; border-radius: inherit; position: relative;
          background: linear-gradient(90deg, #1aa85d, #6df2a1, #ffe18a);
          transition: width .45s cubic-bezier(.2,.8,.3,1);
        }
        .ota7-progress-fill::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.7), transparent);
          transform: translateX(-100%); animation: ota7-bar 1.5s ease-in-out infinite;
        }
        @keyframes ota7-bar { to { transform: translateX(100%); } }
        .ota7-status {
          min-height: 38px; margin: 14px 0 0; font-size: 13px; font-weight: 700;
          line-height: 1.45; color: rgba(255,255,255,.75);
        }
        .ota7-status-error { color: #ff8989; display: flex; align-items: center; justify-content: center; gap: 7px; }
        .ota7-status-error svg { width: 16px; height: 16px; flex: none; }
        .ota7-status-ok { color: #8bf7b7; display: flex; align-items: center; justify-content: center; gap: 7px; }
        .ota7-retry {
          margin-top: 4px; padding: 11px 20px; cursor: pointer;
          border-radius: 14px; border: 1px solid rgba(255,255,255,.2);
          background: rgba(255,255,255,.08); color: #fff; font-size: 13px; font-weight: 900;
          transition: background .15s ease;
        }
        .ota7-retry:hover { background: rgba(255,255,255,.16); }

        @media (max-height: 700px) {
          .ota7-card { padding-top: 22px; padding-bottom: 20px; }
          .ota7-logo-orbit { width: 108px; height: 108px; margin-bottom: 8px; }
          .ota7-progress-stage .ota7-logo-circle { width: 60px; height: 60px; }
          .ota7-ring { width: 140px; height: 140px; margin: 10px auto; }
          .ota7-desc-card { margin: 12px 0 14px; padding: 12px 14px; }
        }
      `}</style>

      <div className="ota7-snow" aria-hidden>
        {flakeLayout.map((flake, i) => (
          <SnowflakeIcon
            key={i}
            className="ota7-flake"
            style={{
              left: `${flake.left}%`,
              width: flake.size,
              height: flake.size,
              animationDelay: `${flake.delay}s`,
              animationDuration: `${flake.duration}s`,
              // @ts-expect-error — CSS-переменные для снежинки
              "--ota7-sway": `${flake.sway}px`,
              "--ota7-flake-opacity": flake.opacity,
            }}
          />
        ))}
      </div>

      <div className="ota7-garland" aria-hidden>
        <svg viewBox="0 0 1600 34" preserveAspectRatio="none" className="ota7-wire">
          {Array.from({ length: 16 }, (_, i) => (
            <path
              key={i}
              d={`M${i * 100} 4 Q ${i * 100 + 50} 24 ${(i + 1) * 100} 4`}
              fill="none"
              stroke="#a8790a"
              strokeWidth="2"
            />
          ))}
        </svg>
        <div className="ota7-bulbs">
          {Array.from({ length: 16 }, (_, i) => {
            const color = BULB_COLORS[i % BULB_COLORS.length];
            const t = ((i % 2) + 0.5) / 2;
            return (
              <span
                key={i}
                className="ota7-bulb-slot"
                style={{ bottom: `${12 * 4 * t * (1 - t) - 4}px` }}
              >
                <span
                  className="ota7-bulb"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, #fff 0%, ${color} 58%, ${color} 100%)`,
                    boxShadow: `0 0 8px 2px ${color}b3`,
                    animationDelay: `${(i % 7) * 0.27}s`,
                  }}
                />
              </span>
            );
          })}
        </div>
      </div>

      <div className="ota7-glow ota7-glow-a" aria-hidden />
      <div className="ota7-glow ota7-glow-b" aria-hidden />
      <div className="ota7-tree ota7-tree-left" aria-hidden />
      <div className="ota7-tree ota7-tree-right" aria-hidden />

      <button className="ota7-close" onClick={onClose} aria-label="Закрыть">
        <X />
      </button>

      <div className="ota7-card">
        {phase === "intro" ? (
          <div className="ota7-intro-stage">
            <div className="ota7-rays" aria-hidden />
            <div className="ota7-logo-wrap">
              <div className="ota7-logo-ring">
                <img src="/logo.jpg" alt="WinChat" draggable={false} />
              </div>
            </div>
            <h1 className="ota7-title-red">WinChat 7.0</h1>
            <div className="ota7-intro-note">
              <Sparkles /> Новогоднее обновление <Sparkles />
            </div>
          </div>
        ) : phase === "installing" ? (
          <div className="ota7-progress-stage">
            <div className="ota7-logo-circle">
              <img src="/logo.jpg" alt="WinChat" draggable={false} />
            </div>
            <h2 className="ota7-heading">WinChat 7.0</h2>
            <div className="ota7-version-pill" style={{ marginTop: 9 }}>
              <Snowflake /> {fullVersion}
            </div>

            <div className="ota7-ring">
              <svg viewBox="0 0 120 120" aria-hidden>
                <defs>
                  <linearGradient id="ota7Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1aa85d" />
                    <stop offset="55%" stopColor="#6df2a1" />
                    <stop offset="100%" stopColor="#ffe18a" />
                  </linearGradient>
                </defs>
                <circle className="ota7-ring-track" cx="60" cy="60" r="52" />
                <circle
                  className="ota7-ring-value"
                  cx="60"
                  cy="60"
                  r="52"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="ota7-ring-center">
                <span className="ota7-percent">
                  {progress}
                  <small>%</small>
                </span>
                <span className="ota7-ring-label">
                  {error
                    ? "ошибка"
                    : status === "permission"
                      ? "разрешение"
                      : status === "installing"
                        ? "готово"
                        : "загрузка"}
                </span>
              </div>
            </div>

            <div className="ota7-progress-bar">
              <div className="ota7-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p
              className={`ota7-status${
                error
                  ? " ota7-status-error"
                  : status === "installing" && fallback
                    ? " ota7-status-ok"
                    : ""
              }`}
              aria-live="polite"
            >
              {error ? (
                <>
                  <AlertTriangle /> {statusLabel(status, progress, error)}
                </>
              ) : status === "installing" && fallback ? (
                <>
                  <Check /> Открываем загрузку APK…
                </>
              ) : (
                statusLabel(status, progress, null)
              )}
            </p>
            {error && (
              <button className="ota7-retry" onClick={beginInstall}>
                Повторить установку
              </button>
            )}
          </div>
        ) : (
          <div className="ota7-ready">
            <div className="ota7-logo-orbit">
              <div className="ota7-logo-orbit-ring" aria-hidden />
              <div className="ota7-logo-circle">
                <img src="/logo.jpg" alt="WinChat" draggable={false} />
              </div>
              <span className="ota7-orbit-dot ota7-orbit-dot-a" aria-hidden />
              <span className="ota7-orbit-dot ota7-orbit-dot-b" aria-hidden />
            </div>

            <p className="ota7-red-mini">WinChat 7.0</p>
            <h2 className="ota7-heading">Доступно обновление</h2>
            <div className="ota7-version-pill">
              <Snowflake /> {fullVersion}
            </div>

            <div className="ota7-desc-card">
              <div className="ota7-desc-title">
                <Sparkles /> Что нового
              </div>
              {lines.length > 1 ? (
                <ul className="ota7-desc-list">
                  {lines.map((line, i) => (
                    <li key={`${line}-${i}`}>
                      <Snowflake /> <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ota7-desc-text">{noteText}</p>
              )}
            </div>

            <button className="ota7-install" onClick={beginInstall} disabled={busy}>
              <span className="ota7-install-shine" aria-hidden />
              <Download /> Установить
            </button>
            <button className="ota7-later" onClick={onClose}>
              Напомнить позже
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/** Иконка снежинки в стиле новогоднего баннера. */
function SnowflakeIcon({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
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
