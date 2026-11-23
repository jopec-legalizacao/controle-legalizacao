-- =====================================================================
-- JOPEC · Controle de Legalização — estrutura do banco (Supabase)
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- Pode usar o mesmo projeto do app de certidões: todas as tabelas
-- começam com "leg_" e não conflitam com as outras.
-- =====================================================================

create extension if not exists pgcrypto;

-- Presets (cardápio de etapas de cada serviço)
create table if not exists leg_presets (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  cor text default '#1f4e79',
  etapas jsonb not null default '[]'::jsonb,   -- [{nome, descricao, prazo}]
  ordem int default 0,
  criado_em timestamptz default now()
);

-- Processos (cada cliente na esteira)
create table if not exists leg_processos (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  cnpj text,
  servico text,
  preset_id uuid references leg_presets(id) on delete set null,
  situacao text not null default 'andamento'
    check (situacao in ('andamento','pausado','finalizado','desistencia','arquivado')),
  tipo_cliente text default 'EMPRESA',
  responsavel text,
  contato text,
  aguardando text default 'jopec',      -- com quem está a bola: jopec, cliente, orgao, chefes
  gratificacao numeric(10,2),
  honorarios numeric(10,2),
  pausa_motivo text,
  retomar_em date,
  desistencia_motivo text,
  prioridade text default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  data_inicio date default current_date,
  previsao date,
  data_conclusao date,
  modo_diario text not null default 'padrao'
    check (modo_diario in ('padrao','sem_movimentacao','repetir')),
  observacoes text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- Etapas da esteira de cada processo
create table if not exists leg_etapas (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references leg_processos(id) on delete cascade,
  ordem int not null default 0,
  nome text not null,
  descricao text,
  prazo text,
  status text not null default 'pendente'
    check (status in ('pendente','andamento','concluida','dispensada')),
  concluida_em date
);
create index if not exists leg_etapas_proc on leg_etapas(processo_id);

-- Diário de atualizações (o que você escreve em cada dia)
create table if not exists leg_atualizacoes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references leg_processos(id) on delete cascade,
  data date not null default current_date,
  texto text not null,
  tipo text not null default 'registro', -- registro, etapa, pausa, retomada, desistencia, finalizado, sistema
  etapa_nome text,
  autor text,
  criado_em timestamptz default now()
);
create index if not exists leg_atual_proc on leg_atualizacoes(processo_id, data);

-- Configurações gerais (modo padrão do diário, dias úteis, alerta...)
create table if not exists leg_config (
  chave text primary key,
  valor jsonb
);

-- Quem tem poder total (administrador)
create table if not exists leg_admins (
  email text primary key
);

-- >>> TROQUE pelo e-mail do usuário ADMINISTRADOR que você criar no Auth
insert into leg_admins(email) values ('mateus.jopec@gmail.com')
  on conflict do nothing;

create or replace function leg_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from leg_admins
                 where lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));
$$;

-- ---------------------------------------------------------------------
-- Segurança (RLS): qualquer usuário logado LÊ; só o administrador ALTERA
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leg_presets','leg_processos','leg_etapas','leg_atualizacoes','leg_config']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s_ler" on %I', t, t);
    execute format('drop policy if exists "%s_admin" on %I', t, t);
    execute format('create policy "%s_ler" on %I for select to authenticated using (true)', t, t);
    execute format('create policy "%s_admin" on %I for all to authenticated using (leg_is_admin()) with check (leg_is_admin())', t, t);
  end loop;
end $$;

alter table leg_admins enable row level security;  -- ninguém acessa pela API
