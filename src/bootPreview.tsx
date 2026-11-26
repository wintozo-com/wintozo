import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import BootAnimation from "./components/BootAnimation";

/** Отдельное превью, не меняющее сохранённую тему или состояние OOBE. */
function Preview() {
  const [dark, setDark] = useState(false);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("ny-dark", dark);
    return () => document.documentElement.classList.remove("ny-dark");
  }, [dark]);
  useEffect(() => {
    if (!playing) return;
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), 3000);
    return () => window.clearTimeout(timer);
  }, [run, playing]);

  function replay() {
    setReady(false);
    setPlaying(true);
    setRun((value) => value + 1);
  }

  return (
    <>
      {playing && <BootAnimation key={run} variant="classic" ready={ready} onDone={() => setPlaying(false)} />}
      <div style={{ position: "fixed", zIndex: 2147483647, top: 16, right: 16, display: "flex", gap: 8 }}>
        <button onClick={() => setDark((value) => !value)} style={buttonStyle}>
          {dark ? "Светлая тема" : "Тёмная тема"}
        </button>
        <button onClick={replay} style={buttonStyle}>Повторить</button>
      </div>
    </>
  );
}
const buttonStyle = { border: "1px solid #8886", borderRadius: 999, padding: "10px 14px", background: "#fffe", color: "#111", cursor: "pointer", fontWeight: 600 };

createRoot(document.getElementById("root")!).render(<Preview />);
