/* ==========================================================================
   DataLab — núcleo compartilhado dos dashboards.
   Sem dependência de DOM nas funções de dados (rodam em Node para testes).
   Cada dashboard fornece uma SPEC declarativa; este arquivo faz o resto.
   ========================================================================== */
(function (global) {
  "use strict";

  // ======================= 1. PARSING E NORMALIZAÇÃO =======================

  function slug(s) {
    return String(s == null ? "" : s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function excelSerialToDate(n) {
    var d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function parseData(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000) return excelSerialToDate(v);
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/))) {
      var ano = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      var d1 = new Date(ano, +m[2] - 1, +m[1]);
      return isNaN(d1) ? null : d1;
    }
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
      var d2 = new Date(+m[1], +m[2] - 1, +m[3]);
      return isNaN(d2) ? null : d2;
    }
    return null;
  }

  function parseNumero(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (v == null) return null;
    var s = String(v).replace(/[R$\s ]/g, "").replace("%", "");
    if (!s) return null;
    var temV = s.indexOf(",") >= 0, temP = s.indexOf(".") >= 0;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = s.replace(/\./g, "").replace(",", ".");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function parseTexto(v) {
    return v == null ? "" : String(v).trim();
  }

  var PARSERS = { data: parseData, numero: parseNumero, texto: parseTexto };

  /**
   * Normaliza linhas cruas conforme a spec.
   * spec.campos: { chave: { aceita: [sinônimos], tipo: 'data'|'numero'|'texto',
   *                         obrigatorio: bool, padrao: valor, positivo: bool } }
   */
  function normalizeRows(rawRows, spec) {
    var campos = spec.campos;
    var chaves = Object.keys(campos);

    // índice: slug do cabeçalho → chave canônica
    var indice = {};
    chaves.forEach(function (k) {
      indice[slug(k)] = k;
      (campos[k].aceita || []).forEach(function (a) { indice[slug(a)] = k; });
    });

    var rows = [], ignoradas = 0;
    for (var i = 0; i < rawRows.length; i++) {
      var raw = rawRows[i], rec = {};
      for (var h in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, h)) continue;
        var canon = indice[slug(h)];
        if (canon && rec[canon] === undefined) rec[canon] = raw[h];
      }

      var linha = {}, valida = true;
      for (var j = 0; j < chaves.length; j++) {
        var k = chaves[j], def = campos[k];
        var val = PARSERS[def.tipo || "texto"](rec[k]);
        if (val == null || val === "") {
          if (def.obrigatorio) { valida = false; break; }
          val = def.padrao !== undefined ? def.padrao : (def.tipo === "numero" ? null : "");
        }
        if (def.tipo === "numero" && val != null) {
          if (def.positivo) val = Math.abs(val);
          if (def.naoZero && val === 0) { valida = false; break; }
        }
        linha[k] = val;
      }

      if (valida && spec.validaLinha) valida = spec.validaLinha(linha, rec);
      if (!valida) { ignoradas++; continue; }
      if (spec.derivaLinha) spec.derivaLinha(linha);
      rows.push(linha);
    }
    rows.sort(function (a, b) { return a.data - b.data; });
    return { rows: rows, ignoradas: ignoradas };
  }

  // ======================= 2. AGREGAÇÕES =======================

  function ymKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function filterByMonths(rows, nMeses) {
    if (!rows.length || nMeses == null) return rows.slice();
    var last = rows[rows.length - 1].data;
    var corte = new Date(last.getFullYear(), last.getMonth() - (nMeses - 1), 1);
    return rows.filter(function (r) { return r.data >= corte; });
  }

  /** Agrupa por mês aplicando um redutor por métrica. metricas: { nome: fn(rows) } */
  function porMes(rows, metricas) {
    var grupos = {}, ordem = [];
    rows.forEach(function (r) {
      var k = ymKey(r.data);
      if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
      grupos[k].push(r);
    });
    return ordem.map(function (k) {
      var out = { ym: k, linhas: grupos[k].length };
      for (var m in metricas) out[m] = metricas[m](grupos[k]);
      return out;
    });
  }

  /** Acumula uma métrica ao longo dos meses (ex.: saldo acumulado). */
  function acumular(mensal, campo, destino) {
    var acc = 0;
    mensal.forEach(function (m) { acc += m[campo] || 0; m[destino] = acc; });
    return mensal;
  }

  /** Agrupa por uma dimensão textual, ordena desc e agrupa a cauda em "Outras". */
  function porDimensao(rows, campo, valorFn, topN, rotuloOutras) {
    var mapa = {}, total = 0;
    rows.forEach(function (r) {
      var chave = r[campo] || "Sem informação";
      var v = valorFn(r);
      if (v == null || !isFinite(v)) return;
      mapa[chave] = (mapa[chave] || 0) + v;
      total += v;
    });
    var itens = Object.keys(mapa)
      .map(function (k) { return { chave: k, valor: mapa[k] }; })
      .sort(function (a, b) { return b.valor - a.valor; });
    if (topN && itens.length > topN) {
      var resto = itens.slice(topN).reduce(function (s, it) { return s + it.valor; }, 0);
      itens = itens.slice(0, topN);
      itens.push({ chave: rotuloOutras || "Outras", valor: resto, isOutras: true });
    }
    itens.forEach(function (it) { it.pct = total > 0 ? (it.valor / total) * 100 : 0; });
    return { itens: itens, total: total };
  }

  function soma(rows, campo) {
    var s = 0;
    rows.forEach(function (r) { var v = r[campo]; if (typeof v === "number" && isFinite(v)) s += v; });
    return s;
  }

  function somaSe(rows, campo, filtro) {
    var s = 0;
    rows.forEach(function (r) { if (filtro(r)) { var v = r[campo]; if (typeof v === "number" && isFinite(v)) s += v; } });
    return s;
  }

  function contarSe(rows, filtro) {
    var n = 0;
    rows.forEach(function (r) { if (!filtro || filtro(r)) n++; });
    return n;
  }

  function unicos(rows, campo) {
    var set = {};
    rows.forEach(function (r) { if (r[campo]) set[r[campo]] = 1; });
    return Object.keys(set).length;
  }

  /** Variação percentual do último mês vs o anterior, por métrica. */
  function deltaUltimoMes(mensal, campos) {
    if (mensal.length < 2) return null;
    var a = mensal[mensal.length - 1], b = mensal[mensal.length - 2];
    var out = { mes: a.ym };
    campos.forEach(function (c) {
      out[c] = b[c] !== 0 && b[c] != null ? ((a[c] - b[c]) / Math.abs(b[c])) * 100 : null;
    });
    return out;
  }

  // ======================= 3. FORMATAÇÃO =======================

  var MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var fBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  var fBRLx = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var fCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  var fInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  var fDec = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

  var FMT = {
    moeda: function (v) { return v == null ? "—" : fBRL.format(v); },
    moedaExata: function (v) { return v == null ? "—" : fBRLx.format(v); },
    moedaCompacta: function (v) { return "R$ " + fCompact.format(v); },
    numero: function (v) { return v == null ? "—" : fInt.format(v); },
    decimal: function (v) { return v == null ? "—" : fDec.format(v); },
    compacto: function (v) { return v == null ? "—" : fCompact.format(v); },
    pct: function (v) { return v == null ? "—" : fDec.format(v) + "%"; },
  };

  function mesLabel(ym) { var p = ym.split("-"); return MESES_PT[+p[1] - 1] + "/" + p[0].slice(2); }
  function mesLabelLongo(ym) { var p = ym.split("-"); return MESES_PT[+p[1] - 1] + "/" + p[0]; }

  // ======================= 4. EXPORTAÇÃO =======================

  var api = {
    slug: slug, parseData: parseData, parseNumero: parseNumero,
    normalizeRows: normalizeRows,
    ymKey: ymKey, filterByMonths: filterByMonths, porMes: porMes, acumular: acumular,
    porDimensao: porDimensao, soma: soma, somaSe: somaSe, contarSe: contarSe, unicos: unicos,
    deltaUltimoMes: deltaUltimoMes,
    FMT: FMT, mesLabel: mesLabel, mesLabelLongo: mesLabelLongo, MESES_PT: MESES_PT,
  };

  global.DK = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
