/* DataLab — Dashboard Financeiro (camada de UI e gráficos) */
(function () {
  "use strict";

  var P = window.DKParser;
  var STORAGE_KEY = "dk-financeiro-dados";
  var THEME_KEY = "dk-tema";
  var MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  var state = {
    rows: [],          // todos os lançamentos normalizados
    meses: null,       // filtro de período: null = tudo
    fonte: "",         // nome do arquivo carregado
  };

  var charts = {};     // instâncias Chart.js por id

  // ---- helpers de formatação ----------------------------------------------

  var fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  var fmtBRLExato = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var fmtCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

  function moeda(v) { return fmtBRL.format(v); }
  function moedaCompacta(v) { return "R$ " + fmtCompact.format(v); }
  function pctStr(v, casas) { return v.toLocaleString("pt-BR", { maximumFractionDigits: casas == null ? 1 : casas }) + "%"; }

  function mesLabel(ym) { // "2025-08" → "ago/25"
    var p = ym.split("-");
    return MESES_PT[+p[1] - 1] + "/" + p[0].slice(2);
  }

  function mesLabelLongo(ym) { // "2025-08" → "ago/2025"
    var p = ym.split("-");
    return MESES_PT[+p[1] - 1] + "/" + p[0];
  }

  // ---- tokens de cor (lidos do CSS a cada render) --------------------------

  function tokens() {
    var cs = getComputedStyle(document.documentElement);
    function v(name) { return cs.getPropertyValue(name).trim(); }
    return {
      surface: v("--surface"), grid: v("--grid"), axis: v("--axis"),
      ink1: v("--ink-1"), ink2: v("--ink-2"), ink3: v("--ink-3"),
      s1: v("--s1"), s2: v("--s2"), s3: v("--s3"), s4: v("--s4"),
      s5: v("--s5"), s6: v("--s6"), s7: v("--s7"), other: v("--other"),
    };
  }

  function hexAlpha(hex, alpha) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  // ---- tema ----------------------------------------------------------------

  function temaAtual() {
    var salvo = null;
    try { salvo = localStorage.getItem(THEME_KEY); } catch (e) { /* file:// sem storage */ }
    if (salvo === "dark" || salvo === "light") return salvo;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    try { localStorage.setItem(THEME_KEY, tema); } catch (e) { /* ignora */ }
    if (state.rows.length) render();
  }

  // ---- persistência (opcional) --------------------------------------------

  function salvarDados() {
    try {
      var plain = state.rows.map(function (r) {
        return { data: r.data.toISOString().slice(0, 10), tipo: r.tipo, categoria: r.categoria, descricao: r.descricao, valor: r.valor };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fonte: state.fonte, rows: plain }));
    } catch (e) { /* storage indisponível: segue sem persistir */ }
  }

  function carregarDadosSalvos() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var obj = JSON.parse(raw);
      var norm = P.normalizeRows(obj.rows || []);
      if (!norm.rows.length) return false;
      state.rows = norm.rows;
      state.fonte = obj.fonte || "dados salvos";
      return true;
    } catch (e) { return false; }
  }

  function limparDados() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignora */ }
    state.rows = [];
    state.fonte = "";
    Object.keys(charts).forEach(function (k) { charts[k].destroy(); });
    charts = {};
    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("btn-upload").classList.add("hidden");
    document.getElementById("btn-clear").classList.add("hidden");
    esconderBanner();
  }

  // ---- banner de avisos ----------------------------------------------------

  function avisar(msg) {
    var b = document.getElementById("banner");
    b.textContent = msg;
    b.classList.remove("hidden");
  }

  function esconderBanner() {
    document.getElementById("banner").classList.add("hidden");
  }

  // ---- leitura de arquivos -------------------------------------------------

  function lerArquivo(file) {
    esconderBanner();
    var nome = (file.name || "").toLowerCase();
    if (nome.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: "greedy",
        complete: function (res) { aoImportar(res.data, file.name); },
        error: function () { avisar("Não foi possível ler o arquivo CSV. Verifique o formato e tente de novo."); },
      });
    } else if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
          var ws = escolherAba(wb);
          var raw = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
          aoImportar(raw, file.name);
        } catch (err) {
          avisar("Não foi possível ler a planilha. Salve como .xlsx e tente de novo.");
        }
      };
      reader.onerror = function () { avisar("Falha ao abrir o arquivo. Tente novamente."); };
      reader.readAsArrayBuffer(file);
    } else {
      avisar("Formato não suportado. Use um arquivo .xlsx, .xls ou .csv.");
    }
  }

  function escolherAba(wb) {
    // prioriza a aba "Lançamentos"; senão, a primeira que tenha as colunas mínimas
    var alvo = null;
    wb.SheetNames.forEach(function (nome) {
      if (!alvo && P.slug(nome).indexOf("lancamento") >= 0) alvo = nome;
    });
    if (!alvo) {
      wb.SheetNames.forEach(function (nome) {
        if (alvo) return;
        var ws = wb.Sheets[nome];
        var head = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 })[0] || [];
        var slugs = head.map(P.slug);
        if (slugs.indexOf("data") >= 0 && slugs.indexOf("valor") >= 0) alvo = nome;
      });
    }
    return wb.Sheets[alvo || wb.SheetNames[0]];
  }

  function aoImportar(rawRows, nomeArquivo) {
    var norm = P.normalizeRows(rawRows);
    if (!norm.rows.length) {
      avisar("Nenhum lançamento válido encontrado. Confira se a planilha segue o modelo (colunas Data, Tipo, Categoria, Valor) — use o template.xlsx como base.");
      return;
    }
    state.rows = norm.rows;
    state.fonte = nomeArquivo;
    state.meses = null;
    salvarDados();
    if (norm.ignoradas > 0) {
      avisar(norm.ignoradas + " linha(s) foram ignoradas por estarem incompletas ou fora do padrão. As demais foram importadas normalmente.");
    }
    mostrarDashboard();
  }

  function mostrarDashboard() {
    document.getElementById("empty-state").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    document.getElementById("btn-upload").classList.remove("hidden");
    document.getElementById("btn-clear").classList.remove("hidden");
    sincronizarFiltroUI();
    render();
  }

  // ---- render principal ----------------------------------------------------

  function render() {
    var t = tokens();
    var rows = P.filterByMonths(state.rows, state.meses);
    var mensal = P.monthlySummary(rows);
    var tot = P.totals(rows);
    var cats = P.despesasPorCategoria(rows, 5);

    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = t.ink3;

    renderPeriodo(mensal);
    renderKPIs(tot, mensal);
    renderFluxo(mensal, t);
    renderResultado(mensal, t);
    renderSaldo(mensal, t);
    renderCategorias(cats, t);
    renderTabela(mensal, tot);

    var info = document.getElementById("data-info");
    info.textContent = rows.length + " lançamentos" + (state.fonte ? " · " + state.fonte : "");
  }

  function renderPeriodo(mensal) {
    var el = document.getElementById("period-label");
    if (!mensal.length) { el.textContent = ""; return; }
    var a = mesLabelLongo(mensal[0].ym);
    var b = mesLabelLongo(mensal[mensal.length - 1].ym);
    el.textContent = a === b ? a : a + " – " + b;
  }

  // ---- KPIs ----------------------------------------------------------------

  function renderKPIs(tot, mensal) {
    document.getElementById("kpi-receita").textContent = moeda(tot.receita);
    document.getElementById("kpi-despesa").textContent = moeda(tot.despesa);
    document.getElementById("kpi-resultado").textContent = moeda(tot.resultado);
    document.getElementById("kpi-margem").textContent = tot.margem == null ? "—" : pctStr(tot.margem);

    var delta = P.deltaUltimoMes(mensal);
    var margemDelta = null;
    if (mensal.length >= 2) {
      var m1 = mensal[mensal.length - 1], m0 = mensal[mensal.length - 2];
      var ma = m1.receita > 0 ? (m1.resultado / m1.receita) * 100 : null;
      var mb = m0.receita > 0 ? (m0.resultado / m0.receita) * 100 : null;
      if (ma != null && mb != null) margemDelta = ma - mb;
    }

    setDelta("delta-receita", delta && delta.receita, true, delta && delta.mes, false);
    setDelta("delta-despesa", delta && delta.despesa, false, delta && delta.mes, false);
    setDelta("delta-resultado", delta && delta.resultado, true, delta && delta.mes, false);
    setDelta("delta-margem", margemDelta, true, delta && delta.mes, true);
  }

  function setDelta(id, valor, subirEBom, mes, emPontos) {
    var el = document.getElementById(id);
    el.textContent = "";
    el.className = "delta";
    if (valor == null || mes == null) return;

    var sobe = valor >= 0;
    var bom = sobe === subirEBom;
    el.classList.add(bom ? "good" : "bad");

    var arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = sobe ? "▲" : "▼";

    var pct = document.createElement("span");
    pct.className = "pct";
    var abs = Math.abs(valor);
    pct.textContent = emPontos
      ? abs.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " p.p."
      : pctStr(abs);

    var ref = document.createElement("span");
    ref.textContent = "em " + mesLabel(mes) + " vs mês anterior";

    el.appendChild(arrow);
    el.appendChild(pct);
    el.appendChild(ref);
  }

  // ---- gráficos ------------------------------------------------------------

  function baseTooltip(t) {
    return {
      backgroundColor: t.surface,
      titleColor: t.ink1,
      bodyColor: t.ink2,
      borderColor: t.grid,
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      usePointStyle: true,
      boxWidth: 8,
      boxHeight: 8,
      boxPadding: 4,
      callbacks: {
        label: function (ctx) {
          var v = ctx.parsed.y != null ? ctx.parsed.y : ctx.parsed;
          return " " + ctx.dataset.label + ": " + fmtBRLExato.format(v);
        },
      },
    };
  }

  function baseScales(t) {
    return {
      x: {
        grid: { display: false },
        border: { color: t.axis },
        ticks: { color: t.ink3 },
      },
      y: {
        grid: { color: t.grid, lineWidth: 1 },
        border: { display: false },
        ticks: {
          color: t.ink3,
          maxTicksLimit: 6,
          callback: function (v) { return moedaCompacta(v); },
        },
      },
    };
  }

  function upsert(id, config) {
    if (charts[id]) { charts[id].destroy(); }
    var ctx = document.getElementById("chart-" + id).getContext("2d");
    charts[id] = new Chart(ctx, config);
  }

  function renderFluxo(mensal, t) {
    upsert("fluxo", {
      type: "bar",
      data: {
        labels: mensal.map(function (m) { return mesLabel(m.ym); }),
        datasets: [
          {
            label: "Receitas",
            data: mensal.map(function (m) { return m.receita; }),
            backgroundColor: t.s1,
            maxBarThickness: 24,
            borderRadius: 4,
            borderSkipped: "start",
            categoryPercentage: 0.72,
            barPercentage: 0.9,
          },
          {
            label: "Despesas",
            data: mensal.map(function (m) { return m.despesa; }),
            backgroundColor: t.s2,
            maxBarThickness: 24,
            borderRadius: 4,
            borderSkipped: "start",
            categoryPercentage: 0.72,
            barPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: t.ink2, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 8, boxHeight: 8, padding: 16 },
          },
          tooltip: baseTooltip(t),
        },
        scales: baseScales(t),
      },
    });
  }

  function renderResultado(mensal, t) {
    upsert("resultado", {
      type: "bar",
      data: {
        labels: mensal.map(function (m) { return mesLabel(m.ym); }),
        datasets: [{
          label: "Resultado",
          data: mensal.map(function (m) { return m.resultado; }),
          backgroundColor: t.s3,
          maxBarThickness: 24,
          borderRadius: 4,
          borderSkipped: "start",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: baseTooltip(t),
        },
        scales: baseScales(t),
      },
    });
  }

  function renderSaldo(mensal, t) {
    var n = mensal.length;
    upsert("saldo", {
      type: "line",
      data: {
        labels: mensal.map(function (m) { return mesLabel(m.ym); }),
        datasets: [{
          label: "Saldo acumulado",
          data: mensal.map(function (m) { return m.saldoAcumulado; }),
          borderColor: t.s1,
          backgroundColor: hexAlpha(t.s1, 0.1),
          fill: true,
          borderWidth: 2,
          tension: 0,
          pointRadius: function (ctx) { return ctx.dataIndex === n - 1 ? 4 : 0; },
          pointBackgroundColor: t.s1,
          pointBorderColor: t.surface,
          pointBorderWidth: 2,
          pointHoverRadius: 5,
          pointHitRadius: 24,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: baseTooltip(t),
        },
        scales: baseScales(t),
      },
    });
  }

  function renderCategorias(cats, t) {
    var paleta = [t.s1, t.s2, t.s3, t.s4, t.s5];
    var cores = cats.itens.map(function (it, i) { return it.isOther ? t.other : paleta[i % paleta.length]; });

    upsert("categorias", {
      type: "doughnut",
      data: {
        labels: cats.itens.map(function (it) { return it.categoria; }),
        datasets: [{
          data: cats.itens.map(function (it) { return it.valor; }),
          backgroundColor: cores,
          borderColor: t.surface,
          borderWidth: 2,
          hoverOffset: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { display: false },
          tooltip: (function () {
            var tt = baseTooltip(t);
            tt.callbacks = {
              label: function (ctx) {
                var it = cats.itens[ctx.dataIndex];
                return " " + fmtBRLExato.format(it.valor) + " (" + pctStr(it.pct) + ")";
              },
            };
            return tt;
          })(),
        },
      },
    });

    // lista lateral: legenda + valores (a "tabela" do donut)
    var ul = document.getElementById("cat-list");
    ul.textContent = "";
    cats.itens.forEach(function (it, i) {
      var li = document.createElement("li");

      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = cores[i];

      var nome = document.createElement("span");
      nome.className = "name";
      nome.textContent = it.categoria;

      var spacer = document.createElement("span");
      spacer.className = "spacer";

      var val = document.createElement("span");
      val.className = "val";
      val.textContent = moeda(it.valor);

      var pct = document.createElement("span");
      pct.className = "pct";
      pct.textContent = pctStr(it.pct, 0);

      li.appendChild(sw); li.appendChild(nome); li.appendChild(spacer); li.appendChild(val); li.appendChild(pct);
      ul.appendChild(li);
    });
  }

  // ---- tabela --------------------------------------------------------------

  function renderTabela(mensal, tot) {
    var tbody = document.querySelector("#summary-table tbody");
    var tfoot = document.querySelector("#summary-table tfoot");
    tbody.textContent = "";
    tfoot.textContent = "";

    mensal.forEach(function (m) {
      var tr = document.createElement("tr");
      var margem = m.receita > 0 ? (m.resultado / m.receita) * 100 : null;
      addTd(tr, mesLabelLongo(m.ym));
      addTd(tr, moeda(m.receita));
      addTd(tr, moeda(m.despesa));
      addTd(tr, moeda(m.resultado), m.resultado < 0);
      addTd(tr, margem == null ? "—" : pctStr(margem), margem != null && margem < 0);
      addTd(tr, moeda(m.saldoAcumulado), m.saldoAcumulado < 0);
      tbody.appendChild(tr);
    });

    if (mensal.length > 1) {
      var tr = document.createElement("tr");
      addTd(tr, "Total");
      addTd(tr, moeda(tot.receita));
      addTd(tr, moeda(tot.despesa));
      addTd(tr, moeda(tot.resultado), tot.resultado < 0);
      addTd(tr, tot.margem == null ? "—" : pctStr(tot.margem), tot.margem != null && tot.margem < 0);
      addTd(tr, moeda(mensal[mensal.length - 1].saldoAcumulado));
      tfoot.appendChild(tr);
    }
  }

  function addTd(tr, texto, negativo) {
    var td = document.createElement("td");
    td.textContent = texto;
    if (negativo) td.classList.add("neg");
    tr.appendChild(td);
  }

  // ---- exportar PNG --------------------------------------------------------

  function exportarPNG(idChart, nomeArquivo) {
    var chart = charts[idChart];
    if (!chart) return;
    var t = tokens();
    var src = chart.canvas;
    var pad = 24;
    var out = document.createElement("canvas");
    out.width = src.width + pad * 2;
    out.height = src.height + pad * 2;
    var ctx = out.getContext("2d");
    ctx.fillStyle = t.surface;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, pad, pad);
    var a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = nomeArquivo + ".png";
    a.click();
  }

  // ---- filtros -------------------------------------------------------------

  function sincronizarFiltroUI() {
    document.querySelectorAll(".segmented button").forEach(function (btn) {
      var m = btn.getAttribute("data-meses");
      var ativo = (m === "" ? null : +m) === state.meses;
      btn.setAttribute("aria-pressed", ativo ? "true" : "false");
    });
  }

  // ---- eventos -------------------------------------------------------------

  function init() {
    document.documentElement.setAttribute("data-theme", temaAtual());

    var fileInput = document.getElementById("file-input");
    var dropzone = document.getElementById("dropzone");

    dropzone.addEventListener("click", function () { fileInput.click(); });
    dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    document.getElementById("btn-upload").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      if (fileInput.files.length) { lerArquivo(fileInput.files[0]); fileInput.value = ""; }
    });

    ["dragover", "dragenter"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add("dragover"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove("dragover"); });
    });
    dropzone.addEventListener("drop", function (e) {
      if (e.dataTransfer.files.length) lerArquivo(e.dataTransfer.files[0]);
    });

    // soltar o arquivo em qualquer ponto da página também funciona
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) lerArquivo(e.dataTransfer.files[0]);
    });

    document.getElementById("btn-sample").addEventListener("click", function () {
      aoImportar(window.DK_SAMPLE || [], "dados de exemplo");
    });

    document.getElementById("btn-clear").addEventListener("click", limparDados);

    document.getElementById("btn-theme").addEventListener("click", function () {
      aplicarTema(temaAtual() === "dark" ? "light" : "dark");
    });

    document.querySelectorAll(".segmented button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var m = btn.getAttribute("data-meses");
        state.meses = m === "" ? null : +m;
        sincronizarFiltroUI();
        render();
      });
    });

    document.querySelectorAll(".btn-export").forEach(function (btn) {
      btn.addEventListener("click", function () {
        exportarPNG(btn.getAttribute("data-chart"), btn.getAttribute("data-nome"));
      });
    });

    // parâmetros de URL: ?demo=1 carrega os dados de exemplo; ?theme=dark|light força o tema
    var params = new URLSearchParams(window.location.search);
    var temaForcado = params.get("theme");
    if (temaForcado === "dark" || temaForcado === "light") {
      document.documentElement.setAttribute("data-theme", temaForcado);
    }
    if (params.get("demo") === "1") {
      aoImportar(window.DK_SAMPLE || [], "dados de exemplo");
      return;
    }

    // reabre com os últimos dados, se existirem
    if (carregarDadosSalvos()) mostrarDashboard();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
