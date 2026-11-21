import { useEffect, useState } from "react";
import { Snowflake, Sparkles, X } from "lucide-react";
import {
  APP_VERSION,
  isVersionNewer,
  shouldShowUpdateBanner,
  dismissUpdateBanner,
  getChangelog,
  shouldShowWhatsNew,
  markWhatsNewSeen,
} from "../lib/checkVersion";
import { canInstallOta, initDeviceOta } from "../lib/ota";
import "./happy-year.css";

/**
 * Проверка версии при запуске:
 *  - отправляет статус устройства на сервер и узнаёт версию сервера;
 *  - веб-пользователям показывает баннер «Доступна версия X»;
 *  - на нативном Android баннера нет: обновление (OTA) ставится
 *    вручную — Настройки → «О приложении» → «Проверить обновления».
 */
export default function CheckVersion() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  /* Статус устройства + check_version при запуске */
  useEffect(() => {
    let cancelled = false;

    initDeviceOta()
      .then((res) => {
        if (cancelled) return;
        setLatestVersion(res.latestVersion);
        setLoading(false);

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

  const newer = latestVersion && isVersionNewer(latestVersion, APP_VERSION);
  const showVersionBanner = Boolean(newer) && !canInstallOta();

  function dismissUpdate() {
    setDismissed(true);
    if (latestVersion) dismissUpdateBanner(latestVersion);
  }

  function closeWhatsNew() {
    setShowWhatsNew(false);
    markWhatsNewSeen();
  }

  if (loading) return null;
  if (dismissed) return null;

  return (
    <>
      {/* Баннер обновления версии (веб; на Android обновление — в настройках) */}
      {showVersionBanner && (
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
            style={{ fontFamily: '"Manrope","Segoe UI",ui-sans-serif,system-ui,sans-serif' }}
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
