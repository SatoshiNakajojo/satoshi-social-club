/**
 * Le juge de l'Oracle — Edge Function Supabase (Deno).
 *
 * Appelée par `judge_tick()`, chaque quart d'heure via pg_cron, avec l'en-tête
 * `x-judge-secret` — et seulement quand un pari résolu attend son verdict.
 *
 * Pour chaque pari : le cours de sa période chez CoinGecko, la justesse
 * calculée par le code de l'app (`_shared/oracleJudge.ts`), écrite dans
 * `predictions.accuracy`. C'est le seul écrivain de ces colonnes : le
 * déclencheur `predictions_verdict_trigger` ignore ce qu'un membre y envoie.
 * Les ORBTC se règlent sur ces verdicts.
 *
 * Les règles vivent dans `./plan.ts`, testé hors de Deno. Ce fichier ne fait
 * que les enchaîner.
 *
 * Déploiement : voir `supabase/functions/README.md`, « judge-oracle ».
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { MAX_ATTEMPTS, judge, rangeUrl, type PendingBet } from './plan.ts';

/** Paris jugés par appel : le quota public de CoinGecko est bas, le battement reprend la suite. */
const BATCH = 8;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Comparaison à temps constant : le secret ne se devine pas caractère par caractère. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Le cours de la période, `[ms, dollars]`. `null` s'il ne vient pas. */
async function periodPrices(bet: PendingBet): Promise<[number, number][] | null> {
  try {
    const url = rangeUrl(
      Date.parse(bet.opened_at),
      Date.parse(bet.resolves_at),
      Deno.env.get('COINGECKO_API_KEY') ?? undefined,
    );
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const prices = (await response.json())?.prices;
    return Array.isArray(prices) ? (prices as [number, number][]) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  const expected = Deno.env.get('JUDGE_SECRET') ?? '';
  // Une configuration inachevée n'est pas une permission.
  if (expected.length < 32) return json({ error: 'JUDGE_SECRET manquant' }, 500);
  if (!sameSecret(request.headers.get('x-judge-secret') ?? '', expected)) {
    return json({ error: 'secret invalide' }, 401);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false },
    },
  );

  const { data, error } = await db
    .from('predictions')
    .select('id, opened_at, resolves_at, path_data, judge_attempts')
    .is('judged_at', null)
    .lte('resolves_at', new Date().toISOString())
    .lt('judge_attempts', MAX_ATTEMPTS)
    .order('resolves_at')
    .limit(BATCH);
  if (error) return json({ error: error.message }, 502);

  const report: { id: string; outcome: string }[] = [];
  for (const bet of (data ?? []) as PendingBet[]) {
    const prices = await periodPrices(bet);
    const decision = judge(bet, prices);

    const update =
      decision.kind === 'judged'
        ? { accuracy: decision.accuracy, judged_at: new Date().toISOString() }
        : { judge_attempts: decision.attempts };
    const { error: cause } = await db.from('predictions').update(update).eq('id', bet.id);

    report.push({
      id: bet.id,
      outcome: cause
        ? `écriture refusée : ${cause.message}`
        : decision.kind === 'judged'
          ? decision.accuracy === null
            ? 'clos sans justesse'
            : `${decision.accuracy} %`
          : `retenté (${decision.attempts}) : ${decision.reason}`,
    });
  }

  return json({ judged: report.length, report, at: new Date().toISOString() });
});
