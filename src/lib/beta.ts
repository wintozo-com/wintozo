/**
 * Бета-программа WinChat.
 *
 * Источник истины — серверные RPC из sql/winchat_update_22_beta_ota.sql.
 * Локально кешируем статус, чтобы экраны обновлений синхронно
 * показывали состояние заявки; бета-канал проверяется отдельно.
 */
import { supabase } from "./supabase";

export type BetaStatus = "none" | "pending" | "accepted" | "rejected";

export interface BetaInfo {
  status: BetaStatus;
  version: string | null;
  updatedAt: string | null;
  accepted: boolean;
}

export const BETA_STATUS_EVENT = "winchat:beta-status";
const BETA_INFO_KEY = "winchat_beta_info";

const NONE: BetaInfo = { status: "none", version: null, updatedAt: null, accepted: false };

function readLocal(): BetaInfo {
  try {
    const raw = localStorage.getItem(BETA_INFO_KEY);
    if (!raw) return { ...NONE };
    const parsed = JSON.parse(raw) as Partial<BetaInfo>;
    return {
      status: normalizeStatus(parsed.status),
      version: parsed.version ?? null,
      updatedAt: parsed.updatedAt ?? null,
      accepted: normalizeStatus(parsed.status) === "accepted",
    };
  } catch {
    return { ...NONE };
  }
}

function normalizeStatus(value: unknown): BetaStatus {
  return value === "pending" || value === "accepted" || value === "rejected"
    ? value
    : "none";
}

let cached: BetaInfo = readLocal();

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<BetaInfo>(BETA_STATUS_EVENT, { detail: cached }));
}

function commit(info: BetaInfo): BetaInfo {
  cached = {
    status: normalizeStatus(info.status),
    version: info.version ?? null,
    updatedAt: info.updatedAt ?? null,
    accepted: normalizeStatus(info.status) === "accepted",
  };
  try {
    localStorage.setItem(BETA_INFO_KEY, JSON.stringify(cached));
  } catch {
    /* no-op */
  }
  emit();
  return { ...cached };
}

/** Синхронный снимок статуса (для рендера без await). */
export function getBetaInfo(): BetaInfo {
  return { ...cached };
}

export function isBetaAccepted(): boolean {
  return cached.status === "accepted";
}

export function subscribeBeta(listener: (info: BetaInfo) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => listener((event as CustomEvent<BetaInfo>).detail);
  window.addEventListener(BETA_STATUS_EVENT, handler);
  return () => window.removeEventListener(BETA_STATUS_EVENT, handler);
}

export function resetBetaLocal(): void {
  commit(NONE);
}

/** Прочитать актуальный статус с сервера (если миграция уже применена). */
export async function refreshBetaStatus(): Promise<BetaInfo> {
  try {
    const { data, error } = await supabase.rpc("winchat_get_beta_status");
    if (error || !data) return { ...cached };
    const res = data as {
      ok?: boolean;
      status?: unknown;
      version?: string | null;
      updated_at?: string | null;
      accepted?: boolean;
    };
    if (!res.ok) return { ...cached };
    return commit({
      status: normalizeStatus(res.status),
      version: res.version ?? null,
      updatedAt: res.updated_at ?? null,
      accepted: Boolean(res.accepted),
    });
  } catch {
    return { ...cached };
  }
}

/**
 * Нажать «Активировать бета программу»: создаёт заявку admin.
 * Если сервер ещё без миграции — возвращаем понятную ошибку.
 */
export async function requestBetaAccess(
  version: string | null = null
): Promise<{ ok: boolean; message: string; info: BetaInfo }> {
  try {
    const { data, error } = await supabase.rpc("winchat_request_beta_access", {
      _version: version,
    });
    if (error) {
      return {
        ok: false,
        message: "Не удалось отправить заявку. Попробуйте позже.",
        info: { ...cached },
      };
    }
    const res = data as {
      ok?: boolean;
      status?: unknown;
      version?: string | null;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: res.message || "Не удалось отправить заявку.",
        info: { ...cached },
      };
    }
    const info = commit({
      status: normalizeStatus(res.status),
      version: res.version ?? cached.version,
      updatedAt: new Date().toISOString(),
      accepted: normalizeStatus(res.status) === "accepted",
    });
    return {
      ok: true,
      message: res.message || "Заявка отправлена admin",
      info,
    };
  } catch {
    return {
      ok: false,
      message: "Бета-программа пока недоступна на сервере.",
      info: { ...cached },
    };
  }
}

/* ============================================================
   Admin API для in-app «бота» заявок
   ============================================================ */

export interface BetaRequest {
  id: string;
  user_id: string;
  username: string | null;
  nickname: string | null;
  device_id: string | null;
  platform: string | null;
  model: string | null;
  manufacturer: string | null;
  os_version: string | null;
  app_version: string | null;
  requested_version: string | null;
  days_in_winchat: number | null;
  created_at: string;
  status: "pending" | "accepted" | "rejected";
  review_note: string | null;
}

export async function adminListBetaRequests(
  adminId: string,
  status: "pending" | "accepted" | "rejected" | "all" = "pending"
): Promise<{ ok: boolean; requests: BetaRequest[]; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("winchat_admin_list_beta_requests", {
      _admin_id: adminId,
      _status: status,
    });
    if (error) return { ok: false, requests: [], error: error.message };
    const res = data as { ok?: boolean; requests?: BetaRequest[]; error?: string };
    if (!res.ok) return { ok: false, requests: [], error: res.error };
    return { ok: true, requests: Array.isArray(res.requests) ? res.requests : [] };
  } catch (err) {
    return { ok: false, requests: [], error: String(err) };
  }
}

export async function adminReviewBetaRequest(
  adminId: string,
  requestId: string,
  accept: boolean,
  note: string | null = null
): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("winchat_admin_review_beta_request", {
      _admin_id: adminId,
      _request_id: requestId,
      _accept: accept,
      _note: note,
    });
    if (error) return { ok: false, message: error.message };
    const res = data as { ok?: boolean; message?: string; error?: string };
    return {
      ok: Boolean(res.ok),
      message: res.message || res.error || "Ответ сервера пуст",
    };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}
