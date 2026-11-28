import { useState, type ComponentType } from "react";
import {
  BadgeCheck,
  Ban,
  Crown,
  Gem,
  RefreshCw,
  Settings2,
  Shield,
  Smartphone,
  UserCheck,
  UserX,
  Wrench,
  X,
  Zap,
} from "lucide-react";

type Field = {
  key: string;
  label: string;
  placeholder?: string;
  optional?: boolean;
  type?: "text" | "number";
};

type GuiAction = {
  id: string;
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  fields: Field[];
  build: (v: Record<string, string>) => string;
};

/** Новый GUI поверх классического (legacy) терминала — команды те же самые. */
const GUI_ACTIONS: GuiAction[] = [
  {
    id: "ban",
    label: "Бан",
    desc: "Заблокировать пользователя",
    icon: Ban,
    fields: [
      { key: "user", label: "Юзернейм", placeholder: "@username" },
      { key: "reason", label: "Причина", placeholder: "Нарушение правил" },
    ],
    build: (v) => {
      const u = v.user.replace(/^@/, "").trim();
      const reason = (v.reason || "Без указания причины").trim();
      return `/ban ${u} ${reason}`;
    },
  },
  {
    id: "unban",
    label: "Разбан",
    desc: "Снять блокировку",
    icon: UserCheck,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/unban ${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "status",
    label: "Статус",
    desc: "Информация о пользователе",
    icon: Shield,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/status ${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "verify",
    label: "Галочка",
    desc: "grey / green / true",
    icon: BadgeCheck,
    fields: [
      { key: "user", label: "Юзернейм", placeholder: "@username" },
      { key: "level", label: "Уровень", placeholder: "grey | green | true" },
    ],
    build: (v) => `/addverify ${v.user.replace(/^@/, "").trim()} ${(v.level || "true").trim()}`,
  },
  {
    id: "disverify",
    label: "Снять галочку",
    desc: "Убрать верификацию",
    icon: UserX,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/disverify ${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "legacy_on",
    label: "Legacy: вкл",
    desc: "Старый интерфейс",
    icon: Settings2,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/set legacy @${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "legacy_off",
    label: "Legacy: выкл",
    desc: "Новый интерфейс",
    icon: RefreshCw,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/del legacy @${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "pro_on",
    label: "Выдать WinPro",
    desc: "Подписка на N дней",
    icon: Crown,
    fields: [
      { key: "user", label: "Юзернейм", placeholder: "@username" },
      { key: "days", label: "Дней", placeholder: "30", type: "number" },
    ],
    build: (v) => `/give wintozopro @${v.user.replace(/^@/, "").trim()} ${(v.days || "30").trim()}`,
  },
  {
    id: "pro_off",
    label: "Снять WinPro",
    desc: "Удалить подписку",
    icon: Crown,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/delete wintozopro @${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "glass_on",
    label: "Выдать Glass",
    desc: "Доступ к WinChat Glass",
    icon: Gem,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/give glass @${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "glass_off",
    label: "Снять Glass",
    desc: "Убрать доступ",
    icon: Gem,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/delete glass @${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "oobe",
    label: "Назначить OOBE",
    desc: "Версия 5.0 / 6.0",
    icon: Smartphone,
    fields: [
      { key: "user", label: "Юзернейм", placeholder: "@username" },
      { key: "ver", label: "Версия", placeholder: "5.0" },
    ],
    build: (v) => `/set oobe @${v.user.replace(/^@/, "").trim()} "${(v.ver || "6.0").trim()}"`,
  },
  {
    id: "oobe_off",
    label: "OOBE: сброс",
    desc: "Обычная логика",
    icon: Smartphone,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/set oobe @${v.user.replace(/^@/, "").trim()} off`,
  },
  {
    id: "winpass",
    label: "WinPass",
    desc: "Код восстановления",
    icon: Wrench,
    fields: [{ key: "user", label: "Юзернейм", placeholder: "@username" }],
    build: (v) => `/get winpass @${v.user.replace(/^@/, "").trim()}`,
  },
  {
    id: "devices",
    label: "Устройства",
    desc: "Список устройств",
    icon: Smartphone,
    fields: [],
    build: () => "/get devices",
  },
  {
    id: "beta_requests",
    label: "Заявки на бету",
    desc: "Входящие заявки (in-app бот)",
    icon: Shield,
    fields: [],
    build: () => "/get beta requests",
  },
  {
    id: "beta_accept",
    label: "Принять в бету",
    desc: "Одобрить заявку по id",
    icon: UserCheck,
    fields: [{ key: "id", label: "ID заявки", placeholder: "uuid из списка" }],
    build: (v) => `/beta accept ${v.id.trim()}`,
  },
  {
    id: "beta_reject",
    label: "Отклонить бету",
    desc: "Отклонить заявку по id",
    icon: UserX,
    fields: [
      { key: "id", label: "ID заявки", placeholder: "uuid из списка" },
      { key: "reason", label: "Причина", placeholder: "Не подходит", optional: true },
    ],
    build: (v) => `/beta reject ${v.id.trim()} ${v.reason.trim()}`.trim(),
  },
  {
    id: "ota_beta",
    label: "OTA: beta",
    desc: "Обновление для тестеров",
    icon: Zap,
    fields: [
      { key: "url", label: "Ссылка на APK", placeholder: "https://update.com/winchat.apk" },
      { key: "version", label: "Версия", placeholder: "7.0.1" },
    ],
    build: (v) => `/set ota ${v.url.trim()} beta ${v.version.trim()}`,
  },
  {
    id: "ota_full",
    label: "OTA: full",
    desc: "Обновление для всех",
    icon: Zap,
    fields: [
      { key: "url", label: "Ссылка на APK", placeholder: "https://update.com/winchat.apk" },
      { key: "version", label: "Версия", placeholder: "7.0.1" },
    ],
    build: (v) => `/set ota ${v.url.trim()} full ${v.version.trim()}`,
  },
];

export default function AdminTerminalGui({
  onRun,
  betaRequestIds = [],
}: {
  onRun: (command: string) => void;
  betaRequestIds?: string[];
}) {
  const [active, setActive] = useState<GuiAction | null>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});

  const field = active?.fields[step];

  function requestId(value: string): string {
    const v = value.trim();
    if (v) return v;
    return betaRequestIds[0] ?? "";
  }

  function start(action: GuiAction) {
    if (action.fields.length === 0) {
      onRun(action.build({}));
      return;
    }
    setActive(action);
    setStep(0);
    setValues({});
  }

  function next() {
    if (!active || !field) return;
    const rawValue = (values[field.key] || "").trim();
    const value =
      (active?.id === "beta_accept" || active?.id === "beta_reject") &&
      field.key === "id"
        ? requestId(rawValue)
        : rawValue;
    if (!field.optional && !value) return;
    const nextValues = { ...values, [field.key]: value };
    if (step < active.fields.length - 1) {
      setValues(nextValues);
      setStep(step + 1);
      return;
    }
    const command = active.build(nextValues);
    setActive(null);
    setStep(0);
    setValues({});
    onRun(command);
  }

  return (
    <>
      <div className="shrink-0 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2 text-[12px] font-bold">
          <Zap className="h-3.5 w-3.5 text-green-400" />
          Панель команд
          <span className="font-mono text-[10px] font-medium text-white/35">→ шаги → выполнение</span>
        </div>
        <div className="grid max-h-[150px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {GUI_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => start(action)}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.09] active:scale-[0.98]"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-green-400" />
                  <span className="text-[12px] font-bold">{action.label}</span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-white/45">{action.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {active && field && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1117] p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-green-400">
                  Шаг {step + 1} из {active.fields.length}
                </p>
                <h3 className="mt-1 text-[17px] font-extrabold">{active.label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Отмена"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-white/65">{field.label}</span>
              <input
                autoFocus
                type={field.type ?? "text"}
                value={values[field.key] || ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") next();
                }}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-green-400/60"
              />
            </label>
            <div className="mt-4 flex gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10"
                >
                  Назад
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="flex-1 rounded-xl bg-green-500 px-3 py-2 text-xs font-extrabold text-[#08140c] hover:bg-green-400"
              >
                {step === active.fields.length - 1 ? "Выполнить" : "Далее"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
