-- =====================================================================
-- Notificações no celular para quem tem o LINK PÚBLICO (Web Push)
-- Rode depois de schema.sql e link_publico.sql. Pode rodar de novo sem problema.
-- Precisa também da Edge Function "push-publico" (supabase/functions/push-publico).
-- =====================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Aparelhos inscritos (cada celular/navegador que ativou as notificações)
create table if not exists leg_push_inscricoes (
  endpoint text primary key,
  token text not null,                         -- token do link público usado na inscrição
  inscricao jsonb not null,                    -- PushSubscription (endpoint + chaves)
  tipos text[] not null default array['novo','andamento','finalizado'],
  aparelho text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  ultimo_envio timestamptz,
  falhas int not null default 0
);
-- Fila de avisos (preenchida sozinha pelos gatilhos abaixo)
create table if not exists leg_push_fila (
  id bigserial primary key,
  processo_id uuid,
  cliente text,
  servico text,
  categoria text not null,                     -- novo | andamento | finalizado
  texto text,
  criado_em timestamptz default now(),
  enviado_em timestamptz
);
create index if not exists leg_push_fila_pend on leg_push_fila(criado_em) where enviado_em is null;
-- Chaves VAPID (geradas sozinhas pela Edge Function na primeira vez; ninguém lê pela API)
create table if not exists leg_push_chaves (
  id int primary key default 1 check (id = 1),
  publica text not null,
  privada text not null,
  criado_em timestamptz default now()
);

alter table leg_push_inscricoes enable row level security;
alter table leg_push_fila enable row level security;
alter table leg_push_chaves enable row level security;
drop policy if exists "leg_push_insc_admin" on leg_push_inscricoes;
create policy "leg_push_insc_admin" on leg_push_inscricoes for select to authenticated using (leg_is_admin());
drop policy if exists "leg_push_fila_admin" on leg_push_fila;
create policy "leg_push_fila_admin" on leg_push_fila for select to authenticated using (leg_is_admin());

-- Configuração: leg_config chave 'push' = {"ativo": true, "desde": "2026-11-01"}
insert into leg_config(chave, valor) values ('push', '{"ativo": true, "desde": "2026-11-01"}'::jsonb)
  on conflict (chave) do nothing;

create or replace function leg_push_cfg() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from leg_config where chave = 'push'), '{}'::jsonb)
         || jsonb_build_object('desde', coalesce((select valor->>'desde' from leg_config where chave = 'push'), '2026-11-01'));
$$;

-- ---------------------------------------------------------------- gatilhos
-- Cada registro no diário (status do dia, etapa, pausa, retomada, finalização…) vira aviso.
create or replace function leg_push_tg_atual() returns trigger
language plpgsql security definer set search_path = public as $$
declare c jsonb; p leg_processos;
begin
  c := leg_push_cfg();
  if coalesce((c->>'ativo')::boolean, true) is false then return new; end if;
  if new.tipo = 'sistema' or new.texto ilike '%triagem da planilha%' then return new; end if;
  -- só o que é de novembro/2026 em diante e recente (restaurar backup não dispara aviso)
  if new.data < (c->>'desde')::date or new.data < current_date - 3 then return new; end if;
  select * into p from leg_processos where id = new.processo_id;
  if not found or p.situacao = 'arquivado' then return new; end if;
  insert into leg_push_fila(processo_id, cliente, servico, categoria, texto)
  values (p.id, p.cliente, p.servico, case when new.tipo = 'finalizado' then 'finalizado' else 'andamento' end, new.texto);
  return new;
exception when others then
  return new; -- aviso nunca pode atrapalhar o salvamento
end $$;
drop trigger if exists leg_push_atual on leg_atualizacoes;
create trigger leg_push_atual after insert on leg_atualizacoes for each row execute function leg_push_tg_atual();

-- Processo novo colocado na esteira.
create or replace function leg_push_tg_proc() returns trigger
language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  c := leg_push_cfg();
  if coalesce((c->>'ativo')::boolean, true) is false then return new; end if;
  if new.situacao <> 'andamento' or coalesce(new.data_inicio, current_date) < (c->>'desde')::date
     or coalesce(new.data_inicio, current_date) < current_date - 7 then return new; end if;
  insert into leg_push_fila(processo_id, cliente, servico, categoria, texto)
  values (new.id, new.cliente, new.servico, 'novo', new.servico);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists leg_push_proc on leg_processos;
create trigger leg_push_proc after insert on leg_processos for each row execute function leg_push_tg_proc();

