/**
 * OTA-обновления WinChat для Android.
 *
 * Логика:
 *  - при запуске определяем устройство и отправляем статус на сервер:
 *      is_wintozo_web_true — открыто как веб-страница;
 *      is_wintozo_web_no   — нативное Android-приложение;
 *  - для нативного приложения запрашиваем версию (check_version) и
 *    winchat_search_ota;
 *  - если админ выложил APK через /set ota "ссылка", показываем кнопку
 *    «Установить» и отдаём ссылку нативному плагину WinChatOta, который
 *    скачивает APK и открывает системный установщик.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { supabase } from "./supabase";
import { BETA_STATUS_EVENT } from "./beta";
import {
  APP_VERSION,
  DOWNLOAD_URL,
  fetchLatestVersion,
  getDemoAvailableVersion,
  isUpdate7DemoActive,
  isVersion7,
  isVersionNewer,
  markUpdatedTo,
  shouldOfferOta,
} from "./checkVersion";

/* ============================================================
   Нативный плагин (android/app/.../WinChatOtaPlugin.java)
   ============================================================ */

interface NativeDeviceInfo {
  deviceId?: string;
  model?: string;
  manufacturer?: string;
  osVersion?: string;
  appVersion?: string;
  packageName?: string;
}

interface WinChatOtaPlugin {
  getInfo(): Promise<NativeDeviceInfo>;
  install(options: { url: string }): Promise<{ started?: boolean }>;
  addListener(
    eventName: "otaStatus",
    listener: (event: OtaStatusEvent) => void
  ): Promise<PluginListenerHandle>;
}

const WinChatOta = (() => {
  try {
    return registerPlugin<WinChatOtaPlugin>("WinChatOta");
  } catch {
    // Уже зарегистрирован (повторный импорт модуля в HMR)
    return {} as WinChatOtaPlugin;
  }
})();

export type OtaState = "downloading" | "permission" | "installing" | "error";

export interface OtaStatusEvent {
  state: OtaState;
  message?: string;
  /** Прогресс загрузки APK в процентах (0..100), если доступен. */
  progress?: number;
  /** Скачано байт (если доступно). */
  bytesDownloaded?: number;
  /** Всего байт (если доступно). */
  bytesTotal?: number;
}

/* ============================================================
   Определение устройства
   ============================================================ */

const DEVICE_ID_KEY = "winchat_device_id";

export interface DeviceInfo {
  deviceId: string;
  /** true = веб-страница, false = нативное Android-приложение. */
  isWintozoWeb: boolean;
  isAndroid: boolean;
  platform: string;
  model: string;
  manufacturer: string;
  osVersion: string;
  appVersion: string;
}

let deviceInfoPromise: Promise<DeviceInfo> | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* no-op */
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getStoredDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY);
    if (saved) return saved;
    const id = randomId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function canInstallOta(): boolean {
  return isNativeAndroid() && Capacitor.isPluginAvailable("WinChatOta");
}

async function loadDeviceInfo(): Promise<DeviceInfo> {
  const nativeAndroid = isNativeAndroid();
  const platform = Capacitor.getPlatform();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroid = platform === "android" || /Android/i.test(ua);

  let native: NativeDeviceInfo = {};
  if (nativeAndroid) {
    try {
      native = await WinChatOta.getInfo();
    } catch {
      /* плагин ещё не в этой сборке — работаем по данным браузера */
    }
  }

  return {
    deviceId: native.deviceId?.trim() || getStoredDeviceId(),
    isWintozoWeb: !nativeAndroid,
    isAndroid,
    platform,
    model: native.model || (isAndroid ? "Android" : ""),
    manufacturer: native.manufacturer || "",
    osVersion: native.osVersion || ua,
    appVersion: native.appVersion || APP_VERSION,
  };
}

/** Информация об устройстве (кэшируется на время сессии). */
export function getDeviceInfo(): Promise<DeviceInfo> {
  if (!deviceInfoPromise) {
    deviceInfoPromise = loadDeviceInfo().catch(() => ({
      deviceId: getStoredDeviceId(),
      isWintozoWeb: true,
      isAndroid: false,
      platform: "web",
      model: "",
      manufacturer: "",
      osVersion: "",
      appVersion: APP_VERSION,
    }));
  }
  return deviceInfoPromise;
}

/* ============================================================
   Статус устройства → сервер
   ============================================================ */

let lastReportAt = 0;

/**
 * Отправить статус is_wintozo_web_true / is_wintozo_web_no.
 * Повторные вызовы в течение минуты не дублируются (кроме force).
 */
