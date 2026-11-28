/**
 * Классическая тёмная тема Cordy 7.0.
 * Хранится отдельно от палитр чатов: светлая/тёмная новогодняя
 * атмосфера переключается в Настройки → Кастомизация.
 *
 * Важно: тёмная новогодняя палитра применяется только вместе с
 * классической темой. В You, Glass и других палитрах класс ny-dark
 * не должен оставаться на <html> — иначе он перекрывает цвета
 * активной темы и интерфейс становится чёрным.
 */
import { useEffect, useState } from "react";

export const NY_THEME_KEY = "winchat_ny_dark";
const NY_THEME_EVENT = "winchat-ny-theme";
const THEME_EVENT = "winchat-theme-change";

/** Новогодняя палитра активна только в классической теме. */
function isNewYearPaletteActive(): boolean {
  return document.documentElement.classList.contains("theme-newyear");
}

export function getNyDark(): boolean {
  try {
    return localStorage.getItem(NY_THEME_KEY) === "on";
  } catch {
    return false;
  }
}

export function applyNyDark(dark: boolean): void {
  const root = document.documentElement;
  const active = dark && isNewYearPaletteActive();
  root.classList.toggle("ny-dark", active);
  root.dataset.nyTheme = active ? "dark" : "light";
}

export function setNyDark(dark: boolean): void {
  try {
    localStorage.setItem(NY_THEME_KEY, dark ? "on" : "off");
  } catch {
    /* no-op */
  }
  applyNyDark(dark);
  window.dispatchEvent(new Event(NY_THEME_EVENT));
}

export function toggleNyDark(): void {
  setNyDark(!getNyDark());
}

/** Синхронизирует состояние переключателей во всех открытых окнах. */
export function useNyDark(): [boolean, (value?: boolean) => void] {
  const [dark, setDark] = useState(getNyDark);

  useEffect(() => {
    const apply = () => applyNyDark(dark);
    apply();

    const sync = () => setDark(getNyDark());
    window.addEventListener(NY_THEME_EVENT, sync);
    /* При смене палитры класс ny-dark должен сразу уйти или вернуться. */
    window.addEventListener(THEME_EVENT, apply);
    return () => {
      window.removeEventListener(NY_THEME_EVENT, sync);
      window.removeEventListener(THEME_EVENT, apply);
    };
  }, [dark]);

  return [dark, (value?: boolean) => setNyDark(typeof value === "boolean" ? value : !getNyDark())];
}
