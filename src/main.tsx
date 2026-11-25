import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initDevLogs, devLog } from "./lib/devLogs";
import { applyMono } from "./lib/devMode";
import { applyNyDark, getNyDark } from "./lib/nyTheme";

/* Режим разработчика: логи стартуют сразу при запуске приложения, */
/* монохромный интерфейс включается до первого рендера.              */
initDevLogs();
applyMono();
/* Тёмная зимняя тема применяется до первого рендера — без белой вспышки. */
applyNyDark(getNyDark());
devLog("rendering app");

const rootEl = document.getElementById("root")!;
/* Убираем статичную заглушку из index.html перед первым рендером. */
rootEl.replaceChildren();

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);

devLog("app render requested");
