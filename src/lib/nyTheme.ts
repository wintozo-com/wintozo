/**
 * Классическая тёмная тема WinChat 7.0.
 * Хранится отдельно от палитр чатов: светлая/тёмная новогодняя
 * атмосфера переключается в Настройки → Кастомизация.
 */
import { useEffect, useState } from "react";

export const NY_THEME_KEY = "winchat_ny_dark";
const NY_THEME_EVENT = "winchat-ny-theme";

export function getNyDark(): boolean {
  try {
    return localStorage.getItem(NY_THEME_KEY) === "on";
  } catch {
    return false;
  }
}

export function applyNyDark(dark: boolean): void {
  document.documentElement.classList.toggle("ny-dark", dark);
  document.documentElement.dataset.nyTheme = dark ? "dark" : "light";
}

export function setNyDark(dark: boolean): void {
  applyNyDark(dark);
  try {
    localStorage.setItem(NY_THEME_KEY, dark ? "on" : "off");
  } catch {
    /* no-op */
  }
  window.dispatchEvent(new Event(NY_THEME_EVENT));
}

export function toggleNyDark(): void {
  setNyDark(!getNyDark());
}

/** Синхронизирует состояние переключателей во всех открытых окнах. */
export function useNyDark(): [boolean, (value?: boolean) => void] {
  const [dark, setDark] = useState(getNyDark);

  useEffect(() => {
    applyNyDark(dark);
    const sync = () => setDark(getNyDark());
    window.addEventListener(NY_THEME_EVENT, sync);
    return () => window.removeEventListener(NY_THEME_EVENT, sync);
  }, [dark]);

  return [dark, (value?: boolean) => setNyDark(typeof value === "boolean" ? value : !getNyDark())];
}
