export type AppVariant = "default" | "store" | "you";

/* Отдельное приложение: здесь всегда только тема WinChat You. */
export const APP_VARIANT: AppVariant = "you";

export const isStoreApp = APP_VARIANT === "store";
export const isYouOnlyApp = APP_VARIANT === "you";

/** Бесплатный доступ в отдельном WinChat You: только лаванда и базовая форма. */
export const YOU_FREE_SEED_ID = "lavender";
export const YOU_FREE_SHAPE_ID = "rounded";

/**
 * Полная кастомизация WinChat You доступна:
 * - в обычном WinChat — всем;
 * - в отдельном WinChat You — только с активным WinPro.
 */
export function canCustomizeYou(winPro: boolean): boolean {
  return !isYouOnlyApp || winPro;
}

/** Отображаемое имя приложения для текущего билда. */
export const APP_BRAND = isStoreApp
  ? "Wintozo Store"
  : isYouOnlyApp
    ? "WinChat You"
    : "WinChat";

/** Android applicationId / package для текущего билда. */
export const APP_PACKAGE_ID = isStoreApp
  ? "com.winchat.store"
  : isYouOnlyApp
    ? "com.winchat.you"
    : "org.wintozo.messenger";
