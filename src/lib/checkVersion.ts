/**
 * Проверка версии приложения: клиент шлёт запрос на Supabase (RPC
 * get_wintozo_version), сравнивает с локальной APP_VERSION и показывает
 * баннер обновления, если версия на сервере новее.
 */
import { supabase } from "./supabase";

/** Текущая версия клиента: Cordy 8.0 closed beta. */
export const APP_VERSION = "8.0.0-closed-beta";

/** Ссылка на APK в релизах GitHub. */
export const DOWNLOAD_URL = "https://github.com/NikitaDev2015/wintozo/releases/latest";

/* ============================================================
   Демо-роут /update_7_active
   Показывает экран «доступна 7.x» поверх настроек (ПК и телефон).
   Не меняет APP_VERSION, серверную версию и реальные OTA-проверки.
   ============================================================ */
export const UPDATE7_ROUTE = "/update_7_active";

const UPDATE7_DEMO_AVAILABLE = "7.1.0";
const OTA7_DISMISSED_KEY = "winchat_ota7_dismissed";

/**
 * Демо-флаг живёт ТОЛЬКО в памяти и включается самим роутом.
 * Он НЕ пишется в localStorage и НЕ подменяет check_version / search_ota —
 * реальные проверки обновлений работают как раньше.
 */
let update7DemoActive =
  typeof window !== "undefined" && window.location.pathname === UPDATE7_ROUTE;

export function isUpdate7DemoActive(): boolean {
  return update7DemoActive;
}

export function setUpdate7DemoActive(active: boolean): void {
  update7DemoActive = active;
}

/** Версия, которую показывает демо-экран. */
export function getDemoAvailableVersion(): string {
  return UPDATE7_DEMO_AVAILABLE;
}

/* ============================================================
   Демо-роут /update_8_active/
   Показывает переход Cordy 7 → Cordy 8 в центре обновлений.
   Как и демо 7, не меняет серверную версию и реальные OTA-проверки.
   OOBE намеренно остаётся на ступени 7.0.0.
   ============================================================ */
export const UPDATE8_ROUTE = "/update_8_active/";
export const UPDATE8_DEMO_AVAILABLE = "8.0.0-closed-beta";

let update8DemoActive =
  typeof window !== "undefined" &&
  (window.location.pathname === UPDATE8_ROUTE ||
    window.location.pathname === "/update_8_active");

export function isUpdate8DemoActive(): boolean {
  return update8DemoActive;
}

export function setUpdate8DemoActive(active: boolean): void {
  update8DemoActive = active;
}

/** Версия, которую показывает демо-экран Cordy 8. */
export function getDemoAvailableVersion8(): string {
  return UPDATE8_DEMO_AVAILABLE;
}

export function isOta7Dismissed(key: string): boolean {
  try {
    return localStorage.getItem(OTA7_DISMISSED_KEY) === key;
  } catch {
    return false;
  }
}

export function dismissOta7(key: string): void {
  try {
    localStorage.setItem(OTA7_DISMISSED_KEY, key);
  } catch {
    /* no-op */
  }
}

/** Демо-роут всегда начинается с чистого экрана. */
export function clearOta7Dismissed(): void {
  try {
    localStorage.removeItem(OTA7_DISMISSED_KEY);
  } catch {
    /* no-op */
  }
}

/* ============================================================
   Ивент «Память о Wintozo»
   Если серверная версия попадает в диапазон 1.0.0–2.0.1, у
   клиента включается legacy-режим: полноэкранная плашка с
   выбором — остаться в Cordy или вернуться в старый Wintozo.
   ============================================================ */

const LEGACY_KEY = "winchat_legacy_ui";
/** Нижняя граница диапазона «старой» версии (включительно). */
const LEGACY_MIN = "1.0.0";
/** Верхняя граница диапазона «старой» версии (включительно). */
const LEGACY_MAX = "2.0.1";

/** Разобрать "4.0.0" → [4,0,0]. Неполные части → 0. */
function parseVersion(v: string): number[] {
  return v.trim().split(".").map((x) => parseInt(x, 10) || 0);
}

/** Выделить числовую часть и пререлизный суффикс.
 *  "4.0.0-beta+build12" → core [4,0,0], pre "beta". */
function splitVersion(v: string): { core: number[]; pre: string | null } {
  const clean = (v || "").trim().split("+")[0];
  const dash = clean.indexOf("-");
  const coreStr = dash >= 0 ? clean.slice(0, dash) : clean;
  const pre = dash >= 0 ? clean.slice(dash + 1) : null;
  return { core: parseVersion(coreStr), pre: pre && pre.length ? pre : null };
}

