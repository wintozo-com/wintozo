import { Check, MoonStar, Sun } from "lucide-react";
import { useNyDark } from "../lib/nyTheme";
import "./happy-year.css";

/**
 * Переключатель светлой/тёмной новогодней темы.
 * Живёт в Настройки → Кастомизация и синхронизируется
 * с плавающей кнопкой в мессенджере и OOBE.
 */
export default function NyThemePicker({ className = "" }: { className?: string }) {
  const [dark, setDark] = useNyDark();

  return (
    <div className={`ny-theme-picker ${className}`}>
      <span className="ny-theme-picker-label">
        <MoonStar className="h-3.5 w-3.5" />
        Новогоднее оформление
      </span>

      <div className="ny-theme-picker-grid" role="radiogroup" aria-label="Светлая или тёмная тема">
        <button
          type="button"
          role="radio"
          aria-checked={!dark}
          onClick={() => setDark(false)}
          className={`ny-theme-card ${!dark ? "is-active" : ""}`}
        >
          <span className="ny-theme-preview ny-theme-preview--light" aria-hidden="true">
            <i className="ny-theme-preview-garland" />
            <i className="ny-theme-preview-row" />
            <i className="ny-theme-preview-row ny-theme-preview-row--short" />
            <i className="ny-theme-preview-ball ny-theme-preview-ball--red" />
            <i className="ny-theme-preview-ball ny-theme-preview-ball--green" />
            <i className="ny-theme-preview-ball ny-theme-preview-ball--gold" />
          </span>
          <span className="ny-theme-card-copy">
            <Sun className="h-4 w-4" />
            Светлая
          </span>
          {!dark && (
            <span className="ny-theme-check" aria-hidden="true">
              <Check className="h-3 w-3" />
            </span>
          )}
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={dark}
          onClick={() => setDark(true)}
          className={`ny-theme-card ny-theme-card--dark ${dark ? "is-active" : ""}`}
        >
          <span className="ny-theme-preview ny-theme-preview--dark" aria-hidden="true">
            <i className="ny-theme-preview-garland" />
            <i className="ny-theme-preview-row" />
            <i className="ny-theme-preview-row ny-theme-preview-row--short" />
            <i className="ny-theme-preview-ball ny-theme-preview-ball--red" />
            <i className="ny-theme-preview-ball ny-theme-preview-ball--green" />
            <i className="ny-theme-preview-ball ny-theme-preview-ball--gold" />
          </span>
          <span className="ny-theme-card-copy">
            <MoonStar className="h-4 w-4" />
            Тёмная
          </span>
          {dark && (
            <span className="ny-theme-check" aria-hidden="true">
              <Check className="h-3 w-3" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
