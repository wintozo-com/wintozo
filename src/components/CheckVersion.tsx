import { useEffect, useState } from "react";
import { Snowflake, Sparkles, X } from "lucide-react";
import {
  APP_VERSION,
  DOWNLOAD_URL,
  dismissOta7,
  isOta7Dismissed,
  isUpdate7DemoActive,
  isVersionNewer,
  shouldShowUpdateBanner,
  dismissUpdateBanner,
  getChangelog,
  shouldShowWhatsNew,
  markWhatsNewSeen,
} from "../lib/checkVersion";
import {
  OTA7_SHOW_EVENT,
  canInstallOta,
  getDemoOta7,
  initDeviceOta,
  type OtaInfo,
} from "../lib/ota";
import OtaUpdate7Overlay from "./OtaUpdate7Overlay";
import "./happy-year.css";

interface Ota7Prompt {
  version: string;
  ota: OtaInfo | null;
  url: string;
}

function ota7Key(version: string, ota: OtaInfo | null): string {
  // Идентификатор записи OTA, а не только версия: после установки версия
  // в APK меняется, и старый ключ больше не совпадал — экран открывался
  // заново. Для веб-баннера без OTA используем версию.
  return ota ? `${ota.url}|${ota.updatedAt ?? ""}` : `version:${version}`;
}

function legacyOta7Key(version: string, ota: OtaInfo | null): string {
  return `${version}|${ota?.updatedAt ?? ""}`;
}

function isOta7PromptDismissed(version: string, ota: OtaInfo | null): boolean {
  return (
    isOta7Dismissed(ota7Key(version, ota)) ||
    isOta7Dismissed(legacyOta7Key(version, ota))
  );
}

function dismissOta7Prompt(version: string, ota: OtaInfo | null): void {
  dismissOta7(ota7Key(version, ota));
  dismissOta7(legacyOta7Key(version, ota));
}

/**
 * Проверка версии при запуске:
 *  - отправляет статус устройства на сервер и узнаёт версию сервера;
 *  - для OTA-записей 7.x показывает полноэкранный новогодний экран
 *    обновления с описанием из `--note` и прогрессом установки;
 *  - веб-пользователям показывает баннер «Доступна версия X»;
 *  - на нативном Android баннера нет: обновление (OTA) ставится
 *    вручную — Настройки → «О приложении» → «Проверить обновления».
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

        /* Демо /update_7_active: показываем экран даже если приложение
           ещё не вошло в аккаунт и OTA-запрос реально не выполнялся. */
        if (isUpdate7DemoActive()) {
          const demo = getDemoOta7();
          setOta7({
            version: demo.version ?? "7.0.0",
            ota: demo,
            url: demo.url,
          });
          return;
        }

        /* Экран установки — только для реальной записи OTA. Одна версия
           сервера не должна открывать его заново после обновления. */
        if (res.ota) {
          const version7 = res.ota.version ?? APP_VERSION;
          if (!isOta7PromptDismissed(version7, res.ota)) {
            setOta7({ version: version7, ota: res.ota, url: res.ota.url });
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

  /* Кнопка «Проверить обновления» в настройках и демо-роут тоже открывают экран.
     Это явное действие пользователя: Previously dismissed OTA и версия без
     номера не должны «выкидывать» его обратно в настройки. */
  useEffect(() => {
    const handler = (event: Event) => {
      const ota = (event as CustomEvent<OtaInfo>).detail;
      const version = ota?.version ?? APP_VERSION;
      setOta7({ version, ota, url: ota?.url ?? DOWNLOAD_URL });
    };
    window.addEventListener(OTA7_SHOW_EVENT, handler);
    return () => window.removeEventListener(OTA7_SHOW_EVENT, handler);
  }, []);

  const currentVersion = APP_VERSION;
  const newer = latestVersion && isVersionNewer(latestVersion, currentVersion);
  const showVersionBanner = Boolean(newer) && !canInstallOta() && !ota7;

  function dismissUpdate() {
    setDismissed(true);
    if (latestVersion) dismissUpdateBanner(latestVersion);
  }

  function closeOta7() {
    // Демо не портит ключ просмотра реальной OTA и остаётся доступным
    // через кнопку «Проверить обновления» до перезагрузки страницы.
    if (!isUpdate7DemoActive() && ota7) {
      dismissOta7Prompt(ota7.version, ota7.ota);
    }
    setOta7(null);
  }

  function closeWhatsNew() {
    setShowWhatsNew(false);
    markWhatsNewSeen();
  }

  // Демо-экран должен показываться сразу, не дожидаясь initDeviceOta.
  if (loading && !ota7) return null;

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
                  {`Текущая: ${currentVersion} — обновите для новых функций`}
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

      {/* Новогодний экран OTA WinChat 7.x */}
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
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <button
            onClick={closeWhatsNew}
            className="absolute inset-0"
            aria-label="Закрыть"
          />
          <div
            className="animate-scale-in relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-[#d9c28a]/45 bg-[linear-gradient(180deg,#fffdf8_0%,#fff7ec_100%)] p-6 shadow-[0_40px_90px_-40px_rgba(80,50,10,.55)] sm:p-8"
            style={{ fontFamily: '"WinChat Zusker","Manrope","Segoe UI",ui-sans-serif,system-ui,sans-serif' }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(217,154,23,.16),transparent_70%)]" />
            <button
              type="button"
              onClick={closeWhatsNew}
              className="absolute top-4 right-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-[#d9c28a]/35 bg-white/80 text-[#5f6b63] transition hover:bg-white hover:text-[#c62828]"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#2e7d32]/20 bg-white/80 px-3 py-1.5 text-[11px] font-extrabold tracking-[.14em] text-[#2e7d32] uppercase">
                <Snowflake className="h-3.5 w-3.5" />
                WinChat 7.0
              </div>
              <div className="mt-4 flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,.85)_0_10%,transparent_34%),linear-gradient(145deg,#c62828,#8e1b1b)] text-white shadow-[inset_-4px_-6px_10px_rgba(0,0,0,.18),0_10px_20px_-10px_rgba(198,40,40,.55)]">
                  <Sparkles className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-2xl font-extrabold tracking-tight text-[#1d2a24] sm:text-3xl">
                    Что нового в 2026
                  </h3>
                  <p className="mt-1 text-sm font-medium text-[#5f6b63]">
                    История WinChat: от Wintozo до 7.0
                  </p>
                </div>
              </div>

              <div className="mt-6 max-h-[min(62vh,560px)] space-y-4 overflow-y-auto pr-1">
                {(() => {
                  const entry = getChangelog(APP_VERSION);
                  if (!entry) return null;
                  return entry.items.map((item) => {
                    const [heading, ...rest] = item.split("\n");
                    return (
                      <article
                        key={item}
                        className="rounded-[22px] border border-[#d9c28a]/28 bg-white/78 p-4 shadow-[0_14px_30px_-28px_rgba(80,50,10,.45)]"
                      >
                        <h4 className="text-[15px] font-extrabold leading-snug text-[#1d2a24]">
                          {heading}
                        </h4>
                        {rest.length > 0 && (
                          <p className="mt-2 text-sm leading-relaxed font-medium text-[#5f6b63]">
                            {rest.join(" ")}
                          </p>
                        )}
                      </article>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
