import { useMemo } from 'react';

import type { HorizonKey } from '@/lib/horizons';
import { supabase } from '@/lib/supabase';
import { MOCK_ORBTC_GENESIS } from '@/mocks/oracle';
import type { Member } from '@/types/domain';
import type { Bet } from './betting';
import {
  ORBTC_GENESIS,
  buildManches,
  genesisShares,
  holdings,
  mancheLabel,
  mancheWindow,
  movementsOf,
  stakeFor,
  type Holding,
  type Manche,
  type MancheWindow,
  type Movement,
} from './orbtc';
import type { BetView } from './useOracle';

/** Un portefeuille, avec son membre. */
export interface MemberHolding extends Holding {
  member: Member;
}

export interface OrbtcState {
  /** La genèse : avant, personne n'a encore rien misé. */
  genesis: number;
  started: boolean;
  /** Tous les portefeuilles, du plus riche au plus pauvre. */
  holdings: MemberHolding[];
  /** Le mien, si je suis membre. */
  me: MemberHolding | null;
  /** Les ORBTC engagés dans des manches pas encore réglées, tout le club confondu. */
  inPlay: number;
  manches: Manche[];
  /** La manche où entrerait un pari ouvert maintenant sur l'horizon affiché. */
  current: MancheWindow & { label: string; stake: number; manche: Manche | null };
  /** La manche de mon pari en cours sur cet horizon — pas forcément la courante. */
  myManche: Manche | null;
  movements: Movement[];
  /** J'ai de quoi miser sur cet horizon. */
  canStake: boolean;
}

/**
 * Les ORBTC du club, déduits des paris (`orbtc.ts`).
 *
 * Les paris résolus prennent leur justesse dans l'historique jugé — les mêmes
 * séries canoniques que le classement : un pari ne peut pas gagner un pot ici
 * et perdre des points là.
 */
export function useOrbtc({
  bets,
  history,
  members,
  userId,
  horizon,
  now,
}: {
  bets: readonly Bet[];
  history: readonly BetView[];
  members: readonly Member[];
  userId: string | null;
  horizon: HorizonKey;
  now: number;
}): OrbtcState {
  /** Sans backend, la genèse du monde fictif : il y a déjà eu des manches. */
  const genesis = supabase ? ORBTC_GENESIS : MOCK_ORBTC_GENESIS;

  const manches = useMemo(() => {
    const judged = new Map(history.map((view) => [view.bet.id, view.accuracy]));
    const players = new Set(members.map((member) => member.id));
    return buildManches(
      bets.map((bet) => ({ bet, accuracy: judged.get(bet.id) ?? null })),
      players,
      genesis,
      now,
    );
  }, [bets, history, members, genesis, now]);

  return useMemo(() => {
    const byId = new Map(members.map((member) => [member.id, member]));
    const rows = holdings(genesisShares(members.map((member) => member.id)), manches).flatMap(
      (row) => {
        const member = byId.get(row.userId);
        return member ? [{ ...row, member }] : [];
      },
    );
    const me = rows.find((row) => row.userId === userId) ?? null;

    const window = mancheWindow(horizon, now);
    const stake = stakeFor(horizon);
    const currentKey = `${horizon}:${window.start}`;
    const myManche =
      manches.find(
        (manche) =>
          manche.horizon === horizon &&
          manche.status !== 'settled' &&
          manche.status !== 'refunded' &&
          manche.entries.some(({ bet }) => bet.userId === userId && bet.resolvesAt > now),
      ) ?? null;

    return {
      genesis,
      started: now >= genesis,
      holdings: rows,
      me,
      inPlay: rows.reduce((sum, row) => sum + row.inPlay, 0),
      manches,
      current: {
        ...window,
        label: mancheLabel(horizon, window.start),
        stake,
        manche: manches.find((manche) => manche.key === currentKey) ?? null,
      },
      myManche,
      movements: movementsOf(userId, manches),
      canStake: Boolean(me && me.available >= stake),
    };
  }, [manches, members, userId, horizon, now, genesis]);
}
