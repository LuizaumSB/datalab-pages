/* ==========================================================================
   DataLab — motor de interface dos dashboards.
   Lê window.DK_SPEC e monta upload, filtros, KPIs, gráficos, tabela, tema e
   exportação. Nada aqui é específico de um nicho.
   ========================================================================== */
(function () {
  "use strict";

  var DK = window.DK;
  var SPEC = window.DK_SPEC;
  var THEME_KEY = "dk-tema";
  var STORAGE_KEY = "dk-dados-" + (SPEC && SPEC.id ? SPEC.id : "generico");

  var state = { rows: [], meses: null, fonte: "" };
  var charts = {};

  // ---------------------------------------------------------------- tokens --

  function tokens() {
    var cs = getComputedStyle(document.documentElement);
    var t = {};
    ["surface", "grid", "axis", "ink-1", "ink-2", "ink-3",
     "s1", "s2", "s3", "s4", "s5", "s6", "s7", "other"].forEach(function (n) {
      t[n.replace("-", "")] = cs.getPropertyValue("--" + n).trim();
    });
    t.ink1 = t.ink1 || cs.getPropertyValue("--ink-1").trim();
    t.ink2 = t.ink2 || cs.getPropertyValue("--ink-2").trim();
    t.ink3 = t.ink3 || cs.getPropertyValue("--ink-3").trim();
    return t;
  }

  function serieCor(t, i) {
    return [t.s1, t.s2, t.s3, t.s4, t.s5, t.s7, t.other][i % 7];
  }

  function hexAlpha(hex, alpha) {
    var h = (hex || "#000").replace("#", "");
    if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  // ------------------------------------------------------------------ tema --

  function temaAtual() {
    var salvo = null;
    try { salvo = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (salvo === "dark" || salvo === "light") return salvo;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    try { localStorage.setItem(THEME_KEY, tema); } catch (e) {}
    if (state.rows.length) render();
  }

  // ----------------------------------------------------------- persistência --

  function salvar() {
    try {
      var plain = state.rows.map(function (r) {
        var o = {};
        for (var k in r) o[k] = r[k] instanceof Date ? r[k].toISOString().slice(0, 10) : r[k];
        return o;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fonte: state.fonte, rows: plain }));
    } catch (e) {}
  }

  function carregarSalvos() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var obj = JSON.parse(raw);
      var norm = DK.normalizeRows(obj.rows || [], SPEC);
      if (!norm.rows.length) return false;
      state.rows = norm.rows;
      state.fonte = obj.fonte || "dados salvos";
      return true;
    } catch (e) { return false; }
  }

  function limpar() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    state.rows = []; state.fonte = "";
    Object.keys(charts).forEach(function (k) { charts[k].destroy(); });
    charts = {};
    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("btn-upload").classList.add("hidden");
    document.getElementById("btn-clear").classList.add("hidden");
    esconderBanner();
  }

  // ---------------------------------------------------------------- avisos --

  function avisar(msg) {
    var b = document.getElementById("banner");
    b.textContent = msg;
    b.classList.remove("hidden");
  }
  function esconderBanner() { document.getElementById("banner").classList.add("hidden"); }

  // ------------------------------------------------------------- importação --

  function lerArquivo(file) {
    esconderBanner();
    var nome = (file.name || "").toLowerCase();
    if (nome.endsWith(".csv")) {
      Papa.parse(file, {
        header: true, skipEmptyLines: "greedy",
        complete: function (res) { aoImportar(res.data, file.name); },
        error: function () { avisar("Não foi possível ler o arquivo CSV. Verifique o formato e tente de novo."); },
      });
    } else if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
          aoImportar(XLSX.utils.sheet_to_json(escolherAba(wb), { raw: true, defval: null }), file.name);
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
    var alvo = null, aba = DK.slug(SPEC.aba || "");
    wb.SheetNames.forEach(function (n) { if (!alvo && aba && DK.slug(n).indexOf(aba) >= 0) alvo = n; });
    if (!alvo) {
      var obrig = Object.keys(SPEC.campos).filter(function (k) { return SPEC.campos[k].obrigatorio; });
      wb.SheetNames.forEach(function (n) {
        if (alvo) return;
        var head = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, range: 0 })[0] || [];
        var slugs = head.map(DK.slug);
        var temTodas = obrig.every(function (k) {
          var aceitos = [k].concat(SPEC.campos[k].aceita || []).map(DK.slug);
          return aceitos.some(function (a) { return slugs.indexOf(a) >= 0; });
        });
        if (temTodas) alvo = n;
      });
    }
    return wb.Sheets[alvo || wb.SheetNames[0]];
  }

  function aoImportar(rawRows, nomeArquivo) {
    var norm = DK.normalizeRows(rawRows, SPEC);
    if (!norm.rows.length) {
      avisar(SPEC.msgVazio || "Nenhum registro válido encontrado. Confira se a planilha segue o modelo — use o template.xlsx como base.");
      return;
    }
    state.rows = norm.rows; state.fonte = nomeArquivo; state.meses = null;
    salvar();
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
    sincronizarFiltro();
    render();
  }

  // ------------------------------------------------------------ construção --

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  /** Cria os cartões de KPI e os cards de gráfico conforme a spec. */
  function montarEsqueleto() {
    var gridKpi = document.getElementById("kpi-grid");
    gridKpi.textContent = "";
    SPEC.kpis.forEach(function (k, i) {
      var card = el("div", "kpi");
      card.appendChild(el("div", "label", k.label));
      card.appendChild(el("div", "value", "—")).id = "kpi-" + i;
      card.appendChild(el("div", "delta")).id = "delta-" + i;
      gridKpi.appendChild(card);
    });

    var area = document.getElementById("charts-area");
    area.textContent = "";
    var linha = null;
    SPEC.graficos.forEach(function (g, i) {
      if (g.largura === "full") {
        linha = null;
        area.appendChild(cardGrafico(g, i));
      } else {
        if (!linha) { linha = el("div", "grid-2"); area.appendChild(linha); }
        linha.appendChild(cardGrafico(g, i));
        if (linha.children.length === 2) linha = null;
      }
    });
  }

  function cardGrafico(g, i) {
    var card = el("div", "card");
    var head = el("div", "card-head");
    head.appendChild(el("h2", null, g.titulo));
    if (g.sub) head.appendChild(el("span", "sub", g.sub));
    head.appendChild(el("div", "spacer"));
    var btn = el("button", "btn ghost icon-btn btn-export", "⬇");
    btn.title = "Exportar PNG";
    btn.setAttribute("aria-label", "Exportar gráfico como PNG");
    btn.setAttribute("data-chart", String(i));
    btn.setAttribute("data-nome", (g.arquivo || ("grafico-" + i)));
    head.appendChild(btn);
    card.appendChild(head);

    if (g.tipo === "donut") {
      var layout = el("div", "donut-layout");
      var wrap = el("div", "donut-wrap");
      var cv = el("canvas"); cv.id = "chart-" + i;
      cv.setAttribute("role", "img");
      cv.setAttribute("aria-label", g.titulo);
      wrap.appendChild(cv); layout.appendChild(wrap);
      var ul = el("ul", "cat-list"); ul.id = "list-" + i;
      layout.appendChild(ul); card.appendChild(layout);
    } else {
      var w = el("div", "chart-wrap" + (g.alto ? " tall" : ""));
      var c = el("canvas"); c.id = "chart-" + i;
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", g.titulo);
      w.appendChild(c); card.appendChild(w);
    }
    return card;
  }

  // ---------------------------------------------------------------- render --

  function render() {
    var t = tokens();
    var rows = DK.filterByMonths(state.rows, state.meses);
    var mensal = DK.porMes(rows, SPEC.metricasMensais);
    if (SPEC.posMensal) SPEC.posMensal(mensal, DK);

    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = t.ink3;

    renderPeriodo(mensal);
    renderKPIs(rows, mensal);
    SPEC.graficos.forEach(function (g, i) { renderGrafico(g, i, rows, mensal, t); });
    renderTabela(rows, mensal);

    var info = document.getElementById("data-info");
    info.textContent = rows.length + " " + (SPEC.unidade || "registros") + (state.fonte ? " · " + state.fonte : "");
  }

  function renderPeriodo(mensal) {
    var e = document.getElementById("period-label");
    if (!mensal.length) { e.textContent = ""; return; }
    var a = DK.mesLabelLongo(mensal[0].ym), b = DK.mesLabelLongo(mensal[mensal.length - 1].ym);
    e.textContent = a === b ? a : a + " – " + b;
  }

  function renderKPIs(rows, mensal) {
    var campos = SPEC.kpis.map(function (k) { return k.metrica; }).filter(Boolean);
    var delta = DK.deltaUltimoMes(mensal, campos);

    SPEC.kpis.forEach(function (k, i) {
      var valor = k.calc(rows, mensal, DK);
      document.getElementById("kpi-" + i).textContent = (DK.FMT[k.formato] || DK.FMT.numero)(valor);

      var d = null, emPontos = false;
      if (k.deltaCalc) { d = k.deltaCalc(mensal, DK); emPontos = k.deltaPontos; }
      else if (k.metrica && delta) d = delta[k.metrica];
      setDelta("delta-" + i, d, k.subirEBom !== false, delta && delta.mes, emPontos);
    });
  }

  function setDelta(id, valor, subirEBom, mes, emPontos) {
    var e = document.getElementById(id);
    e.textContent = ""; e.className = "delta";
    if (valor == null || mes == null || !isFinite(valor)) return;
    var sobe = valor >= 0;
    e.classList.add(sobe === subirEBom ? "good" : "bad");
    e.appendChild(el("span", "arrow", sobe ? "▲" : "▼"));
    var abs = Math.abs(valor);
    e.appendChild(el("span", "pct", emPontos
      ? abs.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " p.p."
      : DK.FMT.pct(abs)));
    e.appendChild(el("span", null, "em " + DK.mesLabel(mes) + " vs mês anterior"));
  }

  // --------------------------------------------------------------- gráficos --

  function baseTooltip(t, fmt) {
    var f = DK.FMT[fmt] || DK.FMT.numero;
    return {
      backgroundColor: t.surface, titleColor: t.ink1, bodyColor: t.ink2,
      borderColor: t.grid, borderWidth: 1, padding: 10, cornerRadius: 8,
      usePointStyle: true, boxWidth: 8, boxHeight: 8, boxPadding: 4,
      callbacks: {
        label: function (ctx) {
          var v = ctx.parsed.y != null ? ctx.parsed.y : (ctx.parsed.x != null ? ctx.parsed.x : ctx.parsed);
          return " " + ctx.dataset.label + ": " + f(v);
        },
      },
    };
  }

  function escalas(t, fmt, horizontal) {
    var f = DK.FMT[fmt] || DK.FMT.numero;
    var valores = {
      grid: { color: t.grid, lineWidth: 1 }, border: { display: false },
      ticks: { color: t.ink3, maxTicksLimit: 6, callback: function (v) { return f(v); } },
    };
    var categorias = { grid: { display: false }, border: { color: t.axis }, ticks: { color: t.ink3 } };
    return horizontal ? { x: valores, y: categorias } : { x: categorias, y: valores };
  }

  function upsert(i, config) {
    if (charts[i]) charts[i].destroy();
    charts[i] = new Chart(document.getElementById("chart-" + i).getContext("2d"), config);
  }

  function renderGrafico(g, i, rows, mensal, t) {
    var labels = mensal.map(function (m) { return DK.mesLabel(m.ym); });
    var fmt = g.formato || "moeda";
    var comum = {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: baseTooltip(t, fmt) },
      scales: escalas(t, fmt, false),
    };

    if (g.tipo === "barras") {
      var ds = g.series.map(function (s, k) {
        return {
          label: s.label,
          data: mensal.map(function (m) { return m[s.metrica]; }),
          backgroundColor: s.cor ? t[s.cor] : serieCor(t, k),
          maxBarThickness: 24, borderRadius: 4, borderSkipped: "start",
          categoryPercentage: g.series.length > 1 ? 0.72 : 0.9,
          barPercentage: 0.9,
        };
      });
      var opt = JSON.parse(JSON.stringify({ scales: comum.scales }));
      upsert(i, {
        type: "bar",
        data: { labels: labels, datasets: ds },
        options: Object.assign({}, comum, {
          plugins: {
            legend: g.series.length > 1 ? {
              position: "bottom",
              labels: { color: t.ink2, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 8, boxHeight: 8, padding: 16 },
            } : { display: false },
            tooltip: baseTooltip(t, fmt),
          },
        }),
      });

    } else if (g.tipo === "linha") {
      var n = mensal.length;
      var cor = g.cor ? t[g.cor] : t.s1;
      upsert(i, {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            label: g.serie.label,
            data: mensal.map(function (m) { return m[g.serie.metrica]; }),
            borderColor: cor, backgroundColor: hexAlpha(cor, 0.1), fill: true,
            borderWidth: 2, tension: 0,
            pointRadius: function (c) { return c.dataIndex === n - 1 ? 4 : 0; },
            pointBackgroundColor: cor, pointBorderColor: t.surface, pointBorderWidth: 2,
            pointHoverRadius: 5, pointHitRadius: 24,
          }],
        },
        options: comum,
      });

    } else if (g.tipo === "ranking") {
      var dim = DK.porDimensao(rows, g.dimensao, g.valor, g.topN || 6, g.rotuloOutras);
      upsert(i, {
        type: "bar",
        data: {
          labels: dim.itens.map(function (it) { return it.chave; }),
          datasets: [{
            label: g.rotuloValor || "Total",
            data: dim.itens.map(function (it) { return it.valor; }),
            backgroundColor: dim.itens.map(function (it) { return it.isOutras ? t.other : (g.cor ? t[g.cor] : t.s1); }),
            maxBarThickness: 20, borderRadius: 4, borderSkipped: "start",
          }],
        },
        options: Object.assign({}, comum, {
          indexAxis: "y",
          scales: escalas(t, fmt, true),
          interaction: { mode: "nearest", intersect: true },
          plugins: { legend: { display: false }, tooltip: baseTooltip(t, fmt) },
        }),
      });

    } else if (g.tipo === "donut") {
      var d = DK.porDimensao(rows, g.dimensao, g.valor, g.topN || 5, g.rotuloOutras);
      var cores = d.itens.map(function (it, k) { return it.isOutras ? t.other : serieCor(t, k); });
      var f = DK.FMT[fmt] || DK.FMT.numero;
      upsert(i, {
        type: "doughnut",
        data: {
          labels: d.itens.map(function (it) { return it.chave; }),
          datasets: [{ data: d.itens.map(function (it) { return it.valor; }),
                       backgroundColor: cores, borderColor: t.surface, borderWidth: 2, hoverOffset: 5 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "62%",
          plugins: {
            legend: { display: false },
            tooltip: Object.assign(baseTooltip(t, fmt), {
              callbacks: {
                label: function (ctx) {
                  var it = d.itens[ctx.dataIndex];
                  return " " + f(it.valor) + " (" + DK.FMT.pct(it.pct) + ")";
                },
              },
            }),
          },
        },
      });

      var ul = document.getElementById("list-" + i);
      ul.textContent = "";
      d.itens.forEach(function (it, k) {
        var li = el("li");
        var sw = el("span", "swatch"); sw.style.background = cores[k];
        li.appendChild(sw);
        li.appendChild(el("span", "name", it.chave));
        li.appendChild(el("span", "spacer"));
        li.appendChild(el("span", "val", f(it.valor)));
        li.appendChild(el("span", "pct", Math.round(it.pct) + "%"));
        ul.appendChild(li);
      });
    }
  }

  // ---------------------------------------------------------------- tabela --

  function renderTabela(rows, mensal) {
    var thead = document.querySelector("#summary-table thead");
    var tbody = document.querySelector("#summary-table tbody");
    var tfoot = document.querySelector("#summary-table tfoot");
    thead.textContent = ""; tbody.textContent = ""; tfoot.textContent = "";

    var cols = SPEC.tabela.colunas;
    var trh = el("tr");
    cols.forEach(function (c) { trh.appendChild(el("th", null, c.titulo)); });
    thead.appendChild(trh);

    mensal.forEach(function (m) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var v = c.calc(m, DK);
        var td = el("td", null, c.formato === "texto" ? v : (DK.FMT[c.formato] || DK.FMT.numero)(v));
        if (c.negativoSe && c.negativoSe(m)) td.classList.add("neg");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    if (mensal.length > 1 && SPEC.tabela.total) {
      var tr = el("tr");
      SPEC.tabela.total(rows, mensal, DK).forEach(function (cel, k) {
        var col = cols[k];
        tr.appendChild(el("td", null, cel == null ? "" :
          (typeof cel === "string" ? cel : (DK.FMT[col.formato] || DK.FMT.numero)(cel))));
      });
      tfoot.appendChild(tr);
    }
  }

  // ------------------------------------------------------------- exportação --

  function exportarPNG(i, nome) {
    var chart = charts[i];
    if (!chart) return;
    var t = tokens(), src = chart.canvas, pad = 24;
    var out = document.createElement("canvas");
    out.width = src.width + pad * 2; out.height = src.height + pad * 2;
    var ctx = out.getContext("2d");
    ctx.fillStyle = t.surface; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, pad, pad);
    var a = document.createElement("a");
    a.href = out.toDataURL("image/png"); a.download = nome + ".png"; a.click();
  }

  // ---------------------------------------------------------------- filtros --

  function sincronizarFiltro() {
    document.querySelectorAll(".segmented button").forEach(function (b) {
      var m = b.getAttribute("data-meses");
      b.setAttribute("aria-pressed", ((m === "" ? null : +m) === state.meses) ? "true" : "false");
    });
  }

  // ----------------------------------------------------------------- início --

  function init() {
    if (!SPEC) { console.error("DK_SPEC ausente"); return; }
    document.documentElement.setAttribute("data-theme", temaAtual());
    document.title = SPEC.titulo + " — DataLab";
    var h1 = document.querySelector(".brand h1");
    if (h1) h1.textContent = SPEC.titulo;
    montarEsqueleto();

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
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) lerArquivo(e.dataTransfer.files[0]);
    });

    var btnSample = document.getElementById("btn-sample");
    if (btnSample) btnSample.addEventListener("click", function () {
      aoImportar(window.DK_SAMPLE || [], "dados de exemplo");
    });
    document.getElementById("btn-clear").addEventListener("click", limpar);
    document.getElementById("btn-theme").addEventListener("click", function () {
      aplicarTema(temaAtual() === "dark" ? "light" : "dark");
    });
    document.querySelectorAll(".segmented button").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-meses");
        state.meses = m === "" ? null : +m;
        sincronizarFiltro(); render();
      });
    });
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".btn-export");
      if (btn) exportarPNG(btn.getAttribute("data-chart"), btn.getAttribute("data-nome"));
    });

    var params = new URLSearchParams(window.location.search);
    var tema = params.get("theme");
    if (tema === "dark" || tema === "light") document.documentElement.setAttribute("data-theme", tema);
    if (params.get("demo") === "1") { aoImportar(window.DK_SAMPLE || [], "dados de exemplo"); return; }

    if (carregarSalvos()) mostrarDashboard();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
