/* DataLab — Dashboard Clínica: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Paciente, Especialidade, Convênio, Valor */

/* Atendimento pago direto pelo paciente (sem operadora). Compara pelo slug para
   aceitar "Particular", "particular", "PARTICULAR" e afins. */
function clinicaParticular(r) {
  return window.DK.slug(r["convênio"]) === "particular";
}

window.DK_SPEC = {
  id: "clinica",
  titulo: "Dashboard Clínica",
  aba: "atendimentos",
  unidade: "consultas",
  msgVazio: "Nenhum atendimento válido encontrado. Confira se a planilha tem as colunas Data, Paciente, Especialidade, Convênio e Valor — use o template.xlsx como base.",

  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "data do atendimento", "data da consulta"], obrigatorio: true },
    paciente: { tipo: "texto", aceita: ["nome", "nome do paciente", "cliente", "patient"], padrao: "Sem paciente" },
    especialidade: { tipo: "texto", aceita: ["servico", "procedimento", "area", "tipo de consulta", "specialty"], padrao: "Não informada" },
    convênio: { tipo: "texto", aceita: ["convenio", "plano", "plano de saude", "operadora", "forma de pagamento"], padrao: "Particular" },
    valor: { tipo: "numero", aceita: ["value", "total", "preco", "valor da consulta", "valor do atendimento", "receita"], positivo: true, naoZero: true, obrigatorio: true },
  },

  /* Padroniza só o rótulo do atendimento particular — é ele que separa receita
     própria de repasse de operadora. Os convênios aparecem como você escreveu. */
  derivaLinha: function (linha) {
    if (clinicaParticular(linha)) linha["convênio"] = "Particular";
  },

  metricasMensais: {
    faturamento: function (rows) { return window.DK.soma(rows, "valor"); },
    consultas: function (rows) { return rows.length; },
    pacientes: function (rows) { return window.DK.unicos(rows, "paciente"); },
    particular: function (rows) { return window.DK.somaSe(rows, "valor", clinicaParticular); },
  },

  posMensal: function (mensal, DK) {
    mensal.forEach(function (m) {
      m.ticket = m.consultas > 0 ? m.faturamento / m.consultas : 0;
      m.convenios = m.faturamento - m.particular;
    });
    DK.acumular(mensal, "faturamento", "acumulado");
  },

  kpis: [
    { label: "Faturamento", metrica: "faturamento", formato: "moeda",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "valor"); } },
    { label: "Consultas", metrica: "consultas", formato: "numero",
      calc: function (rows) { return rows.length; } },
    { label: "Pacientes únicos", metrica: "pacientes", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.unicos(rows, "paciente"); } },
    { label: "Ticket médio", metrica: "ticket", formato: "moeda",
      calc: function (rows, mensal, DK) { return rows.length ? DK.soma(rows, "valor") / rows.length : null; } },
  ],

  graficos: [
    { tipo: "barras", titulo: "Faturamento mensal", arquivo: "faturamento-mensal", formato: "moeda",
      series: [{ label: "Faturamento", metrica: "faturamento", cor: "s1" }] },
    { tipo: "barras", titulo: "Consultas por mês", arquivo: "consultas-por-mes", formato: "numero",
      series: [{ label: "Consultas", metrica: "consultas", cor: "s3" }] },
    { tipo: "donut", titulo: "Faturamento por especialidade", arquivo: "faturamento-por-especialidade", formato: "moeda",
      dimensao: "especialidade", topN: 6, rotuloOutras: "Outras",
      valor: function (r) { return r.valor; } },
    { tipo: "linha", titulo: "Faturamento acumulado", arquivo: "faturamento-acumulado", formato: "moeda",
      serie: { label: "Acumulado", metrica: "acumulado" }, cor: "s1" },
    { tipo: "ranking", titulo: "Faturamento por convênio", sub: "particular incluído",
      arquivo: "faturamento-por-convenio", formato: "moeda",
      largura: "full", dimensao: "convênio", topN: 8, rotuloOutras: "Outros", cor: "s1",
      rotuloValor: "Faturamento",
      valor: function (r) { return r.valor; } },
  ],

  tabela: {
    titulo: "Resumo mensal dos atendimentos",
    colunas: [
      { titulo: "Mês", formato: "texto", calc: function (m, DK) { return DK.mesLabelLongo(m.ym); } },
      { titulo: "Consultas", formato: "numero", calc: function (m) { return m.consultas; } },
      { titulo: "Pacientes", formato: "numero", calc: function (m) { return m.pacientes; } },
      { titulo: "Faturamento", formato: "moeda", calc: function (m) { return m.faturamento; } },
      { titulo: "Ticket médio", formato: "moeda", calc: function (m) { return m.ticket; } },
      { titulo: "Particular", formato: "moeda", calc: function (m) { return m.particular; } },
      { titulo: "Convênios", formato: "moeda", calc: function (m) { return m.convenios; } },
      { titulo: "Acumulado", formato: "moeda", calc: function (m) { return m.acumulado; } },
    ],
    total: function (rows, mensal, DK) {
      var fat = DK.soma(rows, "valor");
      var particular = DK.somaSe(rows, "valor", clinicaParticular);
      return ["Total", rows.length, DK.unicos(rows, "paciente"), fat,
              rows.length ? fat / rows.length : 0, particular, fat - particular,
              mensal[mensal.length - 1].acumulado];
    },
  },
};
