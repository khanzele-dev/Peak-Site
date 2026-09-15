/* ============================================================
   pricing.js — рендер карточек тарифов и оформление покупки.
   Карточки строятся из /api/plans (главная, кабинет, покупка и продление
   без регистрации), поэтому скрыть/показать/поменять тариф в админке —
   значит сразу поменять его на сайте, без правки HTML.

   Режим задаётся атрибутом data-plans-mode у .plans-row:
   - (нет) / "account" — главная и кабинет: авторизован — оплата в кабинете,
     не авторизован — покупка без регистрации (аккаунт не обязателен);
   - "guest-new"   — страница покупки без регистрации;
   - "guest-renew" — продление по ссылке подписки (ключ в data-subscription-key).
   ============================================================ */

(function () {
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function planCardHTML(plan, mode) {
    var featured = plan.badge ? " is-popular" : "";
    var badgeHtml = plan.badge ? escapeHtml(plan.badge) : "&nbsp;";
    var label = mode === "guest-renew" ? "Продлить" : "Выбрать";
    return (
      '<div class="plan' + featured + '">' +
      '<p class="plan-badge">' + badgeHtml + "</p>" +
      '<p class="plan-name">' + escapeHtml(plan.name) + "</p>" +
      '<p class="plan-price"><sup>₽</sup>' + Number(plan.priceRub).toLocaleString("ru-RU") + "</p>" +
      '<span class="plan-save">&nbsp;</span>' +
      '<button type="button" class="plan-btn" data-plan-id="' + escapeHtml(plan.id) + '">' + label + "</button>" +
      "</div>"
    );
  }

  function setLoading(btn, loading) {
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = "Обработка…";
      btn.style.pointerEvents = "none";
      btn.style.opacity = ".7";
    } else {
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.style.pointerEvents = "";
      btn.style.opacity = "";
    }
  }

  function showError(card, message) {
    var existing = card.querySelector(".plan-error");
    if (existing) existing.remove();
    var p = document.createElement("p");
    p.className = "plan-error";
    p.setAttribute("role", "alert");
    p.textContent = message;
    card.appendChild(p);
  }

  /** Создаёт платёж и уводит на страницу оплаты ЮKassa. true — если ушли на оплату. */
  async function startPayment(url, body, card) {
    var res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      showError(card, data.error || "Не удалось создать платёж. Попробуйте позже.");
      return false;
    }
    if (!data.confirmationUrl) {
      showError(card, "Не удалось получить ссылку на оплату.");
      return false;
    }
    window.location.href = data.confirmationUrl;
    return true;
  }

  async function buyPlan(btn, container) {
    var planId = btn.getAttribute("data-plan-id");
    var card = btn.closest(".plan");
    var mode = container.dataset.plansMode || "account";

    setLoading(btn, true);
    var redirected = false;
    try {
      if (mode === "guest-new") {
        redirected = await startPayment("/api/guest/purchase", { planId: planId }, card);
      } else if (mode === "guest-renew") {
        redirected = await startPayment("/api/guest/renew", { planId: planId, key: container.dataset.subscriptionKey || "" }, card);
      } else {
        var meRes = await fetch("/api/users/me", { credentials: "same-origin" });
        if (meRes.status === 401) {
          // Аккаунт не обязателен: без входа оформляем покупку без регистрации
          redirected = await startPayment("/api/guest/purchase", { planId: planId }, card);
        } else if (!meRes.ok) {
          throw new Error("me failed");
        } else {
          redirected = await startPayment("/api/payments/create", { planId: planId }, card);
        }
      }
    } catch (e) {
      showError(card, "Ошибка сети. Попробуйте позже.");
    } finally {
      // При уходе на оплату кнопку не возвращаем — иначе мигнёт до смены страницы
      if (!redirected) setLoading(btn, false);
    }
  }

  function bindButtons(container) {
    var buttons = container.querySelectorAll(".plan-btn[data-plan-id]");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        buyPlan(btn, container);
      });
    });
  }

  async function renderInto(container) {
    try {
      var res = await fetch("/api/plans", { credentials: "same-origin" });
      if (!res.ok) throw new Error("plans failed");
      var data = await res.json();
      var plans = data.plans || [];
      if (plans.length === 0) {
        container.innerHTML = '<p class="plans-empty">Тарифы временно недоступны.</p>';
        return;
      }
      var mode = container.dataset.plansMode;
      container.innerHTML = plans.map(function (plan) { return planCardHTML(plan, mode); }).join("");
      // Карточки подменяют скелетоны с коротким проявлением, а не рывком.
      container.classList.add("reveal");
      container.addEventListener("animationend", function handler() {
        container.classList.remove("reveal");
        container.removeEventListener("animationend", handler);
      });
      bindButtons(container);
    } catch (e) {
      container.innerHTML = '<p class="plans-empty">Не удалось загрузить тарифы. Обновите страницу.</p>';
    }
  }

  // Страница продления рендерит тарифы после того, как нашла подписку
  window.PeakPricing = { renderInto: renderInto };

  document.addEventListener("DOMContentLoaded", function () {
    var containers = document.querySelectorAll(".plans-row[data-plans-auto]");
    containers.forEach(function (container) {
      renderInto(container);
    });
  });
})();
