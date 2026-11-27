import { useEffect, useState } from "react";
import { UPDATE_CENTER_EVENT, type OtaInfo } from "../lib/ota";
import UpdateCenterOverlay from "./UpdateCenterOverlay";

/**
 * Хост центра обновлений внутри окна настроек.
 *
 * Раньше оверлей монтировался в CheckVersion на корне приложения и накрывал
 * весь экран — из-за этого казалось, что окно открылось «в чатах», а не в
 * настройках. Теперь хост живёт внутри карточки настроек, поэтому оверлей
 * рисуется строго поверх настроек.
 */
export default function UpdateCenterHost() {
  const [open, setOpen] = useState(false);
  const [ota, setOta] = useState<OtaInfo | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      setOta((event as CustomEvent<OtaInfo | null>).detail ?? null);
      setOpen(true);
    };
    window.addEventListener(UPDATE_CENTER_EVENT, handler);
    return () => window.removeEventListener(UPDATE_CENTER_EVENT, handler);
  }, []);

  if (!open) return null;

  return <UpdateCenterOverlay embedded ota={ota} onClose={() => setOpen(false)} />;
}
