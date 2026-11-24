import { Check, Music, Volume2, VolumeX } from "lucide-react";
import { useBgMusic } from "../lib/bgMusic";
import "./happy-year.css";

/**
 * Переключатель фоновой новогодней музыки.
 * Живёт в Настройки → Кастомизация и управляет той же музыкой,
 * что играет фоном в мессенджере (winchat_bg_new_year_music).
 */
export default function BgMusicToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useBgMusic();

  return (
    <div className={`ny-bgmusic-card ${className}`}>
      <span className="ny-bgmusic-icon" aria-hidden="true">
        <Music className="h-4 w-4" />
      </span>
      <span className="ny-bgmusic-copy">
        <span className="ny-bgmusic-title">Фоновая музыка</span>
        <span className="ny-bgmusic-sub">{on ? "Новогодний фон звучит" : "Музыка выключена"}</span>
      </span>
      <div className="ny-bgmusic-grid" role="radiogroup" aria-label="Фоновая музыка вкл или выкл">
        <button
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => setOn(true)}
          className={`ny-bgmusic-opt ${on ? "is-active" : ""}`}
        >
          <Volume2 className="h-4 w-4" />
          Вкл
          {on && (
            <span className="ny-bgmusic-check" aria-hidden="true">
              <Check className="h-3 w-3" />
            </span>
          )}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!on}
          onClick={() => setOn(false)}
          className={`ny-bgmusic-opt ${!on ? "is-active" : ""}`}
        >
          <VolumeX className="h-4 w-4" />
          Выкл
          {!on && (
            <span className="ny-bgmusic-check" aria-hidden="true">
              <Check className="h-3 w-3" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