export async function reportDeviceStatus(force = false): Promise<DeviceInfo> {
  const info = await getDeviceInfo();
  if (!info.isAndroid) return info;
  if (!force && Date.now() - lastReportAt < 60_000) return info;
  lastReportAt = Date.now();

  try {
    await supabase.rpc("winchat_report_device", {
      _device_id: info.deviceId,
      _is_wintozo_web: info.isWintozoWeb,
      _platform: info.platform,
      _app_version: info.appVersion,
      _model: info.model,
      _manufacturer: info.manufacturer,
      _os_version: info.osVersion,
    });
  } catch {
    /* SQL-миграция ещё не применена — OTA просто не активируется */
  }
  return info;
}

/* ============================================================
   Поиск и установка OTA
   ============================================================ */

export type OtaChannel = "beta" | "full";

export interface OtaInfo {
  url: string;
  version: string | null;
  target: string;
  /** Канал обновления: beta — только для принятых тестеров, full — для всех. */
  channel: OtaChannel;
  /** Когда админ перезалил запись OTA (пересборка APK с той же версией). */
  updatedAt: string | null;
  /** Текст из `--note ...` в команде /set ota. */
  description: string | null;
}

export interface OtaInitResult {
  device: DeviceInfo;
  ota: OtaInfo | null;
  latestVersion: string | null;
}

/** Событие для экрана обновления WinChat 7.x (кнопка «Проверить обновления»). */
export const OTA7_SHOW_EVENT = "winchat:show-ota7";

/** Открыть центр обновлений 7.0 (лого, красная 7, бета-программа). */
export const UPDATE_CENTER_EVENT = "winchat:open-update-center";

export function openUpdateCenter(ota: OtaInfo | null = null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OtaInfo | null>(UPDATE_CENTER_EVENT, { detail: ota }));
}

export function requestOta7Overlay(ota: OtaInfo): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OtaInfo>(OTA7_SHOW_EVENT, { detail: ota }));
}

/** Демо-запись OTA для /update_7_active: «установлена 6, доступна 7». */
export function getDemoOta7(): OtaInfo {
  return {
    url: DOWNLOAD_URL,
    version: getDemoAvailableVersion(),
    target: "*",
    channel: "full",
    updatedAt: null,
    description:
      "В версии 7.0 добавлено: новогодний дизайн, OTA-обновления, новые темы и многое другое.",
  };
}

/**
 * Кнопка «Проверить обновления»: открывает экран 7.x для реальной OTA
 * либо для демо-роута /update_7_active (и на ПК, и на телефоне).
 */
export function showOta7IfAvailable(ota: OtaInfo | null): void {
  if (ota?.version && isVersion7(ota.version)) {
    requestOta7Overlay(ota);
    return;
  }
  if (isUpdate7DemoActive()) {
    requestOta7Overlay(getDemoOta7());
  }
}

/* ============================================================
   Разбор аргументов /set ota
   /set ota https://…apk 7.0.0 --note В версии 7.0 добавлено...
   /set ota @admin https://…apk 7.0.0 --note "В версии 7.0..."
   плюс старый формат с описанием в кавычках.
   ============================================================ */

export interface ParsedSetOtaArgs {
  off: boolean;
  url: string | null;
  version: string | null;
  target: string | null;
  channel: OtaChannel;
  description: string | null;
}

const OTA_VERSION_RE =
  /^\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z][0-9A-Za-z.\-]*)?(?:\+[0-9A-Za-z.\-]+)?$/;

