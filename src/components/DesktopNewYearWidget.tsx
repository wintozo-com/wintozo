import { useState } from "react";
import { Snowflake, X } from "lucide-react";
import { HappyYearCountdown } from "./HappyYearDecor";
import "./desktop-new-year-widget.css";

const HIDDEN_KEY = "cordy_ny_widget_hidden";

/** Небольшой отсчёт до Нового года в правом углу экрана на компьютере. */
export default function DesktopNewYearWidget() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  function hide() {
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      /* приватный режим — просто скрываем до перезагрузки */
    }
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <aside className="ny-desk" aria-label="Отсчёт до Нового года">
      <button
        type="button"
        className="ny-desk-close"
        onClick={hide}
        aria-label="Скрыть отсчёт"
        title="Скрыть отсчёт"
      >
        <X size={13} />
      </button>
      <div className="ny-desk-head">
        <span className="ny-desk-icon">
          <Snowflake size={15} />
        </span>
        <span className="ny-desk-title">До Нового года</span>
      </div>
      <HappyYearCountdown inline className="ny-desk-timer" />
    </aside>
  );
}
