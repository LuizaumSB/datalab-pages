/* DashboardKit — parser e agregações do Dashboard Financeiro.
   Sem dependência de DOM: também roda em Node para testes. */
(function (global) {
  "use strict";

  // ---- normalização de cabeçalhos -----------------------------------------

  function slug(s) {
    return String(s == null ? "" : s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  var HEADER_MAP = {
    data: "data", date: "data", dia: "data",
    tipo: "tipo", type: "tipo", movimento: "tipo",
    categoria: "categoria", category: "categoria",
    descricao: "descricao", description: "descricao", historico: "descricao",
    valor: "valor", value: "valor", montante: "valor", "valor (r$)": "valor",
  };

  var TIPO_RECEITA = { receita: 1, receitas: 1, entrada: 1, entradas: 1, credito: 1, income: 1 };
  var TIPO_DESPESA = { despesa: 1, despesas: 1, saida: 1, saidas: 1, debito: 1, gasto: 1, gastos: 1, expense: 1 };

  // ---- datas ---------------------------------------------------------------

  function excelSerialToDate(n) {
    // época do Excel (1900), com o bug do ano bissexto já embutido no offset
    var ms = Math.round((n - 25569) * 86400 * 1000);
    var d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function parseDateValue(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v)) {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }
    if (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000) {
      return excelSerialToDate(v);
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // dd/mm/aaaa
    if (m) {
      var ano = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      var d1 = new Date(ano, +m[2] - 1, +m[1]);
      return isNaN(d1) ? null : d1;
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // aaaa-mm-dd (ISO)
    if (m) {
      var d2 = new Date(+m[1], +m[2] - 1, +m[3]);
      return isNaN(d2) ? null : d2;
    }
    return null;
  }

  // ---- valores -------------------------------------------------------------

  function parseValor(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (v == null) return null;
    var s = String(v).replace(/[R$\s ]/g, "");
    if (!s) return null;
    var temVirgula = s.indexOf(",") >= 0;
    var temPonto = s.indexOf(".") >= 0;
    if (temVirgula && temPonto) {
      // o separador mais à direita é o decimal
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temVirgula) {
      s = s.replace(/\./g, "").replace(",", ".");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // ---- linhas --------------------------------------------------------------

  /**
   * Recebe linhas cruas (objetos com cabeçalhos originais) e devolve
   * { rows, ignoradas } com linhas normalizadas:
   * { data: Date, tipo: 'Receita'|'Despesa', categoria, descricao, valor > 0 }
   */
  function normalizeRows(rawRows) {
    var rows = [];
    var ignoradas = 0;
    for (var i = 0; i < rawRows.length; i++) {
      var raw = rawRows[i];
      var rec = {};
      for (var k in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
        var canon = HEADER_MAP[slug(k)];
        if (canon && rec[canon] === undefined) rec[canon] = raw[k];
      }

      var data = parseDateValue(rec.data);
      var valor = parseValor(rec.valor);
      var tipoSlug = slug(rec.tipo);
      var tipo = TIPO_RECEITA[tipoSlug] ? "Receita" : TIPO_DESPESA[tipoSlug] ? "Despesa" : null;
      if (!tipo && valor != null && valor < 0) tipo = "Despesa"; // fallback: sinal do valor

      if (!data || valor == null || valor === 0 || !tipo) { ignoradas++; continue; }

      rows.push({
        data: data,
        tipo: tipo,
        categoria: String(rec.categoria == null || rec.categoria === "" ? "Sem categoria" : rec.categoria).trim(),
        descricao: rec.descricao == null ? "" : String(rec.descricao).trim(),
        valor: Math.abs(valor),
      });
    }
    rows.sort(function (a, b) { return a.data - b.data; });
    return { rows: rows, ignoradas: ignoradas };
  }

  // ---- agregações ----------------------------------------------------------

  function ymKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function filterByMonths(rows, nMeses) {
    // nMeses = null → tudo; caso contrário, últimos N meses contados a partir
    // do mês do lançamento mais recente (não da data de hoje).
    if (!rows.length || nMeses == null) return rows.slice();
    var last = rows[rows.length - 1].data;
    var corte = new Date(last.getFullYear(), last.getMonth() - (nMeses - 1), 1);
    return rows.filter(function (r) { return r.data >= corte; });
  }

  function monthlySummary(rows) {
    var map = {};
    var ordem = [];
    rows.forEach(function (r) {
      var k = ymKey(r.data);
      if (!map[k]) { map[k] = { ym: k, receita: 0, despesa: 0 }; ordem.push(k); }
      if (r.tipo === "Receita") map[k].receita += r.valor;
      else map[k].despesa += r.valor;
    });
    var saldo = 0;
    return ordem.map(function (k) {
      var m = map[k];
      m.resultado = m.receita - m.despesa;
      saldo += m.resultado;
      m.saldoAcumulado = saldo;
      return m;
    });
  }

  function totals(rows) {
    var receita = 0, despesa = 0;
    rows.forEach(function (r) {
      if (r.tipo === "Receita") receita += r.valor; else despesa += r.valor;
    });
    var resultado = receita - despesa;
    return {
      receita: receita,
      despesa: despesa,
      resultado: resultado,
      margem: receita > 0 ? (resultado / receita) * 100 : null,
    };
  }

  function despesasPorCategoria(rows, topN) {
    var map = {};
    var total = 0;
    rows.forEach(function (r) {
      if (r.tipo !== "Despesa") return;
      map[r.categoria] = (map[r.categoria] || 0) + r.valor;
      total += r.valor;
    });
    var itens = Object.keys(map)
      .map(function (k) { return { categoria: k, valor: map[k] }; })
      .sort(function (a, b) { return b.valor - a.valor; });
    if (itens.length > topN) {
      var resto = itens.slice(topN).reduce(function (s, it) { return s + it.valor; }, 0);
      itens = itens.slice(0, topN);
      // agrupa a cauda em "Outras" para manter ≤ topN+1 fatias legíveis
      itens.push({ categoria: "Outras", valor: resto, isOther: true });
    }
    itens.forEach(function (it) { it.pct = total > 0 ? (it.valor / total) * 100 : 0; });
    return { itens: itens, total: total };
  }

  /** Variação % do último mês fechado vs mês anterior, por métrica. */
  function deltaUltimoMes(mensal) {
    if (mensal.length < 2) return null;
    var atual = mensal[mensal.length - 1];
    var anterior = mensal[mensal.length - 2];
    function pct(a, b) { return b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null; }
    return {
      mes: atual.ym,
      receita: pct(atual.receita, anterior.receita),
      despesa: pct(atual.despesa, anterior.despesa),
      resultado: pct(atual.resultado, anterior.resultado),
    };
  }

  global.DKParser = {
    slug: slug,
    parseDateValue: parseDateValue,
    parseValor: parseValor,
    normalizeRows: normalizeRows,
    filterByMonths: filterByMonths,
    monthlySummary: monthlySummary,
    totals: totals,
    despesasPorCategoria: despesasPorCategoria,
    deltaUltimoMes: deltaUltimoMes,
    ymKey: ymKey,
  };
})(typeof window !== "undefined" ? window : globalThis);
