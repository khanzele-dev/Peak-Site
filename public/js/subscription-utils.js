/* ============================================================
   subscription-utils.js — общие функции отображения подписки.
   Используются личным кабинетом (dashboard.js) и страницами
   покупки/продления без регистрации (guest.js).
   ============================================================ */

function bytesToGB(bytes) { return bytes / (1024 * 1024 * 1024); }

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  } catch (e) { return iso; }
}

/**
 * Сколько месяцев реально осталось до expireAt, а не название последнего
 * купленного тарифа — так продление 1+1+1 месяц честно показывает "3 месяца",
 * а не "1 месяц" (имя последней покупки).
 */
function monthsRemaining(expireAtIso) {
  var diffMs = new Date(expireAtIso).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  var msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
  return Math.round(diffMs / msPerMonth);
}

function pluralMonths(n) {
  var mod10 = n % 10;
  var mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return n + " месяц";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return n + " месяца";
  return n + " месяцев";
}

/** Сколько дней реально осталось до expireAt — точное число в дополнение к monthsRemaining. */
function daysRemaining(expireAtIso) {
  var diffMs = new Date(expireAtIso).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function pluralDays(n) {
  var mod10 = n % 10;
  var mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return n + " день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return n + " дня";
  return n + " дней";
}

/** "3 месяца (95 дней)" / "12 дней" / "—" для истёкшей подписки. */
function formatRemaining(expireAtIso) {
  var months = monthsRemaining(expireAtIso);
  var days = daysRemaining(expireAtIso);
  if (days <= 0) return "Срок истёк";
  return months > 0 ? pluralMonths(months) + " (" + pluralDays(days) + ")" : pluralDays(days);
}

var STATUS_MAP = {
  ACTIVE:   { label: "Активна",  isActive: true },
  LIMITED:  { label: "Лимит",    isActive: false },
  DISABLED: { label: "Отключена",isActive: false },
  EXPIRED:  { label: "Истекла",  isActive: false },
};

function renderQR(containerId, url) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  if (window.QRCode && url) {
    new window.QRCode(container, {
      text: url,
      width: 134,
      height: 134,
      colorDark: "#050505",
      colorLight: "#ffffff",
    });
  } else {
    container.textContent = "QR";
  }
}

/** Открывает приложение по диплинку с ссылкой подписки. Если приложение не
 *  установлено — ничего не ломается, рядом всегда есть "скопировать ссылку". */
function openSubscriptionInApp(scheme, subscriptionUrl) {
  if (!subscriptionUrl) return;
  var encoded = encodeURIComponent(subscriptionUrl);
  var schemes = {
    happ: "happ://add/" + encoded,
    v2raytun: "v2raytun://import/" + encoded,
  };
  var url = schemes[scheme];
  if (url) window.location.href = url;
}

/** Копирует текст и на пару секунд меняет подпись кнопки на "Скопировано". */
function copyWithFeedback(btn, text, fallbackInput) {
  if (!text) return;
  function done() {
    var old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old;
    btn.textContent = "Скопировано";
    setTimeout(function () { btn.textContent = old; }, 1600);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function () {
      if (fallbackInput) { fallbackInput.select(); document.execCommand("copy"); done(); }
    });
  } else if (fallbackInput) {
    fallbackInput.select();
    document.execCommand("copy");
    done();
  }
}
