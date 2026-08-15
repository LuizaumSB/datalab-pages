/* DataLab — vitrine da home: alterna os painéis de nicho e revela os cartões.
   Tudo degrada bem: sem JS, o primeiro painel fica visível e os cartões aparecem. */
(function () {
  "use strict";

  var reduzir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // marca que há JS: só então o CSS esconde os cartões para animá-los
  document.documentElement.classList.add("js");

  // ---------------------------------------------------- vitrine (abas) --
  var abas = [].slice.call(document.querySelectorAll(".aba"));
  var paineis = [].slice.call(document.querySelectorAll(".painel"));
  var url = document.getElementById("url-mock");
  var timer = null, indice = 0, pausado = false;
  var INTERVALO = 5200;

  function mostrar(i) {
    indice = (i + paineis.length) % paineis.length;
    paineis.forEach(function (p, k) {
      var ativo = k === indice;
      p.classList.toggle("ativo", ativo);
      if (ativo) p.removeAttribute("aria-hidden");
      else p.setAttribute("aria-hidden", "true");
    });
    abas.forEach(function (a, k) {
      a.classList.toggle("ativa", k === indice);
      a.setAttribute("aria-pressed", k === indice ? "true" : "false");
    });
    if (url) url.textContent = "file:///dashboard-" + paineis[indice].dataset.nicho + "/index.html";
  }

  function reiniciarTimer() {
    if (timer) clearInterval(timer);
    if (reduzir || pausado || paineis.length < 2) return;
    timer = setInterval(function () { mostrar(indice + 1); }, INTERVALO);
  }

  abas.forEach(function (a, k) {
    a.addEventListener("click", function () {
      mostrar(k);
      pausado = true;          // escolha do visitante manda: para a rotação
      reiniciarTimer();
    });
  });

  var vitrine = document.querySelector(".vitrine");
  if (vitrine) {
    // não roda escondido nem em segundo plano
    vitrine.addEventListener("mouseenter", function () { if (timer) clearInterval(timer); });
    vitrine.addEventListener("mouseleave", reiniciarTimer);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (timer) clearInterval(timer); } else { reiniciarTimer(); }
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { e.isIntersecting ? reiniciarTimer() : (timer && clearInterval(timer)); });
      }, { threshold: 0.25 }).observe(vitrine);
    } else {
      reiniciarTimer();
    }
  }

  // ------------------------------------------- cartões da biblioteca --
  var cartoes = [].slice.call(document.querySelectorAll(".dash-card"));
  if (!cartoes.length) return;
  if (reduzir || !("IntersectionObserver" in window)) {
    cartoes.forEach(function (c) { c.classList.add("visivel"); });
    return;
  }
  var obs = new IntersectionObserver(function (ents) {
    ents.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = cartoes.indexOf(e.target);
      e.target.style.transitionDelay = (i % 4) * 60 + "ms";
      e.target.classList.add("visivel");
      obs.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
  cartoes.forEach(function (c) { obs.observe(c); });

  // rede de segurança: nada fica invisível se o observer não disparar
  setTimeout(function () {
    cartoes.forEach(function (c) { c.classList.add("visivel"); });
  }, 2500);
})();
