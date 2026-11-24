/**
 * Фоновая новогодняя музыка WinChat 7.0 (new-year.ogg).
 * Управляется переключателем в Настройки → Кастомизация:
 * плеер держится здесь, поэтому музыка играет даже когда
 * настройки закрыты, а выключенная музыка не стартует заново.
 */
import { useEffect, useState } from "react";
import bgUrl from "../media_system_files/melodies/new-year.ogg";

export const BG_MUSIC_KEY = "winchat_bg_new_year_music";
const BG_MUSIC_EVENT = "winchat-bg-music";
const BG_VOLUME = 0.16;

let player: HTMLAudioElement | null = null;

function ensurePlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio(bgUrl);
    player.loop = true;
    player.volume = BG_VOLUME;
    player.preload = "auto";
  }
  return player;
}

export function getBgMusicOn(): boolean {
  try {
    return localStorage.getItem(BG_MUSIC_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setBgMusicOn(on: boolean): void {
  try {
    localStorage.setItem(BG_MUSIC_KEY, on ? "on" : "off");
  } catch {
    /* no-op */
  }
  const audio = ensurePlayer();
  if (on) {
    // Браузер может блокировать play() вне действия пользователя —
    // тогда старт подхватят слушатели pointerdown/keydown.
    void audio.play().catch(() => undefined);
  } else {
    audio.pause();
  }
  window.dispatchEvent(new Event(BG_MUSIC_EVENT));
}

/** Синхронизирует переключатели во всех открытых окнах. */
export function useBgMusic(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(getBgMusicOn);

  useEffect(() => {
    const sync = () => setOn(getBgMusicOn());
    window.addEventListener(BG_MUSIC_EVENT, sync);
    return () => window.removeEventListener(BG_MUSIC_EVENT, sync);
  }, []);

  return [on, setBgMusicOn];
}

/** Монтируется один раз в мессенджере: управляет фоновым треком. */
export function useBgMusicPlayer(): void {
  useEffect(() => {
    const audio = ensurePlayer();

    const apply = () => {
      if (getBgMusicOn()) {
        if (audio.paused) void audio.play().catch(() => undefined);
      } else {
        audio.pause();
      }
    };

    apply();
    // Автовоспроизведение браузеры блокируют: пробуем снова
    // с первого касания/клика и на каждое переключение.
    window.addEventListener("pointerdown", apply);
    window.addEventListener("keydown", apply);
    window.addEventListener(BG_MUSIC_EVENT, apply);

    return () => {
      window.removeEventListener("pointerdown", apply);
      window.removeEventListener("keydown", apply);
      window.removeEventListener(BG_MUSIC_EVENT, apply);
    };
  }, []);
}
