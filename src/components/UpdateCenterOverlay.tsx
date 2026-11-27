import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Download,
  Loader2,
  MoreVertical,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TreePine,
  X,
} from "lucide-react";
import {
  getBetaInfo,
  refreshBetaStatus,
  requestBetaAccess,
  subscribeBeta,
  type BetaInfo,
} from "../lib/beta";
import { APP_VERSION } from "../lib/checkVersion";
import {
  getDeviceInfo,
  installOta,
  markOtaSeen,
  onOtaStatus,
  reportDeviceStatus,
  requestOta7Overlay,
  searchOta,
  type OtaInfo,
  type OtaStatusEvent,
} from "../lib/ota";
import "./update-center.css";

interface Props {
  onClose: () => void;
  ota?: OtaInfo | null;
  /** Рисовать внутри карточки настроек, а не поверх всего приложения. */
  embedded?: boolean;
}

type Screen = "update" | "beta";

const BETA_LABELS: Record<BetaInfo["status"], string> = {
  none: "Вы не участвуете в бета-программе",
  pending: "Заявка отправлена — ожидайте решения администратора",
  accepted: "Вы приняты в бета-программу",
  rejected: "Заявка отклонена — попробуйте позже",
};

/** Декоративный слой снега: только CSS, без картинок и эмодзи. */
function Snow() {
  return <div className="uc-snow" aria-hidden />;
}

/** Ёлочки и звёзды — SVG-иконки. */
function Forest() {
  return (
    <div className="uc-forest" aria-hidden>
      <Sparkles className="uc-star uc-star-left" />
      <TreePine className="uc-tree uc-tree-small" />
      <TreePine className="uc-tree uc-tree-big" />
      <TreePine className="uc-tree uc-tree-small" />
      <Sparkles className="uc-star uc-star-right" />
    </div>
  );
}

