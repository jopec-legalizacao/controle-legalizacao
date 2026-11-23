// =====================================================================
// CONFIGURAÇÃO — preencha com os dados do seu projeto Supabase
// (Supabase > Project Settings > API). Enquanto SUPABASE_URL estiver
// vazio, o app roda em MODO DEMONSTRAÇÃO (dados só neste navegador).
// =====================================================================
window.LEG_CONFIG = {
  SUPABASE_URL: "https://bpnprrkfhrqsdwsevwsk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_e6AIT0wPu3bG-2-TTCR5pQ_UAwhX1N7", // chave pública (pode ficar no site)

  // Quem pode editar tudo (precisa estar também na tabela leg_admins do Supabase).
  // Qualquer outro usuário criado no Supabase > Authentication > Users só visualiza
  // (ex.: jotapec2020@gmail.com e cristiano.jopec@gmail.com).
  EMAILS_ADMIN: ["mateus.jopec@gmail.com"],

  // Senhas do MODO DEMONSTRAÇÃO (não valem quando o Supabase estiver ligado)
  DEMO_SENHA_ADMIN: "admin",
  DEMO_SENHA_EQUIPE: "equipe",
};