/** Полное сравнение версий (с пререлизами по semver):
 *  4.0.0-beta < 4.0.0; "4.0.0-aa" < "4.0.0-ab" (лексикографически). */
function compareFullVersions(a: number[], b: number[], preA: string | null, preB: string | null): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  if (preA && preB) return preA < preB ? -1 : preA > preB ? 1 : 0;
  return 0;
}

/** true, если remote строго новее local (сравнение по частям, с пререлизами). */
export function isVersionNewer(remote: string, local: string): boolean {
  const r = splitVersion(remote);
  const l = splitVersion(local);
  return compareFullVersions(r.core, l.core, r.pre, l.pre) > 0;
}

/** Старший номер версии (7, 8, …) или 0, если версии нет. */
export function getMajorVersion(version: string | null | undefined): number {
  if (!version) return 0;
  return splitVersion(version).core[0] ?? 0;
}

/** Версия начинается с 7 (7.0.1, 7.0.1-beta, 7.0.1-release, …). */
export function isVersion7(version: string | null | undefined): boolean {
  return getMajorVersion(version) === 7;
}

/** Версия начинается с 8 (8.0.0-closed-beta, 8.1, …). */
export function isVersion8(version: string | null | undefined): boolean {
  return getMajorVersion(version) === 8;
}

/** Сравнение версий: -1 | 0 | 1. */
function compareVersions(a: string, b: string): number {
  const ra = splitVersion(a);
  const rb = splitVersion(b);
  return compareFullVersions(ra.core, rb.core, ra.pre, rb.pre);
}

/** Попадает ли серверная версия в диапазон «Памяти о Wintozo». */
export function isLegacyRange(version: string | null): boolean {
  if (!version) return false;
  return (
    compareVersions(version, LEGACY_MIN) >= 0 &&
    compareVersions(version, LEGACY_MAX) <= 0
  );
}

/** Включён ли legacy-режим пользователем (или автоматически по версии). */
export function isLegacyUi(): boolean {
  try {
    return localStorage.getItem(LEGACY_KEY) === "on";
  } catch {
    return false;
  }
}

export function setLegacyUi(on: boolean): void {
  try {
    if (on) localStorage.setItem(LEGACY_KEY, "on");
    else localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* no-op */
  }
}

/** Явный выбор пользователя: включён/отключён legacy UI. */
export function chooseLegacyUi(on: boolean): void {
  try {
    localStorage.setItem(LEGACY_KEY, on ? "on" : "user_declined");
  } catch {
    /* no-op */
  }
}

/** Разрешить снова показать плашку «Память о Wintozo» (из Настроек). */
export function resetLegacyChoice(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* no-op */
  }
}

/** Кэш последней известной серверной версии (для мгновенных проверок). */
const VER_CACHE = "winchat_server_version";

export function getCachedServerVersion(): string | null {
  try {
    return localStorage.getItem(VER_CACHE);
  } catch {
    return null;
  }
}

export function setCachedServerVersion(v: string): void {
  try {
    localStorage.setItem(VER_CACHE, v);
  } catch {
    /* no-op */
  }
}

/** Запросить актуальную версию с сервера. null при ошибке сети. */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    // Новый RPC check_version (см. winchat_update_10_ota.sql).
    // Если миграция ещё не применена — откатываемся на прежнюю функцию.
    let { data, error } = await supabase.rpc("check_version");
    if (error) {
      const fallback = await supabase.rpc("get_wintozo_version");
      data = fallback.data;
      error = fallback.error;
    }
    if (error || !data) return null;
    const v = String(data);
    setCachedServerVersion(v);
    return v;
  } catch {
    return null;
  }
}

/**
 * Активировать/деактивировать legacy-режим по серверной версии.
 * Вызывается при загрузке приложения и после входа/регистрации.
 * Возвращает true, если режим был изменён на «legacy».
 */
export async function applyLegacyGate(serverVersion?: string | null): Promise<boolean> {
  const v = serverVersion ?? (await fetchLatestVersion()) ?? getCachedServerVersion();
  const legacy = isLegacyRange(v);
  // Автоматически включаем, только если пользователь ещё не выбирал сам
  // («off» means пользователь явно вернулся в новый интерфейс).
  if (legacy && !isLegacyUi()) {
    try {
      if (localStorage.getItem(LEGACY_KEY) !== "user_declined") {
        setLegacyUi(true);
        return true;
      }
    } catch {
      /* no-op */
    }
  }
  return false;
}

