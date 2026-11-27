import "./index.css";
import "./components/messenger/themes/modern.css";
import "./components/you-chat.css";
import "./components/happy-year.css";

document.getElementById("root")!.innerHTML = `
  <div class="messenger-modern hy-messenger">
    <div class="hy-phone-head">
      <div class="hy-phone-hero">
        <p class="hy-phone-kicker">С наступающим · 2027</p>
        <p class="hy-phone-title">WinChat</p>
      </div>
      <div class="hy-phone-search"><input placeholder="Поиск чатов и людей" /></div>
      <div class="hy-phone-filters">
        <button aria-selected="true">Все</button>
      </div>
    </div>
  </div>
`;
