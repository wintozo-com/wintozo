import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initDevLogs, devLog } from "./lib/devLogs";
import { applyMono } from "./lib/devMode";
import { applyTheme, getCurrentTheme } from "./lib/themes";

/* Режим разработчика: логи стартуют сразу при запуске приложения, */
/* монохромный интерфейс включается до первого рендера.              */
initDevLogs();
applyMono();
/* Тема (включая тёмную зимнюю) применяется до первого рендера — без белой вспышки. */
applyTheme(getCurrentTheme());
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
