/* ============================================================
   nav.js — переключение ссылки "Войти" / "Личный кабинет" и
   бургер-меню для мобильной навигации.
   Сессия — httpOnly-кука, поэтому статус смотрим через лёгкий запрос
   к /api/users/me, а не читаем из localStorage.
   ============================================================ */

(function () {
  document.addEventListener("DOMContentLoaded", async function () {
    var links = document.querySelectorAll(".auth-nav-link");
    if (!links.length) return;

    try {
      var res = await fetch("/api/users/me", { credentials: "same-origin" });
      if (res.ok) {
        links.forEach(function (link) {
          link.textContent = "Личный кабинет";
          link.setAttribute("href", "/dashboard.html");
        });
      }
    } catch (e) {
      // сеть недоступна — оставляем ссылку на вход по умолчанию
    }
  });
})();

/* ============================================================
   Бургер-меню (мобильная навигация, ≤720px)
   ============================================================ */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var burger = document.getElementById("nav-burger");
    var menu = document.getElementById("nav-mobile-menu");
    if (!burger || !menu) return;

    function setOpen(open) {
      menu.classList.toggle("show", open);
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("nav-open", open);
    }

    burger.addEventListener("click", function () {
      setOpen(!menu.classList.contains("show"));
    });

    menu.querySelectorAll("a, button").forEach(function (item) {
      item.addEventListener("click", function () { setOpen(false); });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
  });
})();

/* ============================================================
   Шапка: плотнее фон и нижняя граница после начала прокрутки
   ============================================================ */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.querySelector("nav");
    if (!nav) return;
    var ticking = false;
    function update() {
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  });
})();

/* ============================================================
   Проявление блоков [data-reveal] при прокрутке.
   Класс на <html> ставится сразу (до отрисовки), и только если есть
   IntersectionObserver — без JS контент просто виден.
   ============================================================ */
(function () {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("js-scroll-reveal");

  document.addEventListener("DOMContentLoaded", function () {
    var items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (item) { io.observe(item); });
  });
})();
