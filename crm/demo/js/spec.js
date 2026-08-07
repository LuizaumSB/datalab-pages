/* DataLab — Dashboard CRM: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Cliente, Etapa, Origem, Valor */

/* Etapas canônicas do funil, na ordem em que acontecem. */
var CRM_ETAPAS = ["Lead", "Contato", "Proposta", "Negociação", "Ganho", "Perdido"];
var CRM_ABERTAS = ["Lead", "Contato", "Proposta", "Negociação"];

/* Sinônimos aceitos na coluna Etapa (o usuário escreve do jeito dele). */
var CRM_SINONIMOS = {
  lead: "Lead", leads: "Lead", novo: "Lead", "novo lead": "Lead", prospect: "Lead",
  oportunidade: "Lead", "sem contato": "Lead",
  contato: "Contato", contatado: "Contato", "em contato": "Contato",
  qualificacao: "Contato", qualificado: "Contato", "primeiro contato": "Contato",
  proposta: "Proposta", "proposta enviada": "Proposta", orcamento: "Proposta",
  "orcamento enviado": "Proposta", cotacao: "Proposta",
  negociacao: "Negociação", "em negociacao": "Negociação", negociando: "Negociação",
  followup: "Negociação", "follow up": "Negociação",
  ganho: "Ganho", ganha: "Ganho", ganhou: "Ganho", ganhos: "Ganho", fechado: "Ganho",
  fechada: "Ganho", vendido: "Ganho", venda: "Ganho", won: "Ganho", "fechado ganho": "Ganho",
  perdido: "Perdido", perdida: "Perdido", perdidos: "Perdido", perda: "Perdido",
  cancelado: "Perdido", cancelada: "Perdido", recusado: "Perdido", lost: "Perdido",
  "fechado perdido": "Perdido", "sem interesse": "Perdido",
};

function crmAberta(r) { return CRM_ABERTAS.indexOf(r.etapa) >= 0; }
function crmGanho(r) { return r.etapa === "Ganho"; }
function crmPerdido(r) { return r.etapa === "Perdido"; }

function crmConversao(ganhos, perdidos) {
  var fechados = ganhos + perdidos;
  return fechados > 0 ? (ganhos / fechados) * 100 : null;
}

