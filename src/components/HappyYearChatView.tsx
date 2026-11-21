import type { ComponentProps, ReactNode } from "react";
import ModernChatView from "./messenger/themes/modern/ModernChatView";
import { HappyYearBackdrop, HappyYearGarland } from "./HappyYearDecor";

/**
 * Новогодняя рамка чата: гирлянда сверху и падающий снег.
 * Дочерний ChatView остаётся тем же — меняется только оформление кнопок
 * (см. happy-year.css: круглые ёлочные шарики с SVG-иконками внутри).
 */
export function HappyYearFrame({ children }: { children: ReactNode }) {
  return (
    <div className="hy-frame hy-chat">
      <HappyYearBackdrop className="hy-frame-backdrop" dense={false} easterEggs />
      <HappyYearGarland className="hy-frame-garland" bulbs={14} />
      {children}
    </div>
  );
}

/** Ёлочно-шариковая версия основного вида чата WinChat 7.0. */
export default function HappyYearChatView(props: ComponentProps<typeof ModernChatView>) {
  return (
    <HappyYearFrame>
      <ModernChatView {...props} />
    </HappyYearFrame>
  );
}
