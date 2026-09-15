/* ============================================================
   guest.js — покупка и продление VPN без регистрации.
   Страница задаётся <body data-guest-page="buy|renew">.

   Ключ доступа — ссылка на подписку. Ссылка управления имеет вид
   /renew.html#<ключ>: ключ стоит во фрагменте (#), поэтому не уходит
   на сервер в URL, в логи и в Referer — только в теле POST-запроса.
   ============================================================ */

(function () {
  var page = document.body.dataset.guestPage;
  var POLL_INTERVAL_MS = 2500;
  var POLL_ATTEMPTS = 24; // ~1 минута ожидания подтверждения оплаты

  function $(id) { return document.getElementById(id); }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  async function postJson(url, body) {
    try {
      var res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      return { ok: res.ok, status: res.status, data: data };
    } catch (e) {
      return { ok: false, status: 0, data: {} };
    }
  }

  function manageUrlFor(key) {
    return window.location.origin + "/renew.html#" + encodeURIComponent(key);
  }

  /** Плавно показывает блок (тот же приём, что и в кабинете). */
  function reveal(el) {
    if (!el) return;
    el.hidden = false;
    el.classList.add("reveal");
    el.addEventListener("animationend", function handler() {
      el.classList.remove("reveal");
      el.removeEventListener("animationend", handler);
    });
  }

  /* ---------- Рендер подписки в карточки [data-sub] ---------- */
  function fill(root, name, text) {
    root.querySelectorAll('[data-sub="' + name + '"]').forEach(function (node) { node.textContent = text; });
  }

  function renderSubscription(root, sub) {
    var st = STATUS_MAP[sub.status] || { label: sub.status, isActive: false };
    root.querySelectorAll('[data-sub="badge"]').forEach(function (badge) {
      badge.textContent = st.isActive ? "Активна" : "Неактивна";
      badge.className = "badge " + (st.isActive ? "active" : "inactive");
    });
    fill(root, "remaining", formatRemaining(sub.expireAt));
    fill(root, "expire", fmtDate(sub.expireAt));
    fill(root, "status", st.label);

    var usedGB = bytesToGB(sub.trafficUsedBytes || 0);
    var limitGB = bytesToGB(sub.trafficLimitBytes || 0);
    fill(root, "used", usedGB.toFixed(1) + " ГБ");
    if (limitGB > 0) {
      var pct = Math.min(100, (usedGB / limitGB) * 100);
      fill(root, "limit", "из " + limitGB.toFixed(0) + " ГБ");
      fill(root, "traffic-hint", "Осталось " + Math.max(0, limitGB - usedGB).toFixed(1) + " ГБ · использовано " + pct.toFixed(0) + "%");
      root.querySelectorAll('[data-sub="bar"]').forEach(function (bar) { bar.style.width = pct.toFixed(1) + "%"; });
    } else {
      fill(root, "limit", "без лимита");
      fill(root, "traffic-hint", "Трафик не ограничен");
    }

    root.querySelectorAll('[data-sub="manage-url"]').forEach(function (input) { input.value = manageUrlFor(sub.key); });
    root.querySelectorAll('[data-sub="sub-url"]').forEach(function (input) { input.value = sub.subscriptionUrl || ""; });
    root.querySelectorAll('[data-sub="renew-link"]').forEach(function (a) { a.setAttribute("href", "/renew.html#" + encodeURIComponent(sub.key)); });
    root.querySelectorAll("[data-sub-qr]").forEach(function (qr) { renderQR(qr.id, sub.subscriptionUrl); });
    root.querySelectorAll("[data-app-scheme]").forEach(function (btn) {
      btn.disabled = !sub.subscriptionUrl;
      btn.onclick = function () { openSubscriptionInApp(btn.dataset.appScheme, sub.subscriptionUrl); };
    });
  }

  /** Кнопки "Копировать" рядом с полями: <button data-copy-for="inputId">. */
  function initCopyButtons() {
    document.querySelectorAll("[data-copy-for]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = $(btn.dataset.copyFor);
        if (input) copyWithFeedback(btn, input.value, input);
      });
    });
  }

  /* ---------- Результат заказа (после возврата с оплаты) ---------- */
  var orderView = $("order-view");

  function setOrderState(state) {
    orderView.querySelectorAll("[data-state]").forEach(function (block) {
      block.hidden = block.dataset.state !== state;
    });
  }

  function showOrderError(title, text) {
    $("order-error-title").textContent = title;
    $("order-error-text").textContent = text;
    setOrderState("error");
  }

  function renderOrderSuccess(order) {
    var isRenew = order.kind === "renew";
    var sub = order.subscription;
    $("success-kicker").textContent = isRenew ? "Продление оплачено" : "Оплата прошла";
    $("success-title").innerHTML = isRenew ? "Подписка <span>продлена</span>" : "Подписка <span>активна</span>";
    $("success-sub").textContent = isRenew
      ? "Новый срок — до " + fmtDate(sub.expireAt) + ". Тариф «" + order.plan.name + "», " + Number(order.amountRub).toLocaleString("ru-RU") + " ₽."
      : "Тариф «" + order.plan.name + "», " + Number(order.amountRub).toLocaleString("ru-RU") + " ₽. Подключитесь ниже — это займёт минуту.";
    document.title = (isRenew ? "Подписка продлена" : "Подписка активна") + " — PEAK";
    renderSubscription($("order-success"), sub);
    setOrderState("success");
  }

  async function pollOrder(token) {
    $("order-loading-title").textContent = "Проверяем оплату…";
    $("order-loading-text").textContent = "Обычно это занимает несколько секунд. Не закрывайте страницу.";
    setOrderState("loading");

    for (var attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      var r = await postJson("/api/guest/order", { token: token });
      if (!r.ok) {
        if (r.status === 0 || r.status === 429 || r.status >= 500) {
          await wait(POLL_INTERVAL_MS * 2); // сеть моргнула или лимит — пробуем ещё
          continue;
        }
        showOrderError(
          r.status === 410 ? "Ссылка на заказ устарела" : "Заказ не найден",
          r.data.error || "Проверьте ссылку или откройте подписку по ссылке управления."
        );
        return;
      }

      var order = r.data;
      if (order.status === "succeeded") {
        if (order.subscription) {
          renderOrderSuccess(order);
        } else {
          showOrderError("Оплата прошла", "Подписка оформлена, но её данные сейчас не загрузились. Обновите страницу через минуту.");
        }
        return;
      }
      if (order.status === "canceled" || order.status === "failed") {
        setOrderState("canceled");
        return;
      }
      if (order.status === "refunded") {
        showOrderError("Оформлен возврат", "По этому заказу деньги возвращены, подписка не продлевается.");
        return;
      }
      if (order.status === "processing") {
        $("order-loading-title").textContent = "Оплата получена";
        $("order-loading-text").textContent = page === "renew" ? "Продлеваем подписку…" : "Активируем подписку…";
      }
      await wait(POLL_INTERVAL_MS);
    }
    setOrderState("pending");
  }

  function initOrder() {
    var token = new URLSearchParams(window.location.search).get("order");
    if (!token) return false;

    document.querySelectorAll("[data-guest-intro]").forEach(function (el) { el.hidden = true; });
    orderView.hidden = false;
    $("order-retry").addEventListener("click", function () { pollOrder(token); });
    $("order-error-retry").addEventListener("click", function () { pollOrder(token); });
    pollOrder(token);
    return true;
  }

  /* ---------- Покупка ---------- */
  async function initBuy() {
    // Вошедшим подсказываем купить в кабинете — там подписка будет привязана к аккаунту
    try {
      var me = await fetch("/api/users/me", { credentials: "same-origin" });
      if (me.ok) $("account-notice").hidden = false;
    } catch (e) { /* без сети — просто не показываем подсказку */ }
  }

  /* ---------- Продление ---------- */
  var currentKey = "";

  function keyFromHash() {
    var raw = window.location.hash.replace(/^#/, "");
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function setLookupLoading(loading) {
    var btn = $("lookup-btn");
    btn.disabled = loading;
    btn.innerHTML = loading ? '<span class="spinner" aria-hidden="true"></span>' : '<span class="btn-label">Найти подписку</span>';
  }

  function showLookupForm(message) {
    $("renew-found").hidden = true;
    $("renew-lookup").hidden = false;
    $("lookup-error").textContent = message || "";
    $("sub-key").classList.toggle("is-invalid", !!message);
  }

  async function lookup(key) {
    $("lookup-error").textContent = "";
    $("sub-key").classList.remove("is-invalid");
    setLookupLoading(true);
    var r = await postJson("/api/guest/lookup", { key: key });
    setLookupLoading(false);

    if (!r.ok) {
      var message = r.data.error ||
        (r.status === 0 ? "Нет соединения. Проверьте интернет и попробуйте ещё раз." : "Не удалось проверить ссылку. Попробуйте позже.");
      showLookupForm(message);
      return;
    }

    var sub = r.data.subscription;
    currentKey = sub.key;
    // Адресная строка становится ссылкой управления — её можно просто сохранить в закладки
    history.replaceState(null, "", "/renew.html#" + encodeURIComponent(sub.key));

    var found = $("renew-found");
    renderSubscription(found, sub);
    $("renew-disabled").hidden = r.data.canRenew;
    $("renew-plans-section").hidden = !r.data.canRenew;

    $("renew-lookup").hidden = true;
    reveal(found);

    if (r.data.canRenew) {
      var plans = $("renew-plans");
      plans.dataset.subscriptionKey = currentKey;
      window.PeakPricing.renderInto(plans);
    }
  }

  function initRenew() {
    $("lookup-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var value = $("sub-key").value.trim();
      if (!value) {
        showLookupForm("Вставьте ссылку на подписку");
        return;
      }
      lookup(value);
    });

    $("lookup-other").addEventListener("click", function () {
      history.replaceState(null, "", "/renew.html");
      $("sub-key").value = "";
      showLookupForm("");
      $("sub-key").focus();
    });

    var key = keyFromHash();
    if (key) {
      $("sub-key").value = window.location.href;
      lookup(key);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initCopyButtons();
    if (initOrder()) return;
    if (page === "buy") initBuy();
    if (page === "renew") initRenew();
  });
})();