function unquoteOtaToken(value: string): string {
  return value.trim().replace(/^["']+|["']+$/g, "").trim();
}

/** Разобрать всё, что стоит после `/set ota`. */
export function parseSetOtaArgs(raw: string): ParsedSetOtaArgs {
  const empty: ParsedSetOtaArgs = {
    off: false,
    url: null,
    version: null,
    target: null,
    channel: "full",
    description: null,
  };
  const trimmed = (raw || "").trim();
  if (!trimmed) return empty;

  // `/set ota off beta` и `/set ota full off` выключают нужный канал.
  const offMatch = trimmed.match(
    /^(?:off|clear|remove|delete|disable)(?:\s+(beta|full))?\s*$/i
  );
  if (offMatch) {
    return { ...empty, off: true, channel: normalizeOtaChannel(offMatch[1]) };
  }
  const trailingOff = trimmed.match(/\s+(?:off|clear|remove|delete|disable)\s*$/i);
  if (trailingOff) {
    const prefix = trimmed.slice(0, trailingOff.index).trim();
    const chMatch = prefix.match(/\b(beta|full)\b/i);
    if (chMatch) {
      return { ...empty, off: true, channel: normalizeOtaChannel(chMatch[1]) };
    }
  }

  let rest = trimmed;

  // `--note` забирает весь остаток строки: в описании могут быть
  // пробелы, запятые и даже ссылки.
  let note: string | null = null;
  const noteMatch = rest.match(/--(?:note|desc|description)\b\s*([\s\S]*)$/i);
  if (noteMatch) {
    note = unquoteOtaToken(noteMatch[1]) || null;
    rest = rest.slice(0, noteMatch.index ?? 0).trim();
  }

  const urlMatch = /https?:\/\/[^\s"']+/i.exec(rest);
  if (!urlMatch) return { ...empty, description: note };
  const url = unquoteOtaToken(urlMatch[0]);
  const urlIndex = urlMatch.index ?? 0;
  rest = (
    rest.slice(0, urlIndex) +
    " " +
    rest.slice(urlIndex + urlMatch[0].length)
  ).trim();

  // Старый формат: описание в кавычках без --note.
  const quoted: string[] = [];
  rest = rest.replace(/"([^"]*)"/g, (_m, g: string) => {
    if (g.trim()) quoted.push(g.trim());
    return " ";
  });
  rest = rest.replace(/'([^']*)'/g, (_m, g: string) => {
    if (g.trim()) quoted.push(g.trim());
    return " ";
  });

  const tokens = rest.split(/\s+/).filter(Boolean);
  // Канал — отдельный токен, его нельзя путать с @target/device_id.
  const channelToken = tokens.find((t) => /^(beta|full)$/i.test(unquoteOtaToken(t)));
  const channel = normalizeOtaChannel(channelToken);
  const tokensNoChannel = tokens.filter((t) => t !== channelToken);
  const versionToken = tokensNoChannel.find((t) =>
    OTA_VERSION_RE.test(unquoteOtaToken(t))
  );
  const version = versionToken ? unquoteOtaToken(versionToken) : null;
  const extras = tokensNoChannel.filter((t) => t !== versionToken);
  const targetToken =
    extras.find((t) => t.startsWith("@") || t === "*") ?? extras[0] ?? null;
  const leftover = extras
    .filter((t) => t !== targetToken)
    .map(unquoteOtaToken)
    .filter(Boolean)
    .join(" ");

  return {
    off: false,
    url,
    version,
    target: targetToken ? unquoteOtaToken(targetToken) : null,
    channel,
    description: note ?? quoted[0] ?? (leftover || null),
  };
}

function normalizeOtaChannel(value?: string): OtaChannel {
  return value && value.toLowerCase() === "beta" ? "beta" : "full";
}

export async function searchOta(
  deviceId: string,
  channel: OtaChannel = "full"
): Promise<OtaInfo | null> {
  try {
    const { data, error } = await supabase.rpc("winchat_search_ota", {
      _device_id: deviceId,
      _channel: channel,
    });
    if (error || !data) return null;
    const res = data as {
      ok?: boolean;
      available?: boolean;
      url?: string | null;
      version?: string | null;
      target?: string | null;
      channel?: string | null;
      updated_at?: string | null;
      /** Появляется после миграции winchat_update_21_ota7_note.sql. */
      description?: string | null;
    };
    if (!res.ok || !res.available || !res.url) return null;
    const ota: OtaInfo = {
      url: res.url,
      version: res.version ?? null,
      target: res.target ?? "*",
      channel: normalizeOtaChannel(res.channel ?? undefined) ?? channel,
      updatedAt: res.updated_at ?? null,
      description: res.description ?? null,
    };
    // На нативном Android фильтруем по версии (versionName из APK),
    // только если админ указал версию у OTA. Без версии OTA работает
    // как push-канал: плашка видна, пока админ не снял запись.
    // Если версия указана и не новее установленной — запись всё равно
    // считается новой, когда админ перезаливал её (updated_at изменился
    // с момента прошлой установки): так пересборка APK с той же строкой
    // версии снова предлагает установку.
    // В вебе не фильтруем: там APK просто скачивается по ссылке.
    // Бета-сборки часто имеют пререлизную строку вида 7.0.0-closed-beta,
    // которая по semver «старее» открытой беты. Для beta-канала не сравниваем
    // версии: наличие записи и отметка updated_at важнее строки версии.
    if (canInstallOta()) {
      if (ota.channel === "beta") {
        // Не сравниваем версии: 7.0.0-closed-beta по semver «старее»,
        // чем 7.0.0-open-beta, но это другая бета-сборка. Повторно не
        // предлагаем только ту же запись, которую уже начали ставить.
        if (ota.updatedAt && ota.updatedAt === getOtaSeenStamp("beta")) return null;
      } else if (ota.version) {
        const info = await getDeviceInfo();
        const installed = info.appVersion || APP_VERSION;
        if (!isVersionNewer(ota.version, installed)) {
          // Телефон уже обновлялся до этой версии (короткий id) — не предлагаем снова.
          if (!shouldOfferOta(ota.version)) return null;
          if (!ota.updatedAt || ota.updatedAt === getOtaSeenStamp(ota.channel)) return null;
        }
      }
    }
    return ota;
  } catch {
    return null;
  }
}

