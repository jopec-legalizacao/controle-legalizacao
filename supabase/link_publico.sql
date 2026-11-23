-- Link público (sem senha): só leitura do andamento, via função segura com token
create table if not exists leg_link_publico (
  token text primary key,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);
alter table leg_link_publico enable row level security;
drop policy if exists "leg_link_admin" on leg_link_publico;
create policy "leg_link_admin" on leg_link_publico for all to authenticated using (leg_is_admin()) with check (leg_is_admin());

create or replace function leg_painel_publico(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 12
     or not exists (select 1 from leg_link_publico where token = p_token and ativo) then
    return null;
  end if;
  return jsonb_build_object('gerado', now(), 'processos', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'cliente', p.cliente, 'tipo_cliente', p.tipo_cliente, 'servico', p.servico, 'situacao', p.situacao,
      'aguardando', p.aguardando, 'data_inicio', p.data_inicio, 'previsao', p.previsao, 'data_conclusao', p.data_conclusao,
      'pausa_motivo', p.pausa_motivo, 'retomar_em', p.retomar_em, 'desistencia_motivo', p.desistencia_motivo,
      'etapas', coalesce((select jsonb_agg(jsonb_build_object('nome', e.nome, 'status', e.status, 'prazo', e.prazo, 'concluida_em', e.concluida_em) order by e.ordem)
                          from leg_etapas e where e.processo_id = p.id), '[]'::jsonb),
      'ultimo', (select jsonb_build_object('data', a.data, 'texto', a.texto) from leg_atualizacoes a
                  where a.processo_id = p.id and a.tipo <> 'sistema' order by a.data desc, a.criado_em desc limit 1)))
    from leg_processos p where p.situacao in ('andamento','pausado','finalizado','desistencia')), '[]'::jsonb));
end $$;
revoke all on function leg_painel_publico(text) from public;
grant execute on function leg_painel_publico(text) to anon, authenticated;
