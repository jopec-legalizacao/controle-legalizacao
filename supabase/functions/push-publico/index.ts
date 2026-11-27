// Edge Function "push-publico" — manda as notificações no celular de quem
// ativou o aviso pelo link público. Ações (corpo JSON):
//   {acao:"chave"}                → devolve a chave pública VAPID (gera na 1ª vez)
//   {acao:"processar"}            → envia o que está na fila (chamada a cada minuto pelo pg_cron)
//   {acao:"teste", endpoint:"…"}  → manda um aviso de teste só para esse aparelho
// Deploy: Supabase → Edge Functions → push-publico, com "Verify JWT" DESLIGADO.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const segredo = () => { // chave de serviço: a antiga (service_role) ou a nova (sb_secret_…)
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (k) return k;
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return o.default || Object.values(o)[0] as string; } catch { return ""; }
};
const sb = createClient(Deno.env.get("SUPABASE_URL")!, segredo(), { auth: { persistSession: false } });
const SITE = Deno.env.get("SITE_URL") || "https://controle-legalizacao.vercel.app/";

type Chaves = { publica: string; privada: string };
let cache: Chaves | null = null;
async function chaves(): Promise<Chaves> {
  if (cache) return cache;
  let { data } = await sb.from("leg_push_chaves").select("publica,privada").eq("id", 1).maybeSingle();
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("leg_push_chaves").upsert({ id: 1, publica: k.publicKey, privada: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    ({ data } = await sb.from("leg_push_chaves").select("publica,privada").eq("id", 1).single());
  }
  cache = data as Chaves;
  webpush.setVapidDetails("mailto:legaliza@jopec.com.br", cache.publica, cache.privada);
  return cache;
}

type Insc = { endpoint: string; token: string; inscricao: webpush.PushSubscription; tipos: string[]; falhas: number };
async function enviar(s: Insc, msg: Record<string, unknown>) {
  try {
    await webpush.sendNotification(s.inscricao, JSON.stringify(msg), { TTL: 60 * 60 * 24 * 2, urgency: "normal" });
    await sb.from("leg_push_inscricoes").update({ ultimo_envio: new Date().toISOString(), falhas: 0 }).eq("endpoint", s.endpoint);
    return true;
  } catch (e) {
    const st = (e as { statusCode?: number }).statusCode;
    if (st === 404 || st === 410 || s.falhas >= 20) await sb.from("leg_push_inscricoes").delete().eq("endpoint", s.endpoint);
    else await sb.from("leg_push_inscricoes").update({ falhas: s.falhas + 1 }).eq("endpoint", s.endpoint);
    console.warn("falha push", st, (e as Error).message);
    return false;
  }
}

const corta = (t: string, n = 140) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
type Item = { processo_id: string; cliente: string; servico: string | null; categoria: string; texto: string | null };

async function processar() {
  const { data: fila, error } = await sb.rpc("leg_push_pegar_fila");
  if (error) throw error;
  if (!fila?.length) return { enviados: 0 };
  const { data: link } = await sb.from("leg_link_publico").select("token").eq("ativo", true).limit(1).maybeSingle();
  if (!link) return { enviados: 0, motivo: "sem link ativo" };
  const { data: subs } = await sb.from("leg_push_inscricoes").select("*").eq("token", link.token);
  if (!subs?.length) return { enviados: 0, avisos: fila.length };
  await chaves();

  // junta os avisos do mesmo processo (ex.: concluiu uma etapa e a próxima começou)
  const porProc = new Map<string, Item[]>();
  for (const f of fila as Item[]) { const k = f.processo_id || f.cliente; porProc.set(k, [...(porProc.get(k) || []), f]); }
  const url = (aba = "novidades") => `${SITE}?p=${encodeURIComponent(link.token)}&aba=${aba}`;
  const avisos = [...porProc.values()].map(its => {
    const cat = its.some(i => i.categoria === "finalizado") ? "finalizado" : its.some(i => i.categoria === "novo") ? "novo" : "andamento";
    const c = its[0].cliente;
    const textos = its.filter(i => i.categoria !== "novo" && i.texto).map(i => (i.texto as string).replace(/^[✔⏸▶✕]\s*/u, ""));
    const titulo = cat === "finalizado" ? `✔ Finalizado: ${c}` : cat === "novo" ? `🆕 Novo processo: ${c}` : c;
    const corpo = cat === "novo" ? [its[0].servico, ...textos].filter(Boolean).join(" · ") || "Processo colocado na esteira"
      : textos.slice(-3).join(" · ") || "Novo andamento";
    return { cat, cliente: c, msg: { titulo: corta(titulo, 80), corpo: corta(corpo), tag: "leg-" + (its[0].processo_id || c), url: url() } };
  });

  let enviados = 0;
  await Promise.all((subs as Insc[]).map(async s => {
    const meus = avisos.filter(a => s.tipos.includes(a.cat));
    if (!meus.length) return;
    if (meus.length > 3) { // muitos de uma vez: um aviso só, com o resumo
      const nomes = meus.map(a => a.cliente);
      const ok = await enviar(s, { titulo: `JOPEC · ${meus.length} novidades na legalização`, corpo: corta(nomes.join(", "), 160), tag: "leg-resumo", url: url() });
      if (ok) enviados++;
      return;
    }
    for (const a of meus) if (await enviar(s, a.msg)) enviados++;
  }));
  return { enviados, avisos: avisos.length, aparelhos: subs.length };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = req.method === "POST" ? await req.json().catch(() => ({})) : Object.fromEntries(new URL(req.url).searchParams);
    const acao = b.acao || "processar";
    if (acao === "chave") return json({ chave: (await chaves()).publica });
    if (acao === "teste") {
      const { data: s } = await sb.from("leg_push_inscricoes").select("*").eq("endpoint", String(b.endpoint || "")).maybeSingle();
      if (!s) return json({ erro: "Este aparelho não está inscrito." }, 404);
      await chaves();
      const ok = await enviar(s as Insc, { titulo: "JOPEC · Legalização", corpo: "Tudo certo! Você vai receber os avisos dos processos por aqui. 🔔", tag: "leg-teste", url: `${SITE}?p=${encodeURIComponent(s.token)}` });
      return json({ ok });
    }
    return json(await processar());
  } catch (e) {
    console.error(e);
    return json({ erro: (e as Error).message || String(e) }, 500);
  }
});