/** Пользователь отказался от legacy UI — запоминаем выбор. */
export function declineLegacyUi(): void {
  chooseLegacyUi(false);
}

/* ---------- Баннер «Обновление завершено» после входа ---------- */

const CHangelog_KEY = "winchat_changelog_seen";

/* ============================================================
   Короткие id версий (OTA)
   Каждая крупная веха получает свой номер вместо длинной
   строки версии. Номер считается из самой версии, поэтому
   новые релизы получают следующий id автоматически:
     3.1.2 → 0, 4.0.0 → 1, 4.0.1 → 2, 5.0.0 → 3,
     6.0.0-closed-beta → 4, 6.0.0-stable → 5,
     7.0.0 → 6, 7.0.1 → 7 (и т.д.).
   Обновился до версии с id N — телефон запоминает это и
   больше не предлагает обновиться на неё же.
   ============================================================ */

/** Известные вехи — по ним нумеруются id. Новые версии продолжают ряд. */
const VERSION_MILESTONES = [
  "3.1.2",
  "4.0.0",
  "4.0.1",
  "5.0.0",
  "6.0.0-closed-beta",
  "6.0.0-stable",
  "7.0.0",
  "7.0.1",
];

/**
 * Числовой id версии. Версии из списка вех получают номера 0..6;
 * неизвестная версия вписывается между вехами по семантическому
 * порядку (например, 6.0.1 получит id между 5 и 6).
 */
export function getVersionId(version: string): number {
  const v = version.trim();
  const exact = VERSION_MILESTONES.indexOf(v);
  if (exact >= 0) return exact;
  // Вписываем незнакомую версию в ряд по порядку сравнения.
  let id = 0;
  for (const m of VERSION_MILESTONES) {
    if (isVersionNewer(m, v)) id += 1;
  }
  return id;
}

/** id текущей клиентской версии. */
export function getAppVersionId(): number {
  return getVersionId(APP_VERSION);
}

const UPDATED_TO_KEY = "winchat_updated_to_id";

