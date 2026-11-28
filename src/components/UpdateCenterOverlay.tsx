import { useEffect, useState, type CSSProperties } from "react";
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
import { APP_VERSION, isVersion8 } from "../lib/checkVersion";
import {
  getDeviceInfo,
  reportDeviceStatus,
  requestOta7Overlay,
  searchOta,
  type OtaInfo,
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

/** Снег — только CSS, без картинок и эмодзи. */
function Snow() {
  return <div className="uc-snow" aria-hidden />;
}

/** Ёлочки и звёзды — SVG-иконки, видны только в состоянии WinChat 7. */
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

/** Искры-частицы взрыва при переходе: угол полёта — через `--i`. */
const BURST_BITS = Array.from({ length: 14 }, (_, i) => i);

/**
 * Герой экрана: одна и та же разметка для 7 и для Cordy 8.
 * Меняются только цифра и подпись — сам интерфейс не перескакивает.
 */
function HeroBlock({ label, revealed }: { label: string; revealed: boolean }) {
  return (
    <div className={revealed ? "uc-hero uc-hero--cordy" : "uc-hero"}>
      <div className="uc-hero-stage" aria-hidden>
        <div className="uc-hero-digit-wrap">
          <span className="uc-hero-glow" />
          <span className="uc-hero-morph" />
          <span className="uc-hero-halo" />
          <span className="uc-hero-ring" />
          <span className="uc-hero-ring uc-hero-ring--late" />
          <span className="uc-hero-digit uc-hero-digit--seven">7</span>
          <span className="uc-hero-digit uc-hero-digit--eight">8</span>
          <span className="uc-hero-sweep" />
          <span className="uc-hero-burst">
            {BURST_BITS.map((i) => (
              <span
                key={i}
                className="uc-hero-bit"
                style={{ "--i": i } as CSSProperties}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="uc-hero-names" aria-live="polite">
        {/* WinChat разваливается на буквы-осколки при переходе к Cordy. */}
        <span className="uc-hero-name uc-hero-name--winchat" aria-hidden>
          {"WinChat".split("").map((ch, i) => (
            <span key={i} className="uc-hero-ch">
              {ch}
            </span>
          ))}
        </span>
        {/* Cordy собирается снизу по буквам. */}
        <span className="uc-hero-name uc-hero-name--cordy">
          {"Cordy".split("").map((ch, i) => (
            <span key={i} className="uc-hero-ch uc-hero-ch--in">
              {ch}
            </span>
          ))}
        </span>
        <span className="uc-hero-underline" aria-hidden />
      </div>
      <p className="uc-version">{label}</p>
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

  /* Обновление до 8.x запускает плавный переход WinChat 7 → Cordy 8. */
  const targetVersion = found?.version ?? ota?.version ?? null;
  const cordyMode = isVersion8(targetVersion);
  const [cordyRevealed, setCordyRevealed] = useState(false);

  useEffect(() => {
    if (!cordyMode) {
      setCordyRevealed(false);
      return;
    }
    setCordyRevealed(false);
    const timer = window.setTimeout(() => setCordyRevealed(true), 2000);
    return () => window.clearTimeout(timer);
  }, [cordyMode, targetVersion]);

  useEffect(() => {
    const off = subscribeBeta(setBeta);
    void refreshBetaStatus();
    return off;
  }, []);

  useEffect(() => {
    if (ota) setFound(ota);
  }, [ota]);

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
        // Обновление до 8.x сначала показывает переход 7 → Cordy 8 здесь,
        // а экран установки открывается по нажатию кнопки.
        if (!isVersion8(result.version)) {
          // Сначала поднимаем экран установки, затем закрываем центр обновлений,
          // иначе пользователь остаётся в настройках без видимого результата.
          requestOta7Overlay(result);
          onClose();
        }
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
    if (betaChecking || beta.status !== "accepted") return;
    setBetaChecking(true);
    setBetaFound(null);
    setBetaNotFound(false);
    setBetaNotice(null);
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

  /** Переход в отдельный экран обновления, где показывается анимированная 7. */
  function openBetaUpdate() {
    if (!betaFound) return;
    requestOta7Overlay(betaFound);
    onClose();
  }

  /** Найденное обновление 8.x открывает отдельный экран установки. */
  function handlePrimary() {
    if (cordyMode && found) {
      requestOta7Overlay(found);
      onClose();
      return;
    }
    void checkForUpdates();
  }

  return (
    <div
      className={embedded ? "uc-root uc-root--embedded" : "uc-root"}
      role="dialog"
      aria-modal="true"
      aria-label="Обновление Cordy"
    >
      <button className="uc-backdrop" onClick={onClose} aria-label="Закрыть" />

      <div className="uc-stage">
        {/* Снег остаётся только у WinChat 7 и плавно уходит у Cordy 8. */}
        <div className={cordyRevealed ? "uc-snow-wrap uc-snow-wrap--hidden" : "uc-snow-wrap"}>
          <Snow />
        </div>

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
            {/* Ёлочки сверху, только у WinChat 7; у Cordy 8 плавно исчезают. */}
            <div
              className={
                cordyRevealed
                  ? "uc-forest-wrap uc-forest-wrap--hidden"
                  : "uc-forest-wrap"
              }
            >
              <Forest />
            </div>

            {/* Короткий экран: цифра, название и версия под ним. */}
            <HeroBlock
              revealed={cordyRevealed}
              label={
                found?.version
                  ? `Доступна версия ${found.version}`
                  : `Cordy ${APP_VERSION}`
              }
            />

            {notice && <p className="uc-notice">{notice}</p>}

            {/* Зелёная кнопка снизу */}
            <div className="uc-bottom">
              <p className="uc-current-version">Текущая версия {APP_VERSION}</p>
              <button
                className="uc-primary"
                onClick={handlePrimary}
                disabled={checking}
              >
                <span className="uc-primary-glow" aria-hidden />
                {checking ? (
                  <Loader2 className="uc-spin" size={19} />
                ) : (
                  <Check size={19} />
                )}
                <span>
                  {cordyMode && found
                    ? "Доступно обновление"
                    : "Проверить обновления"}
                </span>
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
                <img src="/cordy-logo.svg" alt="" draggable={false} />
                <span>Cordy</span>
              </div>
              <p className="uc-beta-title">Бета-программа</p>
              <p className="uc-beta-desc">
                Получайте обновления раньше всех и помогайте делать Cordy лучше.
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
                      disabled={betaChecking}
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
                        {betaFound.version && (
                          <p className="uc-beta-found-version">{betaFound.version}</p>
                        )}
                        <button className="uc-beta-install" onClick={openBetaUpdate}>
                          <Download size={16} /> Доступно обновление
                        </button>
                      </div>
                    )}

                    {betaNotFound && (
                      <p className="uc-beta-empty">Бета-обновления не найдены</p>
                    )}
                    {betaNotice && <p className="uc-notice">{betaNotice}</p>}
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
