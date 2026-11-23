# JOPEC · Controle de Legalização

App instalável (PWA) para acompanhar os processos de legalização: esteira de etapas por cliente, diário automático, cardápio de presets, pausa/desistência, relatório mensal com gratificação e alerta por e-mail.

**Para testar agora:** abra a pasta com qualquer servidor local, ou publique direto na Vercel. Sem o Supabase configurado, o app roda em **modo demonstração**, com as senhas `admin` e `equipe` e os dados guardados só no navegador.

---

## Passo a passo para colocar no ar (igual ao app de certidões)

### 1) Banco de dados (Supabase, conta mateus.jopec)
Dá para usar o **mesmo projeto** do app de certidões, porque as tabelas daqui começam com `leg_`.

1. Supabase → **SQL Editor** → New query → cole todo o arquivo `supabase/schema.sql` → **Run**.
   - Se o e-mail do administrador não for `mateus.jopec@gmail.com`, troque na linha `insert into leg_admins` antes de rodar.
2. Supabase → **Authentication → Users → Add user → Create new user**, marcando **Auto Confirm User**:
   - **Administrador:** `mateus.jopec@gmail.com`, com a SUA senha (poder total).
   - **Equipe:** `equipe.legalizacao@jopec.com.br`, com a senha que você vai passar para a equipe (só visualiza). Esse e-mail não precisa existir de verdade.
3. Supabase → **Project Settings → API**: copie a **Project URL** e a chave **anon public**.

### 2) Configurar o app
Abra o arquivo `config.js` e preencha os campos `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `EMAIL_ADMIN` e `EMAIL_EQUIPE`.

### 3) Publicar (GitHub + Vercel)
1. GitHub (conta mateusjopec-byte) → **New repository** → nome `controle-legalizacao` → **Private** → Create.
2. Clique em **uploading an existing file** e arraste **todo o conteúdo** desta pasta (não a pasta em si) → Commit.
3. Vercel → **Add New → Project** → importe o repositório → Framework: **Other** → Deploy. Não precisa de build.
4. No celular ou no PC, abra o link e use **Instalar app / Adicionar à tela inicial**.

### 4) E-mail de alerta automático (opcional, mas recomendado)
O botão **✉ Enviar alerta** manda o e-mail de **mateus.jopec@gmail.com** para os destinatários definidos em Configurações (padrão: jotapec2020@gmail.com e cristiano.jopec@gmail.com, com cópia para legaliza@jopec.com.br).

1. Conta Google mateus.jopec → **Segurança** → ative a **Verificação em duas etapas** (se ainda não estiver ativa).
2. Acesse https://myaccount.google.com/apppasswords → crie a senha de app "Legalização" → copie as 16 letras.
3. Supabase → **Edge Functions → Deploy a new function → Via Editor** → nome **`enviar-alerta`** → cole o conteúdo de `supabase/functions/enviar-alerta/index.ts` → Deploy.
4. Supabase → **Edge Functions → Secrets** → adicione:
   - `GMAIL_USER` = `mateus.jopec@gmail.com`
   - `GMAIL_APP_PASSWORD` = as 16 letras (sem espaços)

Enquanto isso não estiver configurado, use o botão **Abrir no Gmail**: ele abre o e-mail pronto na conta mateus.jopec para você só clicar em Enviar.

---

## Ordem sugerida no primeiro uso
1. Cardápio de etapas → **Carregar presets sugeridos** (ajuste depois do seu jeito).
2. Configurações → **Restaurar backup** → `historico-legalizacao-2021-2026.json` (os finalizados de 2021 a 2026).
3. **Triagem da planilha** → decida as 38 pendências.

## Como funciona
- **Dois perfis:** a Equipe só vê. O Administrador cria, edita, registra, pausa, finaliza e envia e-mails. A trava fica no banco (RLS), então não dá para burlar pela tela.
- **Cardápio de etapas:** presets por serviço, com botão para carregar os sugeridos, criar, editar, duplicar e reordenar.
- **Esteira por cliente:** escolha o preset, marque o que já foi feito, reordene, remova, junte etapas de outro preset ou pegue etapas avulsas do cardápio.
- **Diário diário:** dia em que você não escrever nada mostra "Sem movimentação" ou repete o último status até você mudar. O padrão fica em Configurações e cada processo pode ter o seu próprio modo. Dá para contar só dias úteis ou todos os dias.
- **Rotina de hoje (Painel):** um campo por processo em andamento para escrever o status do dia, com frases rápidas.
- **Situações:** Em andamento, ⏸ Pausados (motivo + lembrete de retomada), ✔ Finalizados, ✕ Desistências (motivo) e Arquivados.
- **Relatório mensal:** finalizados do mês com gratificação e total, exportação em CSV e impressão. Em Processos tem o botão **Controle para os chefes**, que imprime a lista em andamento.
- **Triagem da planilha** (menu só do administrador): lista as 38 pendências abertas da aba "controle para os chefes". Para cada uma há um botão: ✔ Já finalizado, ▶ Montar esteira (escolhe o preset, junta outros, cria preset novo na hora e marca com 📍 onde o processo está), ⏸ Pausado, ✕ Desistiu ou Ignorar. Tudo pode ser desfeito. O menu some quando não sobra nada para decidir.
- **Backup:** em Configurações você baixa e restaura os dados em JSON.
