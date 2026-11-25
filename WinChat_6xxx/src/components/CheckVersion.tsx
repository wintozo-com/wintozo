import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  APP_VERSION,
  DOWNLOAD_URL,
  isVersionNewer,
  isVersion7,
  shouldShowUpdateBanner,
  dismissUpdateBanner,
  getChangelog,
  shouldShowWhatsNew,
  markWhatsNewSeen,
} from "../lib/checkVersion";
import {
  OTA7_SHOW_EVENT,
  canInstallOta,
  initDeviceOta,
  type OtaInfo,
} from "../lib/ota";
import OtaUpdate7Overlay from "./OtaUpdate7Overlay";

const OTA7_DISMISS_KEY = "winchat_ota7_dismissed";

interface Ota7Prompt {
  version: string;
  ota: OtaInfo | null;
  url: string;
}

function ota7Key(version: string, ota: OtaInfo | null): string {
  return `${version}|${ota?.updatedAt ?? ""}`;
}

function isOta7Dismissed(key: string): boolean {
  try {
    return localStorage.getItem(OTA7_DISMISS_KEY) === key;
  } catch {
    return false;
  }
}

function dismissOta7(key: string): void {
  try {
    localStorage.setItem(OTA7_DISMISS_KEY, key);
  } catch {
    /* no-op */
  }
}

/**
 * Проверка версии при запуске:
 *  - отправляет статус устройства на сервер и узнаёт версию сервера;
 *  - для OTA-записей 7.x показывает полноэкранный новогодний экран
 *    обновления с описанием из `--note` и прогрессом установки;
 *  - для остальных версий — прежний компактный баннер;
 *  - после входа показывает «Что нового» для текущей версии.
 */
export default function CheckVersion() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ota7, setOta7] = useState<Ota7Prompt | null>(null);

  /* Статус устройства + check_version + поиск OTA при запуске */
  useEffect(() => {
    let cancelled = false;

    initDeviceOta()
      .then((res) => {
        if (cancelled) return;
        setLatestVersion(res.latestVersion);
        setLoading(false);

        /* Новогодний экран для любой версии, начинающейся с 7. */
        const version7 =
          res.ota?.version ?? (isVersion7(res.latestVersion) ? res.latestVersion : null);
        if (version7) {
          const key = ota7Key(version7, res.ota);
          if (!isOta7Dismissed(key)) {
            setOta7({
              version: version7,
              ota: res.ota,
              url: res.ota?.url ?? DOWNLOAD_URL,
            });
            return;
          }
        }

        /* Баннер обновления по версии (только для веба — без нативного OTA) */
        if (res.latestVersion && shouldShowUpdateBanner(res.latestVersion)) {
          return;
        }

        /* Баннер "Что нового" после входа */
        if (shouldShowWhatsNew()) {
          setShowWhatsNew(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* Кнопка «Проверить обновления» в настройках тоже открывает этот экран. */
  useEffect(() => {
    const handler = (event: Event) => {
      const ota = (event as CustomEvent<OtaInfo>).detail;
      const version = ota?.version;
      if (!version || !isVersion7(version)) return;
      const key = ota7Key(version, ota);
      if (isOta7Dismissed(key)) return;
      setOta7({ version, ota, url: ota.url });
    };
    window.addEventListener(OTA7_SHOW_EVENT, handler);
    return () => window.removeEventListener(OTA7_SHOW_EVENT, handler);
  }, []);

  const newer = latestVersion && isVersionNewer(latestVersion, APP_VERSION);
  const showVersionBanner = Boolean(newer) && !canInstallOta() && !ota7;

  function dismissUpdate() {
    setDismissed(true);
    if (latestVersion) dismissUpdateBanner(latestVersion);
  }

  function closeOta7() {
    if (ota7) dismissOta7(ota7Key(ota7.version, ota7.ota));
    setOta7(null);
  }

  function closeWhatsNew() {
    setShowWhatsNew(false);
    markWhatsNewSeen();
  }

  if (loading) return null;

  return (
    <>
      {/* Баннер обновления версии (веб; на Android обновление — в настройках) */}
      {showVersionBanner && !dismissed && (
        <div className="fixed inset-x-0 top-0 z-[200] animate-fade-in">
          <div className="mx-auto my-2 max-w-md rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 p-3 px-4 shadow-lg">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 shrink-0 text-amber-900" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold text-amber-900">
                  {`Доступна версия ${latestVersion}`}
                </p>
                <p className="text-[11px] font-medium text-amber-800/75">
                  {`Текущая: ${APP_VERSION} — обновите для новых функций`}
                </p>
              </div>
              <button
                type="button"
                onClick={dismissUpdate}
                className="rounded-full p-1 text-amber-900/60 transition hover:bg-amber-900/15 hover:text-amber-900"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Новогодний OTA-экран WinChat 7.x */}
      {ota7 && (
        <OtaUpdate7Overlay
          ota={ota7.ota}
          version={ota7.version}
          url={ota7.url}
          onClose={closeOta7}
        />
      )}

      {/* Модальное окно "Что нового" */}
      {showWhatsNew && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <button
            onClick={closeWhatsNew}
            className="absolute inset-0"
            aria-label="Закрыть"
          />
          <div className="animate-scale-in relative w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={closeWhatsNew}
              className="absolute top-4 right-4 rounded-full p-2 text-black/45 transition hover:bg-black/5 hover:text-ink"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-extrabold tracking-tight">Что нового</h3>
            </div>

            <p className="mt-3 font-mono text-[11px] font-bold text-accent">
              v{APP_VERSION}
            </p>

            {(() => {
              const entry = getChangelog(APP_VERSION);
              if (!entry) return null;
              return (
                <>
                  <p className="mt-3 text-sm font-medium text-black/60">{entry.title}</p>
                  <ul className="mt-3 space-y-2">
                    {entry.items.map((item: string) => (
                      <li key={item} className="flex items-start gap-2 text-sm font-semibold text-ink">
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