let otaInitPromise: Promise<OtaInitResult> | null = null;

async function runOtaInit(): Promise<OtaInitResult> {
  // force=true: к моменту CheckVersion пользователь уже вошёл,
  // поэтому успеваем привязать device_id к аккаунту до поиска OTA.
  const device = await reportDeviceStatus(true);

  if (device.isWintozoWeb) {
    const latestVersion = await fetchLatestVersion();
    return { device, ota: null, latestVersion };
  }

  const [latestVersion, ota] = await Promise.all([
    fetchLatestVersion(),
    searchOta(device.deviceId, "full"),
  ]);
  return { device, ota, latestVersion };
}

/**
 * Инициализация OTA при запуске. Результат кэшируется, поэтому
 * App и CheckVersion могут звать её безопасно.
 */
export function initDeviceOta(): Promise<OtaInitResult> {
  if (!otaInitPromise) {
    otaInitPromise = runOtaInit().catch(() => ({
      device: {
        deviceId: getStoredDeviceId(),
        isWintozoWeb: true,
        isAndroid: false,
        platform: "web",
        model: "",
        manufacturer: "",
        osVersion: "",
        appVersion: APP_VERSION,
      },
      ota: null,
      latestVersion: null,
    }));
  }
  return otaInitPromise;
}

/**
 * Сбросить кэш инициализации: вызываем после изменения бета-статуса,
 * иначе пользователь может остаться на старом канале до перезагрузки.
 */
export function resetOtaInit(): void {
  otaInitPromise = null;
}

if (typeof window !== "undefined") {
  window.addEventListener(BETA_STATUS_EVENT, () => {
    resetOtaInit();
  });
}

/** Скачать APK и открыть системный установщик. */
export async function installOta(
  url: string,
  version?: string | null
): Promise<{ started: boolean; fallback: boolean }> {
  if (!canInstallOta()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return { started: false, fallback: true };
  }

  try {
    await WinChatOta.install({ url });
    markUpdatedTo(version || APP_VERSION);
    return { started: true, fallback: false };
  } catch {
    // Если нативный установщик недоступен, отдаём ссылку системе.
    window.open(url, "_blank", "noopener,noreferrer");
    return { started: false, fallback: true };
  }
}

/** Подписка на прогресс/ошибки нативного установщика. */
export async function onOtaStatus(
  listener: (event: OtaStatusEvent) => void
): Promise<() => void> {
  if (!canInstallOta()) return () => {};
  try {
    const handle = await WinChatOta.addListener("otaStatus", listener);
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

/* ============================================================
   Отметка «эту запись OTA уже ставили» (для пересборок с той же
   версией): храним updated_at последней установленной записи.
   ============================================================ */

const OTA_SEEN_KEY = "winchat_ota_seen_stamp";

function otaSeenKey(channel: OtaChannel): string {
  return channel === "full" ? OTA_SEEN_KEY : `${OTA_SEEN_KEY}:${channel}`;
}

function getOtaSeenStamp(channel: OtaChannel = "full"): string | null {
  try {
    return localStorage.getItem(otaSeenKey(channel));
  } catch {
    return null;
  }
}

/** Запомнить, что пользователь начал установку этой записи OTA. */
export function markOtaSeen(ota: OtaInfo): void {
  try {
    if (ota.updatedAt) localStorage.setItem(otaSeenKey(ota.channel), ota.updatedAt);
  } catch {
    /* no-op */
  }
}

/* ============================================================
   Скрытие баннера конкретного OTA
   ============================================================ */

const OTA_DISMISS_KEY = "winchat_ota_dismissed";

function otaDismissKey(channel: OtaChannel): string {
  return channel === "full" ? OTA_DISMISS_KEY : `${OTA_DISMISS_KEY}:${channel}`;
}

export function isOtaDismissed(url: string, channel: OtaChannel = "full"): boolean {
  try {
    return localStorage.getItem(otaDismissKey(channel)) === url;
  } catch {
    return false;
  }
}

export function dismissOta(url: string, channel: OtaChannel = "full"): void {
  try {
    localStorage.setItem(otaDismissKey(channel), url);
  } catch {
    /* no-op */
  }
}