/** До какого id версии устройство уже обновлялось (max по установкам). */
export function getUpdatedToId(): number {
  try {
    const raw = localStorage.getItem(UPDATED_TO_KEY);
    const n = raw === null ? NaN : parseInt(raw, 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

/** Запомнить, что устройство обновилось до версии с этим id. */
export function markUpdatedTo(version: string): void {
  try {
    const id = getVersionId(version);
    if (id > getUpdatedToId()) localStorage.setItem(UPDATED_TO_KEY, String(id));
  } catch {
    /* no-op */
  }
}

/** Предлагать ли OTA на эту версию? Нет, если телефон уже
 *  обновлялся до неё или до более новой версии. */
export function shouldOfferOta(version: string): boolean {
  try {
    const id = getVersionId(version);
    const app = getAppVersionId();
    if (id <= app || id <= getUpdatedToId()) return false;
    return true;
  } catch {
    return true;
  }
}

export interface ChangelogEntry {
  version: string;
  title: string;
  items: string[];
}

/** Что нового в текущих версиях (пополняется с каждым релизом). */
export const CHANGELOGS: Record<string, ChangelogEntry> = {
  "8.0.0-closed-beta": {
    version: "8.0.0-closed-beta",
    title: "Cordy 8.0 — новое имя WinChat",
    items: [
      "Эпоха WinChat прошла. Встречайте обновленный WinChat только под названием Cordy Messenger!",
      "Полный ребрендинг: новый логотип Cordy, свежая типографика и зимняя палитра.",
      "Новый OOBE 8: логотип и надпись WinChat 8.0 превращаются в Cordy 8.0.",
      "Центр обновлений в стиле 8: золотая переливающаяся 8, ёлки, снег и отсчёт до Нового года.",
      "Тот же аккаунт, все чаты и каналы на месте — просто теперь это Cordy.",
      "Стабильность, исправления и подготовка к большому релизу.",
    ],
  },
  "7.0.0": {
    version: "7.0.0",
    title: "История Cordy: от Wintozo до 7.0",
    items: [
      "1.0.0 – 1.5.0 (Весна 2025)\nСтарт проекта под именем Wintozo Messenger. Первые браузерные версии, базовый функционал, простой дизайн, первые сервера. Официальная дата запуска — 21 марта 2025 года.",
      "2.0.0 (11 октября 2026)\nГлобальный ребрендинг в Cordy. Переход на нативный Android (APK). Новый строгий интерфейс, сохранение старого пакета org.wintozo.messenger.",
      "3.0.0 – 3.1.2 (Октябрь – Ноябрь 2026)\nВнедрение системы OTA-обновлений. Первые эксперименты с темами и стабильностью. Выход из бета-тестирования.",
      "4.0.0 (Ноябрь 2026)\nПервая крупная эпоха обновлений. Появление админ-панели (Admin Terminal), системы бейджей (Олд, Дизайнер, Тестер), внедрение Material You. Начало разделения серверов.",
      "4.0.1\nПакет исправлений (баг-фикс) после релиза 4.0.0. Оптимизация интерфейса и устранение мелких ошибок.",
      "5.0.0\nМасштабное обновление. Внедрение темы Liquid Glass, скрытых анимаций, стикеров и видео-кружков. Окончательное формирование архитектуры из 4 серверов (текст, медиа, стикеры).",
      "6.0.0 (Closed Beta)\nПолная переработка мобильных настроек (переход от вкладок к карточкам). Чистка базы данных от фейковых аккаунтов. Удаление Liquid Glass из открытого доступа.",
      "7.0 (Релиз 2027)\nПраздничное обновление. Внедрение новогоднего OOBE-интерфейса с обратным отсчетом до 2027 года. Интеграция звонков.",
    ],
  },
  "6.0.2": {
    version: "6.0.2",
    title: "В версии 6.0.2 были добавлены функции",
    items: [
      "1. Новый десктопный интерфейс: колонка разделов, список чатов и лёгкая синяя лента",
      "2. Обновлённые пузыри сообщений и композер в одну строку",
      "3. Настройки и админ-панель снова открываются по центру экрана",
      "4. Исправлены баги",
    ],
  },
  "6.0.0": {
    version: "6.0.0",
    title: "В версии 6.0.0 были добавлены функции",
    items: [
      "1. Обновлённая OOBE и новые анимации",
      "2. OOBE теперь только в стиле Material You",
      "3. Шрифт Google Sans добавлен в Material You",
      "4. Новый дизайн чатов Cordy You: пузыри, композер и список чатов",
      "5. 15 палитр — Океан, Лагуна, Янтарь, Сакура, Космос и другие",
      "6. Исправлены баги",
    ],
  },
  "5.0.0": {
    version: "5.0.0",
    title: "В версии 5.0.0 были добавлены функции",
    items: [
      "1. Cordy Glass стал доступен",
      "2. Прозрачные стеклянные панели, глубокое размытие и глянцевые блики",
      "3. Очень крупные скругления и новый шрифт",
      "4. Отдельный маршрут /themes/glass/chat",
      "5. Cordy Glass доступен с WinPro",
      "6. Исправлены баги",
    ],
  },
  "4.0.0": {
    version: "4.0.0",
    title: "В версии 4.0.0 были добавлены функции",
    items: [
      "1. Добавлен Cordy You (Material Design интерфейс)",
      "2. Выход из бета-тестирования ! Лучшие тестеры : @spidi390 , @markol",
      "3. Исправлены баги",
      "4. Отправка видео",
      "5. Отправка видео-кружков",
      "6. OTA-Обновления",
      "7. Каналы и их редактирование",
      "8. Редактирование сообщений",
    ],
  },
};

/** Вернуть changelog для версии, или ближайший известный. */
export function getChangelog(version: string): ChangelogEntry | null {
  if (CHANGELOGS[version]) return CHANGELOGS[version];
  // Берём самую свежую запись
  const keys = Object.keys(CHANGELOGS).sort((a, b) => {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pb[i] ?? 0) - (pa[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
  return keys.length ? CHANGELOGS[keys[0]] : null;
}

/** Показывали ли уже баннер обновления для этой версии? */
export function shouldShowUpdateBanner(latest: string): boolean {
  if (!isVersionNewer(latest, APP_VERSION)) return false;
  try {
    return localStorage.getItem(`winchat_update_dismissed`) !== latest;
  } catch {
    return true;
  }
}

export function dismissUpdateBanner(latest: string): void {
  try {
    localStorage.setItem("winchat_update_dismissed", latest);
  } catch {
    /* no-op */
  }
}

/** Показывать ли баннер «Обновление завершено» при входе в аккаунт
 *  (не при регистрации). Один раз на каждую установленную версию. */
export function shouldShowWhatsNew(): boolean {
  try {
    return localStorage.getItem(CHangelog_KEY) !== APP_VERSION;
  } catch {
    return false;
  }
}

export function markWhatsNewSeen(): void {
  try {
    localStorage.setItem(CHangelog_KEY, APP_VERSION);
  } catch {
    /* no-op */
  }
}
