/* DataLab — Dashboard Marketing: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Canal, Investimento, Leads, Conversões, Receita */
window.DK_SPEC = {
  id: "marketing",
  titulo: "Dashboard Marketing",
  aba: "campanhas",
  unidade: "registros de campanha",
  msgVazio: "Nenhuma campanha válida encontrada. Confira se a planilha tem as colunas Data, Canal, Investimento, Leads, Conversões e Receita — use o template.xlsx como base.",

  /* A ordem dos campos abaixo é intencional: o build usa os cinco primeiros para
     montar a frase de ajuda do index.html, e nomes de chave não aceitam acento
     ("conversoes" apareceria sem cedilha na tela). A planilha continua na ordem
     oficial: Data, Canal, Investimento, Leads, Conversões, Receita. */
  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "periodo", "data da campanha"], obrigatorio: true },
    canal: { tipo: "texto", aceita: ["origem", "midia", "fonte", "channel", "campanha"], padrao: "Sem canal" },
    investimento: { tipo: "numero", aceita: ["investido", "custo", "verba", "gasto", "spend", "midia paga"], positivo: true, padrao: 0 },
    leads: { tipo: "numero", aceita: ["contatos", "oportunidades", "cadastros"], positivo: true, padrao: 0 },
    receita: { tipo: "numero", aceita: ["faturamento", "valor", "revenue", "vendas"], positivo: true, padrao: 0 },
    conversoes: { tipo: "numero", aceita: ["conversoes", "vendas fechadas", "clientes", "conversions"], positivo: true, padrao: 0 },
  },

  validaLinha: function (linha) {
    return linha.investimento > 0 || linha.leads > 0 || linha.receita > 0;
  },

  metricasMensais: {
    investimento: function (rows) { return window.DK.soma(rows, "investimento"); },
    leads: function (rows) { return window.DK.soma(rows, "leads"); },
    conversoes: function (rows) { return window.DK.soma(rows, "conversoes"); },
    receita: function (rows) { return window.DK.soma(rows, "receita"); },
  },

  posMensal: function (mensal, DK) {
    mensal.forEach(function (m) {
      m.cac = m.conversoes > 0 ? m.investimento / m.conversoes : null;
      m.roas = m.investimento > 0 ? m.receita / m.investimento : null;
    });
    DK.acumular(mensal, "receita", "acumulado");
  },

  kpis: [
    { label: "Investimento total", metrica: "investimento", formato: "moeda",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "investimento"); } },
    { label: "Leads gerados", metrica: "leads", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "leads"); } },
    { label: "CAC", metrica: "cac", formato: "moeda", subirEBom: false,
      calc: function (rows, mensal, DK) {
        var conv = DK.soma(rows, "conversoes");
        return conv > 0 ? DK.soma(rows, "investimento") / conv : null;
      } },
    { label: "ROAS", metrica: "roas", formato: "decimal",
      calc: function (rows, mensal, DK) {
        var inv = DK.soma(rows, "investimento");
        return inv > 0 ? DK.soma(rows, "receita") / inv : null;
      } },
  ],

  graficos: [
    { tipo: "barras", titulo: "Investimento x Receita", sub: "por mês", arquivo: "investimento-x-receita", formato: "moeda",
      series: [{ label: "Investimento", metrica: "investimento", cor: "s3" },
               { label: "Receita", metrica: "receita", cor: "s1" }] },
    { tipo: "barras", titulo: "Leads por mês", arquivo: "leads-por-mes", formato: "numero",
      series: [{ label: "Leads", metrica: "leads", cor: "s2" }] },
    { tipo: "linha", titulo: "Receita acumulada", arquivo: "receita-acumulada", formato: "moeda",
      serie: { label: "Acumulado", metrica: "acumulado" }, cor: "s1" },
    { tipo: "donut", titulo: "Investimento por canal", arquivo: "investimento-por-canal", formato: "moeda",
      dimensao: "canal", topN: 6, rotuloOutras: "Outros canais",
      valor: function (r) { return r.investimento; } },
    { tipo: "ranking", titulo: "Receita por canal", arquivo: "receita-por-canal", formato: "moeda",
      largura: "full", dimensao: "canal", topN: 6, rotuloOutras: "Outros canais", cor: "s1",
      rotuloValor: "Receita",
      valor: function (r) { return r.receita; } },
  ],

  tabela: {
    titulo: "Resumo mensal",
    colunas: [
      { titulo: "Mês", formato: "texto", calc: function (m, DK) { return DK.mesLabelLongo(m.ym); } },
      { titulo: "Investimento", formato: "moeda", calc: function (m) { return m.investimento; } },
      { titulo: "Leads", formato: "numero", calc: function (m) { return m.leads; } },
      { titulo: "Conversões", formato: "numero", calc: function (m) { return m.conversoes; } },
      { titulo: "Receita", formato: "moeda", calc: function (m) { return m.receita; } },
      { titulo: "CAC", formato: "moeda", calc: function (m) { return m.cac; } },
      { titulo: "ROAS", formato: "decimal", calc: function (m) { return m.roas; } },
      { titulo: "Receita acumulada", formato: "moeda", calc: function (m) { return m.acumulado; } },
    ],
    total: function (rows, mensal, DK) {
      var inv = DK.soma(rows, "investimento");
      var conv = DK.soma(rows, "conversoes");
      var rec = DK.soma(rows, "receita");
      return ["Total", inv, DK.soma(rows, "leads"), conv, rec,
              conv > 0 ? inv / conv : null,
              inv > 0 ? rec / inv : null,
              mensal[mensal.length - 1].acumulado];
    },
  },
};
