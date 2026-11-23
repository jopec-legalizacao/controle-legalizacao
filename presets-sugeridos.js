// Presets iniciais sugeridos — carregados pelo botão "Carregar presets sugeridos".
// Depois de carregados, edite tudo pelo Cardápio de etapas no próprio app.
(function(){
const ORC = { nome: "Orçamento enviado e aprovado", descricao: "Envio do orçamento e confirmação do cliente/pagamento dos honorários.", prazo: "Depende do cliente" };
const DOCS = { nome: "Coleta de documentos e ficha cadastral", prazo: "Depende do cliente" };
const CPL = { nome: "Consulta Prévia de Local (CPL)", descricao: "Prefeitura confirma se o endereço comporta as atividades.", prazo: "1 a 5 dias úteis" };
const VIAB = { nome: "Viabilidade e DBE", prazo: "2 a 5 dias úteis" };
const ASS = { nome: "Redação do instrumento e coleta de assinaturas", prazo: "2 a 4 dias úteis" };
const JUC = { nome: "Protocolo na JUCERJA", descricao: "Guia da JUCERJA enviada ao cliente; análise e registro.", prazo: "3 a 7 dias úteis" };
const RCPJ = { nome: "Registro no RCPJ", prazo: "5 a 15 dias úteis" };
const CNPJ = { nome: "Atualização / emissão do CNPJ (Receita Federal)", prazo: "1 a 3 dias úteis" };
const ALV = { nome: "Inscrição Municipal e Alvará", descricao: "Guia do Alvará enviada ao cliente.", prazo: "3 a 5 dias úteis" };
const VISA = { nome: "Vigilância Sanitária / Bombeiros (se aplicável)", prazo: "Variável" };
const ENT = { nome: "Entrega dos documentos ao cliente", prazo: "1 dia útil" };
window.LEG_PRESETS_SUGERIDOS = [
  { nome: "Alteração Contratual — Inclusão de Atividades", cor: "#1f6feb",
    descricao: "Baseado no orçamento Levi & Russo (15 a 25 dias úteis).",
    etapas: [ORC, CPL,
      { nome: "Viabilidade e Redação Contratual", descricao: "Instrumento de alteração com inclusão de atividades e coleta das assinaturas.", prazo: "2 a 4 dias úteis" },
      JUC,
      { nome: "Atualização do CNPJ e Alvará", descricao: "Sincronização na Receita, guia do Alvará e emissão do novo Alvará.", prazo: "3 a 5 dias úteis" },
      { nome: "Regularização Complementar (Vigilância Sanitária)", descricao: "Análise conforme endereço e atividades, após finalizar a alteração.", prazo: "Variável" },
      ENT ] },
  { nome: "Alteração Contratual — Sócios / Capital / Administração", cor: "#0969da",
    descricao: "Entrada/saída de sócio, aumento de capital, troca de administrador, nome.",
    etapas: [ORC, DOCS, VIAB, ASS, JUC, CNPJ, { nome: "Atualização da Inscrição Municipal" }, ENT] },
  { nome: "Alteração de Endereço", cor: "#bf8700", descricao: "Transferência de endereço.",
    etapas: [ORC, { ...CPL, nome: "Consulta Prévia de Local (novo endereço)" }, VIAB, ASS, JUC, CNPJ, { nome: "Novo Alvará de Funcionamento", prazo: "3 a 5 dias úteis" }, VISA, ENT] },
  { nome: "Abertura de Empresa — JUCERJA (LTDA/SLU)", cor: "#2da44e", descricao: "Abertura de sociedade empresária.",
    etapas: [ORC, DOCS, CPL, VIAB, { nome: "Redação do Contrato Social e assinaturas" }, JUC, CNPJ, ALV, { nome: "Inscrição Estadual (se aplicável)" }, VISA, ENT] },
  { nome: "Abertura — RCPJ (Sociedade Simples / Associação / Advocacia)", cor: "#8250df", descricao: "Sociedades simples, associações e institutos.",
    etapas: [ORC, DOCS, CPL, { nome: "Redação do contrato/estatuto e ata" }, { nome: "Coleta de assinaturas" }, RCPJ, { nome: "DBE e emissão do CNPJ" }, ALV, ENT] },
  { nome: "Abertura de MEI", cor: "#3fb950", descricao: "Formalização pelo Portal do Empreendedor.",
    etapas: [DOCS, { nome: "Desbloqueio/criação de conta gov.br" }, CPL, { nome: "Formalização no Portal do Empreendedor" }, { nome: "Alvará / dispensa" }, ENT] },
  { nome: "Abertura de Autônomo (Inscrição Municipal)", cor: "#56d364", descricao: "Profissional autônomo — inscrição na Prefeitura.",
    etapas: [ORC, DOCS, { nome: "Requerimento de Inscrição Municipal de Autônomo" }, { nome: "Pagamento de taxa (guia ao cliente)" }, ENT] },
  { nome: "Transformação de MEI em SLU / LTDA", cor: "#cf222e", descricao: "Desenquadramento do MEI e transformação.",
    etapas: [ORC, DOCS, { nome: "Desenquadramento do MEI" }, CPL, VIAB, { nome: "Contrato de transformação e assinaturas" }, JUC, CNPJ, ALV, { nome: "Opção pelo Simples Nacional" }, ENT] },
  { nome: "Transformação de EI / RE em SLU", cor: "#a40e26", descricao: "Empresário individual para sociedade unipessoal.",
    etapas: [ORC, DOCS, VIAB, { nome: "Instrumento de transformação e assinaturas" }, JUC, CNPJ, { nome: "Atualização da Inscrição Municipal" }, ENT] },
  { nome: "Registro de Ata / Modernização de Estatuto (RCPJ)", cor: "#6e40c9", descricao: "Associações, institutos e sociedades simples.",
    etapas: [ORC, { nome: "Redação da ata / estatuto" }, { nome: "Coleta de assinaturas" }, RCPJ, { nome: "DBE e atualização do CNPJ" }, ENT] },
  { nome: "Baixa / Encerramento de Empresa", cor: "#57606a", descricao: "Distrato e baixas nos órgãos.",
    etapas: [ORC, { nome: "Levantamento de pendências fiscais" }, { nome: "Regularização das pendências" }, { nome: "DBE de baixa" }, { nome: "Distrato e assinaturas" }, JUC, { nome: "Baixa do CNPJ" }, { nome: "Baixa da Inscrição Municipal / Alvará" }, { nome: "Baixa da Inscrição Estadual (se houver)" }, ENT] },
  { nome: "Baixa de MEI", cor: "#8c959f", descricao: "Encerramento no Portal do Empreendedor.",
    etapas: [{ nome: "Verificação de pendências (DAS / DASN)" }, { nome: "Baixa no Portal do Empreendedor" }, { nome: "Baixa municipal" }, ENT] },
  { nome: "Atestado de Residência Fiscal", cor: "#0550ae", descricao: "Requerimento na Receita Federal.",
    etapas: [ORC, DOCS, { nome: "Requerimento na Receita Federal" }, { nome: "Processo em análise na Receita" }, ENT] },
  { nome: "Registro de Marca (INPI)", cor: "#953800", descricao: "Busca e depósito de marca.",
    etapas: [ORC, { nome: "Busca de anterioridade" }, { nome: "Pagamento da GRU" }, { nome: "Depósito do pedido" }, { nome: "Acompanhamento no INPI" }, ENT] },
  { nome: "Licenciamento Sanitário", cor: "#1a7f37", descricao: "Vigilância Sanitária.",
    etapas: [DOCS, { nome: "Requerimento na Vigilância Sanitária" }, { nome: "Pagamento da taxa (guia ao cliente)" }, { nome: "Vistoria / análise do órgão" }, { nome: "Emissão da Licença Sanitária" }, ENT] },
  { nome: "Serviço avulso (certidões, livros, regularização)", cor: "#6639ba", descricao: "Certidões, autenticação de livros, regularização de MEI etc.",
    etapas: [ORC, { nome: "Levantamento / requerimento" }, { nome: "Pagamento de taxa (se houver)" }, { nome: "Emissão / conclusão" }, ENT] },
];
})();
