/**
 * Lire les paris dans la base — avec ou sans le verdict du serveur.
 *
 * La colonne `accuracy` arrive avec la migration des ORBTC. L'app peut être
 * publiée avant que la migration soit appliquée : dans ce cas, la première
 * lecture échoue sur une colonne inconnue, et on relit sans le verdict. L'app
 * retombe alors sur son propre jugement, comme avant.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';
import { BET_COLUMNS, LEGACY_BET_COLUMNS, betFromRow, type Bet, type BetRow } from './betting';

let verdictAvailable = true;

/** Les colonnes à demander, selon ce que la base sait faire. */
export function betColumns(): string {
  return verdictAvailable ? BET_COLUMNS : LEGACY_BET_COLUMNS;
}

/** L'erreur dit-elle que la base ne connaît pas encore le verdict ? */
export function isMissingVerdict(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column .*(accuracy|judged_at).* does not exist/i.test(error.message ?? '')
  );
}

/** Tous les paris, dans l'ordre d'ouverture. */
export async function selectBets(
  client: SupabaseClient<Database>,
  signal: AbortSignal,
): Promise<{ bets: Bet[] | null; error: { message: string } | null }> {
  const read = (columns: string) =>
    client.from('predictions').select(columns).order('opened_at').abortSignal(signal);

  let { data, error } = await read(betColumns());
  if (error && verdictAvailable && isMissingVerdict(error)) {
    verdictAvailable = false;
    ({ data, error } = await read(LEGACY_BET_COLUMNS));
  }
  if (error) return { bets: null, error };
  return {
    bets: ((data ?? []) as unknown as BetRow[])
      .map(betFromRow)
      .filter((bet): bet is Bet => bet !== null),
    error: null,
  };
}
