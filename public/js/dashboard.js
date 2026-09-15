/* ============================================================
   dashboard.js — логика личного кабинета
   Доступ к странице уже проверен на edge (middleware.ts) по httpOnly-куке.
   Здесь только подгрузка данных профиля/серверов/платежей через API
   и обработка 401 (сессия истекла/отозвана) на всякий случай.
   ============================================================ */

async function apiGet(url) {
  var res = await fetch(url, { credentials: "same-origin" });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("request failed: " + url);
  return res.json();
}

async function fetchUserProfile() {
  return apiGet("/api/users/me");
}

async function fetchNodes() {
  var data = await apiGet("/api/nodes");
  return data.nodes || [];
}

async function fetchPayments() {
  var data = await apiGet("/api/payments");
  return data.payments || [];
}

async function logoutUser() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(function () {});
}

/* ============================================================
   Форматирование (bytesToGB, fmtDate, pluralDays, STATUS_MAP, renderQR —
   в subscription-utils.js, общие с покупкой без регистрации)
   ============================================================ */
function countryFlag(code) {
  if (!code || code.length !== 2) return "🏳️";
  var upper = code.toUpperCase();
  var base = 0x1F1E6;
  return String.fromCodePoint(base + upper.charCodeAt(0) - 65, base + upper.charCodeAt(1) - 65);
}
/* ============================================================
   Рендер
   ============================================================ */
function renderProfile(payload) {
  document.getElementById("user-phone").textContent = payload.user.phone || "";

  var sub = payload.subscription;
  var st = STATUS_MAP[sub && sub.status] || { label: "Нет подписки", isActive: false };
  var badge = document.getElementById("sub-badge");
  badge.textContent = st.isActive ? "Активна" : "Неактивна";
  badge.className = "badge " + (st.isActive ? "active" : "inactive");

  document.getElementById("sub-plan").textContent = sub
    ? (monthsRemaining(sub.expireAt) > 0
        ? pluralMonths(monthsRemaining(sub.expireAt)) + " (" + pluralDays(daysRemaining(sub.expireAt)) + ")"
        : pluralDays(daysRemaining(sub.expireAt)))
    : "—";
  document.getElementById("sub-expire").textContent = sub ? fmtDate(sub.expireAt) : "—";
  document.getElementById("sub-status").textContent = st.label;

  var connectCard = document.getElementById("connect-card");
  var onboardingCard = document.getElementById("onboarding-card");
  var pricingCard = document.getElementById("dashboard-pricing-card");
  var serversCard = document.getElementById("servers-card");
  toggleCard(connectCard, st.isActive);
  // Показываем инструкцию по подключению всегда — и тем, у кого ещё нет
  // подписки, и тем, у кого она уже активна (например, чтобы подключить
  // ещё одно устройство или переустановить приложение).
  toggleCard(onboardingCard, true);
  toggleCard(pricingCard, !st.isActive);
  toggleCard(serversCard, st.isActive);

  var pricingDesc = document.getElementById("pricing-card-desc");
  if (pricingDesc) {
    pricingDesc.textContent = sub
      ? "Продлить период подписки."
      : "Выберите тариф, чтобы начать пользоваться VPN.";
  }

  var hasLink = !!(sub && sub.subscriptionUrl);
  var onboardLinkBox = document.getElementById("onboard-link-box");
  if (!hasLink && onboardLinkBox) onboardLinkBox.classList.remove("show");
  document.querySelectorAll(".add-vpn-btn, .copy-sub-link, #tv-show-link").forEach(function (b) {
    b.disabled = !hasLink;
  });

  var primaryBtn = document.getElementById("manage-primary-btn");
  var secondaryBtn = document.getElementById("manage-secondary-btn");
  if (primaryBtn && secondaryBtn) {
    if (st.isActive) {
      primaryBtn.textContent = "Продлить";
      secondaryBtn.textContent = "Сменить тариф";
      secondaryBtn.setAttribute("href", "/index.html#pricing");
    } else {
      primaryBtn.textContent = "Выбрать тариф →";
      secondaryBtn.textContent = "Как подключиться";
      secondaryBtn.setAttribute("href", "#onboarding-card");
    }
  }

  var usedGB = sub ? bytesToGB(sub.trafficUsedBytes) : 0;
  var limitGB = sub ? bytesToGB(sub.trafficLimitBytes) : 0;
  var pct = limitGB > 0 ? Math.min(100, (usedGB / limitGB) * 100) : 0;
  document.getElementById("traffic-used").textContent = usedGB.toFixed(1) + " ГБ";
  document.getElementById("traffic-limit").textContent = limitGB.toFixed(0);
  document.getElementById("traffic-bar").style.width = pct.toFixed(1) + "%";
  document.getElementById("traffic-hint").textContent = sub
    ? "Осталось " + Math.max(0, limitGB - usedGB).toFixed(1) + " ГБ · использовано " + pct.toFixed(0) + "%"
    : "Оформите подписку, чтобы начать пользоваться VPN";

  currentSubscriptionUrl = (sub && sub.subscriptionUrl) || "";
  var subInput = document.getElementById("sub-url");
  subInput.value = currentSubscriptionUrl;
  renderQR("qr-code", currentSubscriptionUrl);
}

