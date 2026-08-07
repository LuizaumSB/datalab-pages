/* ==========================================================================
   DataLab — camada de rastreamento (Meta Pixel / Google tag).
   DESATIVADA por padrão. Nada é carregado enquanto CONFIG.ativo for false e
   o visitante não tiver aceitado os cookies — exigência da LGPD.

   Para ativar:
     1. preencha META_PIXEL_ID e/ou GOOGLE_TAG_ID abaixo;
     2. mude ativo para true;
     3. confirme que a Política de Privacidade está publicada (site/privacidade/).
   ========================================================================== */
(function () {
  "use strict";

  var CONFIG = {
    ativo: false,              // ← trocar para true só depois dos passos acima
    META_PIXEL_ID: "",         // ex.: "1234567890"
    GOOGLE_TAG_ID: "",         // ex.: "G-XXXXXXX" ou "AW-XXXXXXX"
    chaveConsentimento: "dk-consentimento",
  };

  function consentiu() {
    try { return localStorage.getItem(CONFIG.chaveConsentimento) === "sim"; }
    catch (e) { return false; }
  }

  function registrar(valor) {
    try { localStorage.setItem(CONFIG.chaveConsentimento, valor); } catch (e) {}
  }

  // ---- carregadores (só rodam com consentimento) --------------------------

  function carregarMeta(id) {
    if (!id) return;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq("init", id);
    window.fbq("track", "PageView");
  }

  function carregarGoogle(id) {
    if (!id) return;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id);
  }

  function iniciar() {
    if (!CONFIG.ativo || !consentiu()) return;
    carregarMeta(CONFIG.META_PIXEL_ID);
    carregarGoogle(CONFIG.GOOGLE_TAG_ID);
    marcarCliquesDeCompra();
  }

  /** Clique em qualquer botão de compra vira evento de intenção. */
  function marcarCliquesDeCompra() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href*="pay.kiwify"]');
      if (!a) return;
      if (window.fbq) window.fbq("track", "InitiateCheckout");
      if (window.gtag) window.gtag("event", "begin_checkout");
    });
  }

  // ---- aviso de cookies ---------------------------------------------------

  function mostrarAviso() {
    if (!CONFIG.ativo || consentiu()) return;
    try { if (localStorage.getItem(CONFIG.chaveConsentimento) === "nao") return; } catch (e) {}

    var barra = document.createElement("div");
    barra.className = "cookie-bar";
    barra.setAttribute("role", "dialog");
    barra.setAttribute("aria-label", "Aviso de cookies");

    var txt = document.createElement("p");
    txt.textContent = "Usamos cookies para medir a eficácia dos nossos anúncios. Você decide.";

    var link = document.createElement("a");
    link.href = (location.pathname.split("/").length > 2 ? "../" : "") + "privacidade/";
    link.textContent = "Política de Privacidade";

    var aceitar = document.createElement("button");
    aceitar.className = "ok";
    aceitar.textContent = "Aceitar";
    aceitar.onclick = function () { registrar("sim"); barra.remove(); iniciar(); };

    var recusar = document.createElement("button");
    recusar.textContent = "Recusar";
    recusar.onclick = function () { registrar("nao"); barra.remove(); };

    txt.appendChild(document.createTextNode(" "));
    txt.appendChild(link);
    barra.appendChild(txt);
    barra.appendChild(recusar);
    barra.appendChild(aceitar);
    document.body.appendChild(barra);
  }

  document.addEventListener("DOMContentLoaded", function () {
    iniciar();
    mostrarAviso();
  });
})();