export default function UpdateCenterOverlay({ onClose, ota, embedded = false }: Props) {
  const [screen, setScreen] = useState<Screen>("update");
  const [menuOpen, setMenuOpen] = useState(false);
  const [beta, setBeta] = useState<BetaInfo>(() => getBetaInfo());
  const [checking, setChecking] = useState(false);
  const [betaBusy, setBetaBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [found, setFound] = useState<OtaInfo | null>(ota ?? null);

  /* Бета-обновления проверяются отдельно от основного канала. */
  const [betaChecking, setBetaChecking] = useState(false);
  const [betaFound, setBetaFound] = useState<OtaInfo | null>(null);
  const [betaNotFound, setBetaNotFound] = useState(false);
  const [betaNotice, setBetaNotice] = useState<string | null>(null);
  const [betaInstalling, setBetaInstalling] = useState(false);
  const [betaProgress, setBetaProgress] = useState<number | null>(null);
  const [betaInstallNote, setBetaInstallNote] = useState<string | null>(null);

  useEffect(() => {
    const off = subscribeBeta(setBeta);
    void refreshBetaStatus();
    return off;
  }, []);

  useEffect(() => {
    if (ota) setFound(ota);
  }, [ota]);

  /* Прогресс загрузки бета-APK приходит от нативного плагина. */
  useEffect(() => {
    let alive = true;
    let dispose: (() => void) | undefined;
    void onOtaStatus((event: OtaStatusEvent) => {
      if (!alive) return;
      if (event.state === "downloading") {
        setBetaProgress(typeof event.progress === "number" ? event.progress : null);
        setBetaInstallNote(null);
      } else if (event.state === "permission") {
        setBetaInstallNote("Разрешите установку из этого источника и вернитесь в приложение");
      } else if (event.state === "installing") {
        setBetaInstallNote("Открываем системный установщик…");
      } else if (event.state === "error") {
        setBetaInstalling(false);
        setBetaInstallNote(event.message ?? "Не удалось установить обновление");
      }
    }).then((fn) => {
      dispose = fn;
    });
    return () => {
      alive = false;
      dispose?.();
    };
  }, []);

  async function checkForUpdates() {
    if (checking) return;
    setChecking(true);
    setNotice(null);
    try {
      // Основная проверка всегда смотрит обычный канал, а не бету.
      const device = await getDeviceInfo();
      const result = await searchOta(device.deviceId, "full");
      if (result) {
        setFound(result);
        onClose();
        requestOta7Overlay(result);
      } else {
        setNotice("Обновлений пока нет — у вас актуальная версия");
      }
    } catch {
      setNotice("Не удалось проверить обновления. Проверьте соединение.");
    } finally {
      setChecking(false);
    }
  }

  async function activateBeta() {
    if (betaBusy || beta.status === "accepted" || beta.status === "pending") return;
    setBetaBusy(true);
    setNotice(null);
    const res = await requestBetaAccess(found?.version ?? APP_VERSION);
    setBetaBusy(false);
    setNotice(res.message);
  }

  /** Проверка бета-канала доступна только принятым тестерам. */
  async function checkBetaUpdates() {
    if (betaChecking || betaInstalling || beta.status !== "accepted") return;
    setBetaChecking(true);
    setBetaFound(null);
    setBetaNotFound(false);
    setBetaNotice(null);
    setBetaInstallNote(null);
    setBetaProgress(null);
    try {
      // Привязываем устройство к аккаунту: доступ к бете проверяется
      // сервером по user_id из winchat_devices.
      const device = await reportDeviceStatus(true);
      const result = await searchOta(device.deviceId, "beta");
      if (result) {
        setBetaFound(result);
      } else {
        setBetaNotFound(true);
      }
    } catch {
      setBetaNotice("Не удалось проверить бета-обновления. Проверьте соединение.");
    } finally {
      setBetaChecking(false);
    }
  }

  /** Установка найденного бета-APK с показом прогресса. */
  async function installBetaUpdate() {
    if (!betaFound || betaInstalling) return;
    setBetaInstalling(true);
    setBetaProgress(0);
    setBetaInstallNote(null);
    markOtaSeen(betaFound);
    try {
      const res = await installOta(betaFound.url, betaFound.version);
      if (res.fallback) {
        setBetaInstalling(false);
        setBetaInstallNote("Ссылка открыта в браузере — завершите установку вручную");
      }
    } catch {
      setBetaInstalling(false);
      setBetaInstallNote("Не удалось скачать обновление. Попробуйте ещё раз.");
    }
  }

  return (
    <div
      className={embedded ? "uc-root uc-root--embedded" : "uc-root"}
      role="dialog"
      aria-modal="true"
      aria-label="Обновление WinChat"
    >
      <button className="uc-backdrop" onClick={onClose} aria-label="Закрыть" />

      <div className="uc-stage">
        <Snow />

        {/* Три точки сверху */}
        <div className="uc-topbar">
          <button
            className="uc-menu-trigger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Дополнительные действия"
          >
            <MoreVertical />
          </button>
          {menuOpen && (
            <div className="uc-menu">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setScreen("beta");
                  setNotice(null);
                }}
              >
                <ShieldCheck size={16} /> Бета-тест
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onClose();
                }}
              >
                <X size={16} /> Закрыть
              </button>
            </div>
          )}
        </div>

        {screen === "update" ? (
          <div className="uc-content" key="update">
            <Forest />

            {/* Логотип в светящемся медальоне */}
            <div className="uc-logo-wrap" aria-hidden>
              <div className="uc-halo" />
              <div className="uc-orbit" />
              <img src="/logo.jpg" alt="" draggable={false} />
            </div>

            {/* Большая красная семёрка */}
            <div className="uc-seven-wrap">
              <Sparkles className="uc-spark uc-spark-left" />
              <span className="uc-seven">7</span>
              <Sparkles className="uc-spark uc-spark-right" />
            </div>

            {/* Маленький логотип и подпись WinChat */}
            <div className="uc-brand">
              <img src="/logo.jpg" alt="" draggable={false} />
              <span>WinChat</span>
            </div>

            {found?.version && (
              <p className="uc-version">Доступна версия {found.version}</p>
            )}

            {notice && <p className="uc-notice">{notice}</p>}

            {/* Зелёная кнопка снизу */}
            <div className="uc-bottom">
              <p className="uc-current-version">Текущая версия {APP_VERSION}</p>
              <button
                className="uc-primary"
                onClick={() => void checkForUpdates()}
                disabled={checking}
              >
                <span className="uc-primary-glow" aria-hidden />
                {checking ? (
                  <Loader2 className="uc-spin" size={19} />
                ) : (
                  <Check size={19} />
                )}
                <span>Проверить обновления</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="uc-content uc-content--beta" key="beta">
            <button className="uc-nav" onClick={() => setScreen("update")}>
              <ArrowLeft size={16} /> Назад
            </button>

            <div className="uc-beta-panel">
              <div className="uc-beta-logo">
                <img src="/logo.jpg" alt="" draggable={false} />
                <span>WinChat</span>
              </div>
              <p className="uc-beta-title">Бета-программа</p>
              <p className="uc-beta-desc">
                Получайте обновления раньше всех и помогайте делать WinChat лучше.
                Заявку рассматривает администратор.
              </p>

              <div className="uc-beta-box">
                <div className="uc-beta-status">
                  <span className={`uc-dot uc-dot-${beta.status}`} />
                  <span>{BETA_LABELS[beta.status]}</span>
                </div>
                {beta.status === "accepted" && (
                  <div className="uc-beta-ok">
                    <Check size={14} /> Бета-канал включён для вашего устройства
                  </div>
                )}
                {beta.status === "pending" && (
                  <div className="uc-beta-wait">
                    <Clock3 size={14} /> Ожидайте решения администратора
                  </div>
                )}
                {beta.status !== "accepted" && (
                  <button
                    className="uc-beta-btn"
                    onClick={() => void activateBeta()}
                    disabled={betaBusy || beta.status === "pending"}
                  >
                    {betaBusy ? (
                      <Loader2 className="uc-spin" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    {beta.status === "pending"
                      ? "Заявка отправлена"
                      : "Активировать бета программу"}
                  </button>
                )}

                {beta.status === "accepted" && (
                  <div className="uc-beta-updates">
                    <button
                      className="uc-beta-btn"
                      onClick={() => void checkBetaUpdates()}
                      disabled={betaChecking || betaInstalling}
                    >
                      {betaChecking ? (
                        <Loader2 className="uc-spin" size={16} />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                      {betaChecking ? "Проверяем…" : "Проверить бета обновления"}
                    </button>

                    {betaFound && (
                      <div className="uc-beta-found">
                        <p className="uc-beta-found-title">
                          {betaFound.version
                            ? `Найдена версия ${betaFound.version}`
                            : "Бета-обновление найдено"}
                        </p>
                        {betaFound.description && (
                          <p className="uc-beta-found-desc">{betaFound.description}</p>
                        )}
                        <button
                          className="uc-beta-install"
                          onClick={() => void installBetaUpdate()}
                          disabled={betaInstalling}
                        >
                          <Download size={16} />
                          {betaInstalling ? "Устанавливаем…" : "Обновить"}
                        </button>
                        {(betaInstalling || betaProgress !== null) && (
                          <div className="uc-beta-progress" aria-live="polite">
                            <div className="uc-beta-progress-track">
                              <div
                                className="uc-beta-progress-fill"
                                style={{
                                  width: `${Math.min(100, Math.max(0, betaProgress ?? 0))}%`,
                                }}
                              />
                            </div>
                            <span>{Math.round(betaProgress ?? 0)}%</span>
                          </div>
                        )}
                      </div>
                    )}

                    {betaNotFound && (
                      <p className="uc-beta-empty">Бета-обновления не найдены</p>
                    )}
                    {betaNotice && <p className="uc-notice">{betaNotice}</p>}
                    {betaInstallNote && <p className="uc-beta-note">{betaInstallNote}</p>}
                  </div>
                )}
              </div>

              {notice && <p className="uc-notice">{notice}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
