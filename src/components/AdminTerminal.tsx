import { useEffect, useRef, useState } from "react";
import { Terminal, X } from "lucide-react";
import { supabase, type Profile } from "../lib/supabase";
import { BADGE_LABELS } from "../lib/badges";
import { parseSetOtaArgs, type OtaChannel } from "../lib/ota";
import {
  adminListBetaRequests,
  adminReviewBetaRequest,
  type BetaRequest,
} from "../lib/beta";
import AdminTerminalGui from "./AdminTerminalGui";

interface Props {
  me: Profile;
  open: boolean;
  onClose: () => void;
  onProfileUpdated: () => void;
}

interface LogEntry {
  type: "input" | "success" | "error" | "info";
  text: string;
}

interface OtaDeviceRow {
  device_id: string;
  is_wintozo_web: boolean;
  status: string | null;
  platform: string | null;
  app_version: string | null;
  model: string | null;
  manufacturer: string | null;
  os_version: string | null;
  username: string | null;
}

export default function AdminTerminal({ me, open, onClose, onProfileUpdated }: Props) {
  const [history, setHistory] = useState<LogEntry[]>([
    { type: "info", text: "WinChat Admin Terminal v2.0" },
    { type: "info", text: "Введите /help для списка команд" },
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  /* Окно выбора устройства для OTA-обновления (/set ota @user "ссылка" версия). */
  const [otaPicker, setOtaPicker] = useState<{
    url: string;
    version: string | null;
    target: string;
    channel: OtaChannel;
    description: string | null;
  } | null>(null);
  const [otaPickerDevices, setOtaPickerDevices] = useState<OtaDeviceRow[]>([]);
  const [otaPickerBusy, setOtaPickerBusy] = useState(false);
  const [betaRequests, setBetaRequests] = useState<BetaRequest[]>([]);
  const [guiMode, setGuiMode] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  useEffect(() => {
    if (open) {
      const el = document.getElementById("admin-term-input");
      el?.focus();
    }
  }, [open]);

  async function openOtaPicker(
    target: string,
    url: string,
    version: string | null,
    description: string | null = null,
    channel: OtaChannel = "full"
  ) {
    setOtaPicker({ url, version, target, channel, description });
    setOtaPickerBusy(false);
    const { data, error } = await supabase.rpc("get_winchat_ota_devices", {
      _admin_id: me.id,
      _limit: 50,
    });
    if (error) {
      setOtaPickerDevices([]);
      return;
    }
    const res = data as { ok: boolean; devices?: OtaDeviceRow[] };
    let list = (res.devices ?? []) as OtaDeviceRow[];
    if (target.startsWith("@")) {
      const uname = target.slice(1).toLowerCase();
      list = list.filter((d) => (d.username ?? "").toLowerCase() === uname);
    }
    setOtaPickerDevices(list);
    if (list.length === 1) {
      void selectOtaDevice(list[0].device_id, url, version, description, channel);
    }
  }

  async function selectOtaDevice(
    deviceId: string,
    url: string,
    version: string | null,
    description: string | null = null,
    channel: OtaChannel = "full"
  ) {
    setOtaPickerBusy(true);
    const { data } = await supabase.rpc("set_winchat_ota", {
      _admin_id: me.id,
      _url: url,
      _version: version,
      _target: deviceId,
      _desc: description,
      _channel: channel,
    });
    setOtaPickerBusy(false);
    const res = data as { ok: boolean; message?: string; error?: string };
    setHistory((prev) => [
      ...prev,
      { type: res.ok ? "success" : "error", text: res.ok ? `✓ ${res.message}` : `✗ ${res.error}` },
    ]);
    if (res.ok) setOtaPicker(null);
  }

  type OtaSetResult = {
    ok: boolean;
    message?: string;
    error?: string;
    url?: string | null;
    version?: string | null;
    target?: string | null;
    description?: string | null;
  };

  /** Устанавливает/снимает OTA и сохраняет описание обновления. */
  async function applyOta(
    urlRaw: string,
    versionRaw: string | null,
    targetRaw: string | null,
    descRaw: string | null,
    channel: OtaChannel = "full"
  ): Promise<OtaSetResult> {
    const url = (urlRaw || "").trim().replace(/^"|"$/g, "");
    const version = versionRaw ? versionRaw.trim() : null;
    const target = targetRaw ? targetRaw.trim() : null;
    const description = descRaw ? descRaw.trim() : null;

    const { data, error } = await supabase.rpc("set_winchat_ota", {
      _admin_id: me.id,
      _url: url,
      _version: version,
      _target: target,
      _desc: description,
      _channel: channel,
    });

    const res = data as {
      ok?: boolean;
      message?: string;
      error?: string;
      url?: string | null;
      version?: string | null;
      target?: string | null;
    };
    if (error) return { ok: false, error: error.message };
    if (!res.ok) return { ok: false, error: res.error ?? "Ошибка" };
    return {
      ok: true,
      message: res.message,
      url: res.url ?? url,
      version: res.version,
      target: res.target,
      description,
    };
  }

  async function runCommand(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    setHistory((prev) => [...prev, { type: "input", text: trimmed }]);
    setInput("");

    if (!trimmed.startsWith("/")) {
      setHistory((prev) => [
        ...prev,
        { type: "error", text: "Команды начинаются с / . Введите /help для справки" },
      ]);
      return;
    }

    const parts = trimmed.toLowerCase().split(/\s+/);
    const cmd = parts[0];

    try {
      switch (cmd) {
        case "/gui": {
          setGuiMode((g) => !g);
          setHistory((prev) => [
            ...prev,
            { type: "info", text: guiMode ? "Выход из графического режима админ-терминала" : "Графический режим админ-терминала" },
          ]);
          break;
        }

        case "/help": {
          setHistory((prev) => [
            ...prev,
            { type: "info", text: "═══ Команды админ-терминала ═══" },
            { type: "info", text: "/addverify <username> grey  — Серая галочка (1 этап)" },
            { type: "info", text: "/addverify <username> green — Зелёная галочка (2 этап)" },
            { type: "info", text: "/addverify <username> true  — Синяя галочка (полная верификация)" },
            { type: "info", text: "/disverify <username>       — Снять галочку" },
            { type: "info", text: "/ban <username> <причина>   — Заблокировать" },
            { type: "info", text: "/unban <username>           — Разблокировать" },
            { type: "info", text: "/status <username>          — Статус пользователя" },
            { type: "info", text: "/get winpass @username      — WinPass аккаунта (восстановление)" },
            { type: "info", text: "/give wintozopro @username X — Выдать WinPro на X дней" },
            { type: "info", text: "/delete wintozopro @username — Удалить WinPro" },
            { type: "info", text: "/give glass @username — Выдать WinChat Glass (флаг is_winchat_glass_true)" },
            { type: "info", text: "/delete glass @username — Снять WinChat Glass (флаг is_winchat_glass_no)" },
            { type: "info", text: "/give badge @username <1|2|3> — Выдать бейдж (1 — Дизайнер, 2 — Тестер, 3 — Олд)" },
            { type: "info", text: "/get badges @username — Получить бейджи пользователя" },
            { type: "info", text: "/channel list — Список каналов (id, название, подписчики)" },
            { type: "info", text: "/channel verify <id|название> — Выдать синюю галочку каналу" },
            { type: "info", text: "/channel unverify <id|название> — Снять галочку канала" },
            { type: "info", text: "/channel official <id|название> — Сделать канал официальным" },
            { type: "info", text: "/channel unofficial <id|название> — Снять статус официального" },
            { type: "info", text: "/channel delete <id|название> — Удалить канал" },
            { type: "info", text: "/set version <X.Y.Z>        — Установить версию (можно 4.0.0-beta)" },
            { type: "info", text: "/get version                — Текущая версия приложения" },
            { type: "info", text: "/set ota <ссылка> beta|full <версия> [@target|*] --note \"что нового\" — OTA для Android" },
            { type: "info", text: "/set ota off [beta|full]    — Отключить OTA канала (по умолчанию full)" },
            { type: "info", text: "/get ota [beta|full]        — Текущая OTA-настройка канала" },
            { type: "info", text: "/get beta requests          — Заявки на бета-тест (in-app бот)" },
            { type: "info", text: "/beta accept <id>           — Принять заявку в бета-программу" },
            { type: "info", text: "/beta reject <id> [причина] — Отклонить заявку" },
            { type: "info", text: "/set legacy @username       — Включить базовый (legacy) интерфейс WinChat" },
            { type: "info", text: "/del legacy @username       — Вернуть новый интерфейс WinChat" },
            { type: "info", text: '/set oobe @username "<X.Y>" — Показать пользователю OOBE версии (5.0 / 6.0) при следующем входе' },
            { type: "info", text: "/set oobe @username off     — Вернуть обычную логику OOBE" },
            { type: "info", text: "/get devices                — Устройства, которые запускали приложение" },
            { type: "info", text: "/gui                       — Графический интерфейс админ-терминала (кнопки)" },
            { type: "info", text: "/help                       — Эта справка" },
          ]);
          break;
        }

        case "/addverify": {
          const username = parts[1]?.replace("@", "");
          const level = parts[2];
          if (!username || !level) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Использование: /addverify <username> <grey|green|true>" },
            ]);
            return;
          }
          const mappedLevel = level === "true" ? "full" : level;
          if (!["grey", "green", "full"].includes(mappedLevel)) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Неверный уровень. Доступные: grey, green, true" },
            ]);
            return;
          }

          const { data, error } = await supabase.rpc("add_verify_status", {
            _admin_id: me.id,
            _target_username: username,
            _level: mappedLevel,
          });

          if (error) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            return;
          }

          const res = data as { ok: boolean; message?: string; error?: string };
          if (res.ok) {
            setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
            onProfileUpdated();
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
          }
          break;
        }

        case "/disverify": {
          const username = parts[1]?.replace("@", "");
          if (!username) {
            setHistory((prev) => [...prev, { type: "error", text: "Использование: /disverify <username>" }]);
            return;
          }

          const { data, error } = await supabase.rpc("disverify_status", {
            _admin_id: me.id,
            _target_username: username,
          });

          if (error) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            return;
          }

          const res = data as { ok: boolean; message?: string; error?: string };
          if (res.ok) {
            setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
            onProfileUpdated();
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
          }
          break;
        }

        case "/ban": {
          const username = parts[1]?.replace("@", "");
          const reason = parts.slice(2).join(" ") || "Без указания причины";
          if (!username) {
            setHistory((prev) => [...prev, { type: "error", text: "Использование: /ban <username> [причина]" }]);
            return;
          }

          const { data, error } = await supabase.rpc("ban_user_by_username", {
            _admin_id: me.id,
            _target_username: username,
            _reason: reason,
          });

          if (error) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            return;
          }

          const res = data as { ok: boolean; message?: string; error?: string };
          if (res.ok) {
            setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
          }
          break;
        }

        case "/unban": {
          const username = parts[1]?.replace("@", "");
          if (!username) {
            setHistory((prev) => [...prev, { type: "error", text: "Использование: /unban <username>" }]);
            return;
          }

          const { data, error } = await supabase.rpc("unban_user_by_username", {
            _admin_id: me.id,
            _target_username: username,
          });

          if (error) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            return;
          }

          const res = data as { ok: boolean; message?: string; error?: string };
          if (res.ok) {
            setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
          }
          break;
        }

        case "/status": {
          const username = parts[1]?.replace("@", "");
          if (!username) {
            setHistory((prev) => [...prev, { type: "error", text: "Использование: /status <username>" }]);
            return;
          }

          const { data, error } = await supabase.rpc("get_verify_status", {
            _admin_id: me.id,
            _target_username: username,
          });

          if (error) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            return;
          }

          const res = data as { ok: boolean; error?: string; nickname?: string; username?: string; verify_status?: string; banned?: boolean };
          if (res.ok) {
            const badge = res.verify_status === "full" ? "🔵 Синяя" :
                          res.verify_status === "green" ? "🟢 Зелёная" :
                          res.verify_status === "grey" ? "⚪ Серая" : "— Нет";
            setHistory((prev) => [
              ...prev,
              { type: "info", text: `Пользователь: ${res.nickname} (@${res.username})` },
              { type: "info", text: `Галочка: ${badge}` },
              { type: "info", text: `Заблокирован: ${res.banned ? "да" : "нет"}` },
            ]);
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
          }
          break;
        }

        case "/set": {
          const what = parts[1];

          if (what === "legacy") {
            const username = parts[2]?.replace(/^@/, "").replace(/["']/g, "");
            if (!username) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: "Использование: /set legacy @username" },
              ]);
              break;
            }
            const { error } = await supabase
              .from("profiles")
              .update({ is_winchat_legacy: "is_winchat_legacy_true" })
              .eq("username", username);
            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            } else {
              setHistory((prev) => [
                ...prev,
                { type: "success", text: `✓ @${username}: включён legacy-интерфейс (winchat-legacy)` },
              ]);
              onProfileUpdated();
            }
            break;
          }

          if (what === "ota") {
            // Всё после "/set ota" — исходная строка (URL чувствителен к регистру).
            const after = trimmed.replace(/^\/set\s+ota\s*/i, "").trim();
            const parsed = parseSetOtaArgs(after);

            if (!after || (!parsed.off && !parsed.url)) {
              setHistory((prev) => [
                ...prev,
                {
                  type: "error",
                  text: 'Использование: /set ota <ссылка> beta|full <версия> [@target|*] --note "описание обновления"',
                },
              ]);
              break;
            }

            // Отключение OTA
            if (parsed.off) {
              const { data, error } = await supabase.rpc("set_winchat_ota", {
                _admin_id: me.id,
                _url: "",
                _version: null,
                _target: null,
                _desc: null,
                _channel: parsed.channel,
              });
              if (error) {
                setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
                break;
              }
              const res = data as { ok: boolean; message?: string; error?: string };
              setHistory((prev) => [
                ...prev,
                res.ok
                  ? { type: "success", text: `✓ ${res.message}` }
                  : { type: "error", text: `✗ ${res.error}` },
              ]);
              break;
            }

            if (!parsed.url) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: "Ссылка должна начинаться с http:// или https://" },
              ]);
              break;
            }

            const url = parsed.url;
            const res = await applyOta(
              url,
              parsed.version,
              parsed.target,
              parsed.description,
              parsed.channel
            );

            setHistory((prev) => [
              ...prev,
              { type: res.ok ? "success" : "error", text: res.ok ? `✓ ${res.message}` : `✗ ${res.error}` },
              { type: "info", text: `Канал: ${parsed.channel === "beta" ? "beta (только принятые тестеры)" : "full (все пользователи)"}` },
              { type: "info", text: `URL: ${res.url ?? url}` },
              { type: "info", text: `Версия: ${res.version ?? "не указана"} · Цель: ${res.target ?? "*"}` },
              ...(res.description
                ? [{ type: "info" as const, text: `Описание обновления: ${res.description}` }]
                : []),
            ]);

            // Если задана конкретная цель (например, @username) — открываем выбор устройства.
            if (res.ok && parsed.target && parsed.target !== "*") {
              void openOtaPicker(
                parsed.target,
                res.url ?? url,
                res.version ?? null,
                res.description ?? null,
                parsed.channel
              );
            }
            break;
          }

          if (what === "oobe") {
            const username = parts[2]?.replace(/^@/, "").replace(/["']/g, "");
            // Версию берём из исходной строки (вдруг с кавычками): "5.0" или 6.0
            const rawVer = trimmed
              .replace(/^\/set\s+oobe\s*/i, "")
              .replace(/^@[^\s"']+\s*/i, "")
              .trim()
              .replace(/^["']|["']$/g, "");
            if (!username) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: 'Использование: /set oobe @username "<X.Y>" (например 5.0 или 6.0) | /set oobe @username off' },
              ]);
              break;
            }

            let version: string | null = rawVer || null;
            if (!version || /^(off|clear|remove|none|нет)$/i.test(version)) {
              version = null; // снять назначенную OOBE — вернётся обычная логика
            } else if (!/^\d+\.\d+$/.test(version)) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: 'Неверный формат версии. Пример: /set oobe @username "5.0" или /set oobe @username 6.0' },
              ]);
              break;
            }

            const { data, error } = await supabase.rpc("set_oobe", {
              _admin_id: me.id,
              _target_username: username,
              _version: version,
            });
            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              break;
            }
            const res = data as { ok: boolean; message?: string; error?: string };
            if (res.ok) {
              setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
              onProfileUpdated();
            } else {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
            }
            break;
          }

          if (what !== "version") {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: 'Использование: /set version <X.Y.Z[-beta]> | /set ota [@username] "<ссылка>" [версия] --note "что нового" | /set oobe @username "<X.Y>"' },
            ]);
            return;
          }
          // Версия берётся из исходной строки — toLowerCase() не нужен,
          // но и не вредит: цифры и точки регистронезависимы.
          const rawVersion = trimmed.split(/\s+/).slice(2).join("").trim();
          if (!rawVersion || !/^\d+\.\d+(\.\d+)?(-[0-9a-z][0-9a-z.\-]*(\+[0-9a-z.\-]+)?)?$/i.test(rawVersion)) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Неверный формат версии. Пример: /set version 4.0.0-beta" },
            ]);
            return;
          }

          const { data, error } = await supabase.rpc("set_wintozo_version", {
            _admin_id: me.id,
            _version: rawVersion,
          });

          if (error) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            return;
          }

          const res = data as { ok: boolean; message?: string; error?: string };
          if (res.ok) {
            setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
          }
          break;
        }

        case "/get": {
          const what = parts[1];
          if (what === "winpass") {
            const username = parts[2]?.replace("@", "");
            if (!username) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: "Использование: /get winpass @username" },
              ]);
              return;
            }

            const { data, error } = await supabase.rpc("admin_get_winpass", {
              _admin_id: me.id,
              _target_username: username,
            });

            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              return;
            }

            const res = data as {
              ok: boolean;
              error?: string;
              nickname?: string;
              username?: string;
              winpass?: string | null;
            };
            if (!res.ok) {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
              break;
            }
            if (!res.winpass) {
              setHistory((prev) => [
                ...prev,
                { type: "info", text: `У @${res.username} WinPass ещё нет — выдаю новый…` },
              ]);
              // Выдать код существующему аккаунту через серверный генератор (формат 33b42 + строчные hex)
              const { data: newCode, error: genErr } = await supabase.rpc("generate_winpass");
              if (genErr || !newCode) {
                setHistory((prev) => [
                  ...prev,
                  { type: "error", text: `Не удалось сгенерировать WinPass: ${genErr?.message || "пустой ответ"}` },
                ]);
                break;
              }
              const { error: setErr } = await supabase
                .from("profiles")
                .update({ winpass: newCode as string })
                .eq("username", username);
              if (setErr) {
                setHistory((prev) => [
                  ...prev,
                  { type: "error", text: `Не удалось выдать WinPass: ${setErr.message}` },
                ]);
                break;
              }
              setHistory((prev) => [
                ...prev,
                { type: "success", text: `✓ WinPass выдан: ${newCode}` },
              ]);
              break;
            }
            setHistory((prev) => [
              ...prev,
              { type: "info", text: `${res.nickname} (@${res.username})` },
              { type: "success", text: `WinPass: ${res.winpass}` },
            ]);
            break;
          }

          if (what === "version") {
            const { data, error } = await supabase.rpc("get_wintozo_version");
            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              return;
            }
            setHistory((prev) => [
              ...prev,
              { type: "success", text: `✓ Текущая версия приложения: ${data}` },
            ]);
            break;
          }

          if (what === "ota") {
            const rawChannel = parts[2];
            const channel: OtaChannel = rawChannel === "beta" ? "beta" : "full";
            const { data, error } = await supabase.rpc("get_winchat_ota", {
              _admin_id: me.id,
              _channel: channel,
            });
            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              break;
            }
            const res = data as {
              ok: boolean;
              error?: string;
              channel?: string;
              url?: string | null;
              version?: string | null;
              target?: string;
              description?: string | null;
            };
            if (!res.ok) {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
              break;
            }
            if (!res.url) {
              setHistory((prev) => [
                ...prev,
                { type: "info", text: `OTA канала ${channel} не настроена. Используйте /set ota <ссылка> ${channel} <версия>` },
              ]);
              break;
            }
            setHistory((prev) => [
              ...prev,
              { type: "info", text: `OTA (${channel}) URL: ${res.url}` },
              { type: "info", text: `Версия: ${res.version ?? "не указана"} · Цель: ${res.target ?? "*"}` },
              ...(res.description ? [{ type: "info" as const, text: `Описание: ${res.description}` }] : []),
            ]);
            break;
          }

          if (what === "devices") {
            const { data, error } = await supabase.rpc("get_winchat_ota_devices", {
              _admin_id: me.id,
              _limit: 20,
            });
            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              break;
            }
            const res = data as {
              ok: boolean;
              error?: string;
              devices?: Array<{
                device_id: string;
                is_wintozo_web: boolean;
                status: string | null;
                platform: string | null;
                app_version: string | null;
                model: string | null;
                manufacturer: string | null;
                os_version: string | null;
                username: string | null;
                nickname?: string | null;
                joined_at?: string | null;
                days_in_winchat?: number | null;
                beta_accepted?: boolean;
              }>;
            };
            if (!res.ok) {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
              break;
            }
            const devices = res.devices ?? [];
            if (!devices.length) {
              setHistory((prev) => [
                ...prev,
                { type: "info", text: "Устройства пока не регистрировались" },
              ]);
              break;
            }
            setHistory((prev) => [
              ...prev,
              { type: "info", text: `═══ Устройства (${devices.length}) ═══` },
              ...devices.map((d) => ({
                type: "info" as const,
                text: `${d.nickname || (d.username ? `@${d.username}` : "—")} · ${[d.manufacturer, d.model].filter(Boolean).join(" ") || d.platform || "устройство"} · ${
                  d.status ?? (d.is_wintozo_web ? "is_wintozo_web_true" : "is_wintozo_web_no")
                } · v${d.app_version ?? "?"} · в WinChat ${d.days_in_winchat ?? "?"} дн.${d.beta_accepted ? " · бета" : ""} · ${d.device_id}`,
              })),
            ]);
            break;
          }

          if (what === "beta" && parts[2] === "requests") {
            const res = await adminListBetaRequests(me.id, "pending");
            if (!res.ok) {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error ?? "Ошибка"}` }]);
              break;
            }
            setBetaRequests(res.requests);
            if (!res.requests.length) {
              setHistory((prev) => [
                ...prev,
                { type: "info", text: "Новых заявок на бета-тест нет" },
              ]);
              break;
            }
            setHistory((prev) => [
              ...prev,
              { type: "info", text: `═══ Заявки на бета-тест (${res.requests.length}) ═══` },
              ...res.requests.map((r) => ({
                type: "info" as const,
                text: `${r.nickname || `@${r.username || "?"}`} · ${[r.manufacturer, r.model].filter(Boolean).join(" ") || r.platform || "устройство"} · ${r.app_version ? `v${r.app_version}` : "версия ?"} · в WinChat ${r.days_in_winchat ?? "?"} дн. · ${new Date(r.created_at).toLocaleString("ru-RU")} · id ${r.id}`,
              })),
              { type: "info", text: "Принять: /beta accept <id> · Отклонить: /beta reject <id> [причина]" },
            ]);
            break;
          }

          if (what === "badges") {
            const username = parts[2]?.replace("@", "");
            if (!username) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: "Использование: /get badges @username" },
              ]);
              break;
            }

            const { data, error } = await supabase.rpc("get_user_badges", {
              _target_username: username,
            });

            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              break;
            }

            const res = data as { ok: boolean; codes?: number[] };
            if (!res.ok) {
              setHistory((prev) => [...prev, { type: "error", text: "✗ Не удалось получить бейджи" }]);
              break;
            }
            const labels = (res.codes ?? []).map((c) => BADGE_LABELS[c]).filter(Boolean);
            setHistory((prev) => [
              ...prev,
              { type: "info", text: labels.length ? `Бейджи @${username}: ${labels.join(", ")}` : `У @${username} бейджей пока нет` },
            ]);
            break;
          }

          setHistory((prev) => [
            ...prev,
            { type: "error", text: "Использование: /get winpass @username | /get version | /get ota [beta|full] | /get devices | /get beta requests | /get badges @username" },
          ]);
          break;
        }

        case "/beta": {
          const action = parts[1];
          if (action !== "accept" && action !== "reject") {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Использование: /beta accept <id> | /beta reject <id> [причина]" },
            ]);
            break;
          }
          const requestId = parts[2];
          if (!requestId) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Укажите id заявки из /get beta requests" },
            ]);
            break;
          }
          const note = action === "reject" ? parts.slice(3).join(" ") || null : null;
          const res = await adminReviewBetaRequest(
            me.id,
            requestId,
            action === "accept",
            note
          );
          setHistory((prev) => [
            ...prev,
            { type: res.ok ? "success" : "error", text: `${res.ok ? "✓" : "✗"} ${res.message}` },
          ]);
          if (res.ok) {
            setBetaRequests((prev) => prev.filter((r) => r.id !== requestId));
          }
          break;
        }

        case "/clear": {
          setHistory([{ type: "info", text: "WinChat Admin Terminal v2.0" }]);
          break;
        }

        case "/give": {
          const feature = parts[1];
          if (feature === "badge") {
            const badgeUsername = parts[2]?.replace("@", "");
            const badgeCode = parseInt(parts[3] || "0", 10);
            const badgeLabel = BADGE_LABELS[badgeCode];
            if (!badgeUsername || !badgeLabel) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: "Использование: /give badge @username <1|2|3>" },
              ]);
              break;
            }
            const { data, error } = await supabase.rpc("give_badge", {
              _admin_id: me.id,
              _target_username: badgeUsername,
              _code: badgeCode,
            });
            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              break;
            }
            const badgeRes = data as { ok: boolean; message?: string; error?: string; code?: number };
            if (badgeRes.ok) {
              const badgeResCode = badgeRes.code ?? badgeCode;
              setHistory((prev) => [
                ...prev,
                { type: "success", text: `✓ Бейдж ${badgeResCode} (@${badgeUsername}) выдан — ${BADGE_LABELS[badgeResCode] ?? ""}` },
              ]);
              onProfileUpdated();
            } else {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${badgeRes.error}` }]);
            }
            break;
          }
          if (feature === "glass") {
            const glassUsername = parts[2]?.replace("@", "");
            if (!glassUsername) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: "Использование: /give glass @username" },
              ]);
              break;
            }

            const { data, error } = await supabase.rpc("give_glass", {
              _admin_id: me.id,
              _target_username: glassUsername,
            });

            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              break;
            }

            const res = data as { ok: boolean; message?: string; error?: string };
            if (res.ok) {
              setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
              onProfileUpdated();
            } else {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
            }
            break;
          }
          if (feature !== "wintozopro") {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Использование: /give wintozopro @username X" },
            ]);
            break;
          }
          const username = parts[2]?.replace("@", "");
          const days = parseInt(parts[3] || "0", 10);
          if (!username || !days || days < 1) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Использование: /give wintozopro @username X (X — число дней)" },
            ]);
            break;
          }

          const { data, error } = await supabase.rpc("give_winpro", {
            _admin_id: me.id,
            _target_username: username,
            _days: days,
          });

          if (error) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            break;
          }

          const res = data as { ok: boolean; message?: string; error?: string; expires?: string };
          if (res.ok) {
            setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
            onProfileUpdated();
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
          }
          break;
        }

        case "/del": {
          if (parts[1] === "legacy") {
            const username = parts[2]?.replace(/^@/, "").replace(/["']/g, "");
            if (!username) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: "Использование: /del legacy @username" },
              ]);
              break;
            }
            const { error } = await supabase
              .from("profiles")
              .update({ is_winchat_legacy: "is_winchat_legacy_false" })
              .eq("username", username);
            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            } else {
              setHistory((prev) => [
                ...prev,
                { type: "success", text: `✓ @${username}: включён новый интерфейс (legacy выключен)` },
              ]);
              onProfileUpdated();
            }
            break;
          }
          setHistory((prev) => [
            ...prev,
            { type: "error", text: "Использование: /del legacy @username" },
          ]);
          break;
        }

        case "/delete": {
          const feature = parts[1];
          if (feature === "glass") {
            const glassUsername = parts[2]?.replace("@", "");
            if (!glassUsername) {
              setHistory((prev) => [
                ...prev,
                { type: "error", text: "Использование: /delete glass @username" },
              ]);
              break;
            }

            const { data, error } = await supabase.rpc("delete_glass", {
              _admin_id: me.id,
              _target_username: glassUsername,
            });

            if (error) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
              break;
            }

            const res = data as { ok: boolean; message?: string; error?: string };
            if (res.ok) {
              setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
              onProfileUpdated();
            } else {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
            }
            break;
          }
          if (feature !== "wintozopro") {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Использование: /delete wintozopro @username" },
            ]);
            break;
          }
          const username = parts[2]?.replace("@", "");
          if (!username) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Использование: /delete wintozopro @username" },
            ]);
            break;
          }

          const { data, error } = await supabase.rpc("delete_winpro", {
            _admin_id: me.id,
            _target_username: username,
          });

          if (error) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${error.message}` }]);
            break;
          }

          const res = data as { ok: boolean; message?: string; error?: string };
          if (res.ok) {
            setHistory((prev) => [...prev, { type: "success", text: `✓ ${res.message}` }]);
            onProfileUpdated();
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${res.error}` }]);
          }
          break;
        }

        case "/channel": {
          const action = parts[1];
          const allowed = ["list", "verify", "unverify", "official", "unofficial", "delete"];
          if (!action || !allowed.includes(action)) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Использование: /channel list | verify | unverify | official | unofficial | delete <id|название>" },
            ]);
            break;
          }

          const { data: listData, error: listErr } = await supabase.rpc("list_winchat_channels", {
            _user_id: me.id,
          });
          if (listErr) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${listErr.message}` }]);
            break;
          }
          const listRes = listData as {
            ok: boolean;
            error?: string;
            channels?: Array<{
              id: string;
              title: string | null;
              verified: boolean;
              is_official: boolean;
              subscribers: number;
            }>;
          };
          if (!listRes.ok) {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${listRes.error}` }]);
            break;
          }
          const channels = listRes.channels || [];

          if (action === "list") {
            if (!channels.length) {
              setHistory((prev) => [...prev, { type: "info", text: "Каналов пока нет" }]);
              break;
            }
            setHistory((prev) => [
              ...prev,
              { type: "info", text: `═══ Каналы (${channels.length}) ═══` },
              ...channels.map((c) => ({
                type: "info" as const,
                text: `${c.is_official ? "★ " : ""}${c.title || "Без названия"} — ${c.id} · ${c.subscribers} подписчиков${c.verified ? " · ✓ синяя" : ""}`,
              })),
            ]);
            break;
          }

          const target = parts.slice(2).join(" ");
          if (!target) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: "Укажите id или название канала" },
            ]);
            break;
          }

          const found = channels.find(
            (c) => c.id === target || (c.title || "").toLowerCase() === target
          );
          if (!found) {
            setHistory((prev) => [
              ...prev,
              { type: "error", text: `Канал не найден: ${target}. Используйте /channel list` },
            ]);
            break;
          }

          if (action === "delete") {
            const { data: delData, error: delErr } = await supabase.rpc("delete_winchat_ch", {
              _user_id: me.id,
              _chat_id: found.id,
            });
            if (delErr) {
              setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${delErr.message}` }]);
              break;
            }
            const delRes = delData as { ok: boolean; error?: string };
            if (delRes.ok) {
              setHistory((prev) => [
                ...prev,
                { type: "success", text: `✓ Канал «${found.title}» удалён` },
              ]);
              onProfileUpdated();
            } else {
              setHistory((prev) => [...prev, { type: "error", text: `✗ ${delRes.error}` }]);
            }
            break;
          }

          const verifyArg = action === "verify" ? true : action === "unverify" ? false : null;
          const officialArg =
            action === "official" ? true : action === "unofficial" ? false : null;

          const { data: editData, error: editErr } = await supabase.rpc("edit_wintozo_channel", {
            _user_id: me.id,
            _chat_id: found.id,
            _title: null,
            _description: null,
            _avatar_url: null,
            _verified: verifyArg,
            _is_official: officialArg,
          });
          if (editErr) {
            setHistory((prev) => [...prev, { type: "error", text: `Ошибка: ${editErr.message}` }]);
            break;
          }
          const editRes = editData as { ok: boolean; error?: string };
          if (editRes.ok) {
            const labels: Record<string, string> = {
              verify: "выдана синяя галочка",
              unverify: "галочка снята",
              official: "канал стал официальным",
              unofficial: "статус официального снят",
            };
            setHistory((prev) => [
              ...prev,
              { type: "success", text: `✓ «${found.title}»: ${labels[action]}` },
            ]);
            onProfileUpdated();
          } else {
            setHistory((prev) => [...prev, { type: "error", text: `✗ ${editRes.error}` }]);
          }
          break;
        }

        default:
          setHistory((prev) => [
            ...prev,
            { type: "error", text: `Неизвестная команда: ${cmd}. Введите /help для списка` },
          ]);
      }
    } catch (err) {
      setHistory((prev) => [
        ...prev,
        { type: "error", text: `Непредвиденная ошибка: ${(err as Error).message}` },
      ]);
    }
  }

  if (!open) return null;

  /* ---------- Окно выбора устройства для OTA-обновления ---------- */
  if (otaPicker) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#0d1117] text-white shadow-2xl ring-1 ring-white/10">
          <div className="flex items-center justify-between border-b border-white/10 bg-[#161b22] px-4 py-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-green-400" />
              <span className="font-mono text-sm font-bold">Выбор устройства</span>
            </div>
            <button
              onClick={() => setOtaPicker(null)}
              className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px]">
            <p className="mb-3 text-white/60">
              Цель: <span className="text-green-400">{otaPicker.target}</span>
              {otaPicker.version ? <span className="text-white/40"> · Версия: {otaPicker.version}</span> : null}
            </p>
            {otaPickerDevices.length === 0 ? (
              <p className="text-white/60">Устройства не найдены для этой цели</p>
            ) : (
              otaPickerDevices.map((d, i) => (
                <button
                  key={d.device_id}
                  onClick={() =>
                    void selectOtaDevice(
                      d.device_id,
                      otaPicker.url,
                      otaPicker.version,
                      otaPicker.description,
                      otaPicker.channel
                    )
                  }
                  disabled={otaPickerBusy}
                  className="mb-2 block w-full rounded-xl bg-white/5 px-3 py-2 text-left transition hover:bg-white/10 disabled:opacity-50"
                >
                  <span className="font-bold text-green-400">{i + 1}.</span>{" "}
                  {d.username ? `@${d.username}` : "—"}
                  {" · "}
                  {[d.manufacturer, d.model].filter(Boolean).join(" ") || d.platform || "устройство"}
                  {" · "}
                  {d.status ?? (d.is_wintozo_web ? "is_wintozo_web_true" : "is_wintozo_web_no")}
                  {" · v"}
                  {d.app_version ?? "?"}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-white/10 bg-[#0d1117] px-4 py-3">
            <button
              onClick={() => setOtaPicker(null)}
              className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-xs font-bold transition hover:bg-white/20"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[#0d1117] text-white shadow-2xl ring-1 ring-white/10">
        {/* Заголовок */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#161b22] px-4 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-green-400" />
            <span className="font-mono text-sm font-bold">Admin Terminal</span>
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 font-mono text-[10px] text-green-400">
              @{me.username}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setGuiMode((g) => !g)}
              className={`rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold transition ${
                guiMode ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
              title={guiMode ? "Скрыть графические команды (/gui)" : "Показать графические команды (/gui)"}
            >
              GUI
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {guiMode && (
          <AdminTerminalGui
            onRun={runCommand}
            betaRequestIds={betaRequests.map((r) => r.id)}
          />
        )}

        {/* Лента */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
          {history.map((entry, i) => (
            <div key={i} className="mb-1">
              {entry.type === "input" && (
                <span className="text-white/90">
                  <span className="text-green-400">$ </span>
                  {entry.text}
                </span>
              )}
              {entry.type === "success" && <span className="text-green-400">{entry.text}</span>}
              {entry.type === "error" && <span className="text-red-400">{entry.text}</span>}
              {entry.type === "info" && <span className="text-blue-300">{entry.text}</span>}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Ввод */}
        <div className="border-t border-white/10 bg-[#0d1117] px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runCommand(input);
            }}
            className="flex items-center gap-2"
          >
            <span className="font-mono text-sm text-green-400">$</span>
            <input
              id="admin-term-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Введите команду..."
              className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/30"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-xs font-bold transition hover:bg-white/20"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