window.DK_SPEC = {
  id: "crm",
  titulo: "Dashboard CRM",
  aba: "oportunidades",
  unidade: "oportunidades",
  msgVazio: "Nenhuma oportunidade válida encontrada. Confira se a planilha tem as colunas Data, Cliente, Etapa, Origem e Valor — use o template.xlsx como base.",

  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "data de entrada", "data da oportunidade", "criado em"], obrigatorio: true },
    cliente: { tipo: "texto", aceita: ["customer", "empresa", "contato", "lead", "prospect"], padrao: "Sem cliente" },
    etapa: { tipo: "texto", aceita: ["stage", "fase", "status", "situacao", "estagio", "funil"], padrao: "Lead" },
    origem: { tipo: "texto", aceita: ["source", "canal", "fonte", "midia", "como chegou"], padrao: "Não informada" },
    valor: { tipo: "numero", aceita: ["value", "total", "ticket", "valor do negocio", "valor da proposta", "receita"], positivo: true, naoZero: true, obrigatorio: true },
  },

  /* Padroniza a etapa escrita pelo usuário para uma das seis etapas do funil. */
  derivaLinha: function (linha) {
    var s = window.DK.slug(linha.etapa);
    if (CRM_SINONIMOS[s]) { linha.etapa = CRM_SINONIMOS[s]; return; }
    for (var i = 0; i < CRM_ETAPAS.length; i++) {
      if (window.DK.slug(CRM_ETAPAS[i]) === s) { linha.etapa = CRM_ETAPAS[i]; return; }
    }
    if (!linha.etapa) linha.etapa = "Lead";
  },

  metricasMensais: {
    oportunidades: function (rows) { return rows.length; },
    valorGerado: function (rows) { return window.DK.soma(rows, "valor"); },
    pipeline: function (rows) { return window.DK.somaSe(rows, "valor", crmAberta); },
    ganhos: function (rows) { return window.DK.contarSe(rows, crmGanho); },
    perdidos: function (rows) { return window.DK.contarSe(rows, crmPerdido); },
    valorGanho: function (rows) { return window.DK.somaSe(rows, "valor", crmGanho); },
    clientes: function (rows) { return window.DK.unicos(rows, "cliente"); },
  },

  posMensal: function (mensal, DK) {
    mensal.forEach(function (m) {
      m.conversao = crmConversao(m.ganhos, m.perdidos);
      m.ticketGanho = m.ganhos > 0 ? m.valorGanho / m.ganhos : 0;
    });
    DK.acumular(mensal, "valorGanho", "ganhoAcumulado");
  },

  kpis: [
    { label: "Oportunidades", metrica: "oportunidades", formato: "numero",
      calc: function (rows) { return rows.length; } },
    { label: "Valor em pipeline", metrica: "pipeline", formato: "moeda",
      calc: function (rows, mensal, DK) { return DK.somaSe(rows, "valor", crmAberta); } },
    { label: "Negócios ganhos", metrica: "ganhos", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.contarSe(rows, crmGanho); } },
    { label: "Taxa de conversão", metrica: "conversao", formato: "pct",
      calc: function (rows, mensal, DK) {
        return crmConversao(DK.contarSe(rows, crmGanho), DK.contarSe(rows, crmPerdido));
      },
      deltaPontos: true,
      deltaCalc: function (mensal) {
        if (mensal.length < 2) return null;
        var a = mensal[mensal.length - 1].conversao, b = mensal[mensal.length - 2].conversao;
        return a == null || b == null ? null : a - b;
      } },
  ],

  graficos: [
    { tipo: "ranking", titulo: "Funil por etapa", sub: "oportunidades perdidas ficam de fora",
      arquivo: "funil-por-etapa", formato: "numero",
      largura: "full", dimensao: "etapa", topN: 6, rotuloOutras: "Outras etapas", cor: "s1",
      rotuloValor: "Oportunidades",
      valor: function (r) { return crmPerdido(r) ? null : 1; } },
    { tipo: "barras", titulo: "Oportunidades por mês", arquivo: "oportunidades-por-mes", formato: "numero",
      series: [{ label: "Oportunidades", metrica: "oportunidades", cor: "s3" }] },
    { tipo: "donut", titulo: "Valor por origem", arquivo: "valor-por-origem", formato: "moeda",
      dimensao: "origem", topN: 6, rotuloOutras: "Outras",
      valor: function (r) { return r.valor; } },
    { tipo: "barras", titulo: "Valor ganho por mês", arquivo: "valor-ganho-por-mes", formato: "moeda",
      series: [{ label: "Valor ganho", metrica: "valorGanho", cor: "s1" }] },
    { tipo: "linha", titulo: "Valor ganho acumulado", arquivo: "valor-ganho-acumulado", formato: "moeda",
      serie: { label: "Acumulado", metrica: "ganhoAcumulado" }, cor: "s1" },
  ],

  tabela: {
    titulo: "Resumo mensal do funil",
    colunas: [
      { titulo: "Mês", formato: "texto", calc: function (m, DK) { return DK.mesLabelLongo(m.ym); } },
      { titulo: "Oportunidades", formato: "numero", calc: function (m) { return m.oportunidades; } },
      { titulo: "Pipeline", formato: "moeda", calc: function (m) { return m.pipeline; } },
      { titulo: "Ganhos", formato: "numero", calc: function (m) { return m.ganhos; } },
      { titulo: "Perdidos", formato: "numero", calc: function (m) { return m.perdidos; } },
      { titulo: "Valor ganho", formato: "moeda", calc: function (m) { return m.valorGanho; } },
      { titulo: "Conversão", formato: "pct", calc: function (m) { return m.conversao; } },
      { titulo: "Ganho acumulado", formato: "moeda", calc: function (m) { return m.ganhoAcumulado; } },
    ],
    total: function (rows, mensal, DK) {
      var ganhos = DK.contarSe(rows, crmGanho), perdidos = DK.contarSe(rows, crmPerdido);
      return ["Total", rows.length, DK.somaSe(rows, "valor", crmAberta), ganhos, perdidos,
              DK.somaSe(rows, "valor", crmGanho), crmConversao(ganhos, perdidos),
              mensal[mensal.length - 1].ganhoAcumulado];
    },
  },
};
