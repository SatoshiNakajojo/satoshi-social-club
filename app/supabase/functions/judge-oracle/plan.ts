/**
 * Le jugement d'un pari résolu — la décision, sans réseau ni base.
 *
 * `index.ts` charge les paris à juger et le cours de leur période, puis s'en
 * remet à ce module :
 *
 *   • chaque pari est jugé sur le cours de **sa** période, de son ouverture à
 *     sa résolution — jamais sur une série qui dépendrait du jour du jugement ;
 *   • un pari sans tracé jugeable est clos sans justesse (il ne gagne rien) ;
 *   • un cours introuvable n'invente pas de verdict : on retentera, et après
 *     `MAX_ATTEMPTS` essais on laisse la ligne à un administrateur.
 */

import { verdict, type PricePoint } from '../_shared/oracleJudge.ts';

/** Au-delà, `judge_tick` ne relance plus : le cours ne viendra pas. */
export const MAX_ATTEMPTS = 20;

/** Une ligne de `predictions`, réduite à ce que juge le juge. */
export interface PendingBet {
  id: string;
  opened_at: string;
  resolves_at: string;
  path_data: unknown;
  judge_attempts: number;
}

/** Ce qu'il faut écrire sur la ligne. */
export type Judgement =
  | { kind: 'judged'; accuracy: number | null }
  | { kind: 'retry'; attempts: number; reason: string };

function isPoint(value: unknown): value is PricePoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    (value[1] as number) > 0
  );
}

/** Le tracé d'un pari, tel que la base le garde. */
export function pathOf(bet: Pick<PendingBet, 'path_data'>): PricePoint[] {
  return Array.isArray(bet.path_data) ? bet.path_data.filter(isPoint) : [];
}

/**
 * L'adresse du cours de la période, chez CoinGecko.
 *
 * `market_chart/range` choisit lui-même le grain : horaire jusqu'à 90 jours,
 * journalier au-delà. C'est ce qui rend le verdict stable — il ne dépend que
 * de la période du pari.
 */
export function rangeUrl(openedAt: number, resolvesAt: number, apiKey?: string): string {
  const params = new URLSearchParams({
    vs_currency: 'usd',
    from: String(Math.floor(openedAt / 1000)),
    to: String(Math.ceil(resolvesAt / 1000)),
  });
  if (apiKey) params.set('x_cg_demo_api_key', apiKey);
  return `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?${params}`;
}

/**
 * Le verdict d'un pari, une fois le cours de sa période en main.
 *
 * `prices` vaut `null` quand le cours n'a pas pu être chargé.
 */
export function judge(
  bet: PendingBet,
  prices: readonly (readonly [number, number])[] | null,
): Judgement {
  const path = pathOf(bet);
  if (path.length < 2) return { kind: 'judged', accuracy: null };

  const retry = (reason: string): Judgement => ({
    kind: 'retry',
    attempts: bet.judge_attempts + 1,
    reason,
  });
  if (prices === null) return retry('cours indisponible');

  const openedAt = Date.parse(bet.opened_at);
  const resolvesAt = Date.parse(bet.resolves_at);
  if (!Number.isFinite(openedAt) || !Number.isFinite(resolvesAt)) {
    return { kind: 'judged', accuracy: null };
  }

  const accuracy = verdict(path, prices, openedAt, resolvesAt);
  return accuracy === null ? retry('aucun cours sur la période') : { kind: 'judged', accuracy };
}