var currentSubscriptionUrl = "";

/** Снимает скелетоны: класс на <body> управляет всеми заглушками разом. */
function clearSkeletons() {
  document.body.classList.remove("is-loading");
}

/**
 * Показывает/прячет карточку. При первом появлении добавляет .reveal,
 * чтобы блок проявлялся, а не выскакивал. Класс снимаем после анимации,
 * чтобы не держать лишний композиторный слой.
 */
function toggleCard(card, visible) {
  if (!card) return;
  var wasHidden = getComputedStyle(card).display === "none";
  card.style.display = visible ? "" : "none";
  if (visible && wasHidden) {
    card.classList.add("reveal");
    card.addEventListener("animationend", function handler() {
      card.classList.remove("reveal");
      card.removeEventListener("animationend", handler);
    });
  }
}

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderNodes(nodes) {
  var countEl = document.getElementById("servers-count");
  var flagsEl = document.getElementById("servers-flags");
  if (!countEl || !flagsEl) return;

  countEl.textContent = String(nodes.length);

  flagsEl.innerHTML = "";
  var seen = {};
  nodes.forEach(function (n) {
    if (seen[n.countryCode]) return;
    seen[n.countryCode] = true;
    flagsEl.appendChild(el("span", "servers-flag", countryFlag(n.countryCode)));
  });

  if (window.twemoji) {
    window.twemoji.parse(flagsEl, {
      base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/",
      ext: ".svg",
    });
  }
}

function renderPayments(payments) {
  var body = document.getElementById("pay-table-body");
  body.innerHTML = "";
  var statusLabel = { paid: "Оплачен", pending: "В обработке", failed: "Ошибка", refunded: "Возврат" };
  if (!payments.length) {
    var emptyRow = document.createElement("tr");
    var emptyCell = el("td", null, "Пока нет платежей");
    emptyCell.colSpan = 4;
    emptyRow.appendChild(emptyCell);
    body.appendChild(emptyRow);
    return;
  }
  payments.forEach(function (p) {
    var tr = document.createElement("tr");
    tr.appendChild(el("td", null, fmtDate(p.date)));
    tr.appendChild(el("td", null, p.description));
    tr.appendChild(el("td", null, p.amount + " " + p.currency));
    var statusCell = document.createElement("td");
    statusCell.appendChild(el("span", "pay-status " + p.status, statusLabel[p.status] || p.status));
    tr.appendChild(statusCell);
    body.appendChild(tr);
  });
}

/* ============================================================
   Действия
   ============================================================ */
function initCopy(btnId, inputId) {
  var btn = document.getElementById(btnId);
  var input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener("click", function () {
    if (!input.value) return;
    navigator.clipboard.writeText(input.value).then(function () {
      var old = btn.textContent;
      btn.textContent = "Скопировано";
      setTimeout(function () { btn.textContent = old; }, 1600);
    }).catch(function () {
      input.select();
      document.execCommand("copy");
    });
  });
}

function showLinkBox(hintText) {
  var box = document.getElementById("onboard-link-box");
  var hint = document.getElementById("onboard-link-hint");
  if (!box || !currentSubscriptionUrl) return;
  document.getElementById("onboard-sub-url").value = currentSubscriptionUrl;
  renderQR("onboard-qr-code", currentSubscriptionUrl);
  if (hint) hint.textContent = hintText || "Отсканируйте QR-код в приложении, чтобы импортировать подписку автоматически.";
  box.classList.add("show");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Переключатель платформ в карточке "Как подключиться". */
function initPlatformSwitch() {
  var switcher = document.getElementById("platform-switch");
  if (!switcher) return;
  switcher.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-platform]");
    if (!btn) return;
    switcher.querySelectorAll("[data-platform]").forEach(function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    document.querySelectorAll("[data-platform-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-platform-panel") !== btn.dataset.platform;
    });
  });
}

