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
    // Раньше было `!== "off"`: при отсутствии ключа тумблер показывал
    // «звучит», хотя браузер блокировал автоплей и звука не было.
    return localStorage.getItem(BG_MUSIC_KEY) === "on";
  } catch {
    return false;
  }
}

/** Нужен, чтобы синхронизировать индикатор с реальным состоянием плеера. */
export function getBgMusicAudio(): HTMLAudioElement {
  return ensurePlayer();
}

export function setBgMusicOn(on: boolean): void {
  try {
    localStorage.setItem(BG_MUSIC_KEY, on ? "on" : "off");
  } catch {
    /* no-op */
  }
  const audio = ensurePlayer();
  const notify = () => window.dispatchEvent(new Event(BG_MUSIC_EVENT));
  if (on) {
    // Браузер может блокировать play() вне действия пользователя —
    // тогда старт подхватят слушатели pointerdown/keydown.
    void audio.play().then(notify).catch(() => {
      audio.pause();
      notify();
    });
  } else {
    audio.pause();
    notify();
  }
}

/**
 * Переключатель показывает реальное состояние звука, а не только запись
 * в localStorage: если автоплей заблокирован, тумблер не врёт «звучит».
 */
export function useBgMusic(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => getBgMusicOn() && !getBgMusicAudio().paused);

  useEffect(() => {
    const audio = getBgMusicAudio();
    const sync = () => setOn(getBgMusicOn() && !audio.paused);
    audio.addEventListener("play", sync);
    audio.addEventListener("pause", sync);
    window.addEventListener(BG_MUSIC_EVENT, sync);
    sync();
    return () => {
      audio.removeEventListener("play", sync);
      audio.removeEventListener("pause", sync);
      window.removeEventListener(BG_MUSIC_EVENT, sync);
    };
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