-- ---------------------------------------------------------------- funções do link público
create or replace function leg_push_inscrever(p_token text, p_inscricao jsonb, p_tipos text[], p_aparelho text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare ep text := p_inscricao->>'endpoint';
begin
  if p_token is null or not exists (select 1 from leg_link_publico where token = p_token and ativo) then return false; end if;
  if ep is null or left(ep, 8) <> 'https://' or length(ep) > 1000 or p_inscricao->'keys'->>'p256dh' is null then return false; end if;
  if (select count(*) from leg_push_inscricoes) >= 1000 and not exists (select 1 from leg_push_inscricoes where endpoint = ep) then return false; end if;
  insert into leg_push_inscricoes(endpoint, token, inscricao, tipos, aparelho)
  values (ep, p_token, p_inscricao,
          coalesce((select array_agg(t) from unnest(p_tipos) t where t in ('novo','andamento','finalizado')), array[]::text[]),
          left(p_aparelho, 120))
  on conflict (endpoint) do update set token = excluded.token, inscricao = excluded.inscricao, tipos = excluded.tipos,
     aparelho = excluded.aparelho, atualizado_em = now(), falhas = 0;
  return true;
end $$;

create or replace function leg_push_cancelar(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from leg_push_inscricoes where endpoint = p_endpoint;
$$;

create or replace function leg_push_minha(p_endpoint text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tipos', tipos, 'token', token) from leg_push_inscricoes where endpoint = p_endpoint;
$$;

-- Novidades (histórico) de novembro/2026 em diante para a página pública
create or replace function leg_push_novidades(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c jsonb := leg_push_cfg(); d date;
begin
  if p_token is null or not exists (select 1 from leg_link_publico where token = p_token and ativo) then return null; end if;
  d := (c->>'desde')::date;
  return coalesce((select jsonb_agg(s.x order by s.quando desc) from (
    select q.x, q.quando from (
      select jsonb_build_object('processo_id', p.id, 'cliente', p.cliente, 'servico', p.servico, 'situacao', p.situacao,
               'categoria', case when a.tipo = 'finalizado' then 'finalizado' else 'andamento' end, 'tipo', a.tipo,
               'texto', a.texto, 'data', a.data) x,
             a.data::text || ' ' || coalesce(a.criado_em::text, '') quando
      from leg_atualizacoes a join leg_processos p on p.id = a.processo_id
      where a.data >= d and a.tipo <> 'sistema' and a.texto not ilike '%triagem da planilha%'
        and p.situacao in ('andamento','pausado','finalizado','desistencia')
      union all
      select jsonb_build_object('processo_id', p.id, 'cliente', p.cliente, 'servico', p.servico, 'situacao', p.situacao,
               'categoria', 'novo', 'tipo', 'novo', 'texto', 'Processo colocado na esteira', 'data', p.data_inicio) x,
             p.data_inicio::text || ' 0' quando
      from leg_processos p
      where p.data_inicio >= d and p.situacao in ('andamento','pausado','finalizado','desistencia')
    ) q order by q.quando desc limit 300) s), '[]'::jsonb);
end $$;

-- Usada só pela Edge Function: pega os avisos pendentes (com 20 s de folga para juntar cliques seguidos)
create or replace function leg_push_pegar_fila() returns setof leg_push_fila
language sql security definer set search_path = public as $$
  update leg_push_fila set enviado_em = now()
   where id in (select id from leg_push_fila where enviado_em is null and criado_em < now() - interval '20 seconds' order by id limit 200)
  returning *;
$$;

revoke all on function leg_push_inscrever(text, jsonb, text[], text), leg_push_cancelar(text), leg_push_minha(text),
  leg_push_novidades(text), leg_push_pegar_fila(), leg_push_cfg() from public;
grant execute on function leg_push_inscrever(text, jsonb, text[], text), leg_push_cancelar(text), leg_push_minha(text),
  leg_push_novidades(text) to anon, authenticated;
revoke execute on function leg_push_pegar_fila(), leg_push_cfg() from anon, authenticated;
grant execute on function leg_push_pegar_fila() to service_role;
grant execute on function leg_push_cfg() to service_role;

-- ---------------------------------------------------------------- envio automático (a cada minuto, só se houver aviso)
-- >>> Se o projeto não for o bpnprrkfhrqsdwsevwsk, troque o endereço abaixo.
select cron.unschedule(jobid) from cron.job where jobname = 'leg-push-publico';
select cron.schedule('leg-push-publico', '* * * * *', $cron$
  select net.http_post(
    url := 'https://bpnprrkfhrqsdwsevwsk.supabase.co/functions/v1/push-publico',
    body := '{"acao":"processar"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb)
  where exists (select 1 from public.leg_push_fila where enviado_em is null and criado_em < now() - interval '20 seconds');
$cron$);

-- limpeza: avisos enviados há mais de 60 dias
select cron.unschedule(jobid) from cron.job where jobname = 'leg-push-limpeza';
select cron.schedule('leg-push-limpeza', '17 4 * * *', $cron$ delete from public.leg_push_fila where enviado_em < now() - interval '60 days' $cron$);