/** Кнопки "Добавить VPN в приложение" — открывают диплинк приложения с
 *  текущей ссылкой подписки. Если приложение не поддерживает схему или не
 *  установлено, ничего не ломается — рядом всегда есть текстовый fallback
 *  "Скопируйте ссылку", который работает независимо. */
function initAddVpnButtons() {
  document.querySelectorAll(".add-vpn-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!currentSubscriptionUrl || btn.disabled) return;
      openSubscriptionInApp(btn.dataset.scheme, currentSubscriptionUrl);
    });
  });
}

function initCopySubLinkButtons() {
  document.querySelectorAll(".copy-sub-link").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!currentSubscriptionUrl || btn.disabled) return;
      navigator.clipboard.writeText(currentSubscriptionUrl).then(function () {
        var old = btn.textContent;
        btn.textContent = "Скопировано";
        setTimeout(function () { btn.textContent = old; }, 1600);
      });
    });
  });
}

function initWindowsAltToggle() {
  var toggle = document.getElementById("windows-alt-toggle");
  var panel = document.getElementById("windows-alt-panel");
  if (!toggle || !panel) return;
  toggle.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
  });
}

function initTvShowLink() {
  var btn = document.getElementById("tv-show-link");
  if (!btn) return;
  btn.addEventListener("click", function () {
    showLinkBox("Введите эту ссылку в Happ на телевизоре.");
  });
}

/* ============================================================
   Сверка платежа при возврате со страницы оплаты ЮKassa
   (?payment=pending в returnUrl) — не ждём вебхук, а сверяем сразу.
   ============================================================ */
async function syncPendingPayment() {
  var params = new URLSearchParams(window.location.search);
  if (params.get("payment") !== "pending") return;

  var banner = document.getElementById("payment-sync-banner");
  if (banner) banner.style.display = "flex";

  for (var attempt = 0; attempt < 6; attempt++) {
    try {
      var res = await fetch("/api/payments/sync", { method: "POST", credentials: "same-origin" });
      if (res.ok) {
        var data = await res.json();
        if (data.status === "SUCCEEDED" || data.status === "CANCELED" || data.status === null) break;
      }
    } catch (e) {
      // сеть моргнула — попробуем ещё раз
    }
    await new Promise(function (resolve) { setTimeout(resolve, 1500); });
  }

  if (banner) banner.style.display = "none";
  var url = new URL(window.location.href);
  url.searchParams.delete("payment");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

function initLogout() {
  var buttons = document.querySelectorAll(".logout-btn");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", async function () {
      await logoutUser();
      window.location.href = "/index.html";
    });
  });
}

/* ============================================================
   Инициализация
   ============================================================ */
document.addEventListener("DOMContentLoaded", async function () {
  initCopy("copy-btn", "sub-url");
  initCopy("onboard-copy-btn", "onboard-sub-url");
  initPlatformSwitch();
  initAddVpnButtons();
  initCopySubLinkButtons();
  initWindowsAltToggle();
  initTvShowLink();
  initLogout();

  try {
    await syncPendingPayment();

    // Три запроса стартуют разом, а не цепочкой — данные приезжают быстрее,
    // и каждый блок заменяет свой скелетон, как только пришёл его ответ.
    var nodesPromise = fetchNodes();
    var paymentsPromise = fetchPayments();
    // Без этого отказ любого из них до своего await всплывёт как unhandled.
    nodesPromise.catch(function () {});
    paymentsPromise.catch(function () {});

    var profile = await fetchUserProfile();
    renderProfile(profile);
    clearSkeletons();

    try {
      renderNodes(await nodesPromise);
    } catch (e) {
      document.getElementById("servers-flags").innerHTML = "";
    }

    try {
      renderPayments(await paymentsPromise);
    } catch (e) {
      renderPayments([]);
    }
  } catch (err) {
    console.log("[dashboard] load error:", err);
    if (err.message === "unauthorized") {
      window.location.href = "/login.html";
      return;
    }
    // Не оставляем страницу мерцать скелетонами, если данные не пришли.
    clearSkeletons();
    renderPayments([]);
    document.getElementById("servers-flags").innerHTML = "";
  }
});
