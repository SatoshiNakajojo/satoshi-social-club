import { useMemo } from 'react';

import type { HorizonKey } from '@/lib/horizons';
import { supabase } from '@/lib/supabase';
import type { Member } from '@/types/domain';
import type { Bet } from './betting';
import {
  buildManches,
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
import { useOrbtcAccounts } from './useOrbtcAccounts';

/** Un portefeuille, avec son membre. */
export interface MemberHolding extends Holding {
  member: Member;
}

export interface OrbtcState {
  /** La base connaît les ORBTC (ou mode démo) : sinon, l'écran n'en montre rien. */
  enabled: boolean;
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
 * Avec un backend, une manche se règle sur le **verdict du serveur**
 * (`predictions.accuracy`, écrit par `judge-oracle`) — exactement ce que lit la
 * base pour refuser une mise (`orbtc_holdings`) : l'écran et la base ne
 * peuvent pas annoncer deux soldes différents. Un pari jugé sans justesse
 * possible compte pour zéro. Sans backend, l'app juge elle-même (mode démo).
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
  const accounts = useOrbtcAccounts(members, now);
  const { genesis, shares } = accounts;

  const manches = useMemo(() => {
    const local = new Map(history.map((view) => [view.bet.id, view.accuracy]));
    const verdictOf = (bet: Bet) =>
      supabase
        ? bet.judgedAt === null
          ? null
          : (bet.accuracy ?? 0)
        : (local.get(bet.id) ?? null);
    return buildManches(
      bets.map((bet) => ({ bet, accuracy: verdictOf(bet) })),
      new Set(shares.keys()),
      genesis,
      now,
    );
  }, [bets, history, shares, genesis, now]);

  return useMemo(() => {
    const byId = new Map(members.map((member) => [member.id, member]));
    const rows = holdings(shares, manches).flatMap((row) => {
      const member = byId.get(row.userId);
      return member ? [{ ...row, member }] : [];
    });
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
      enabled: accounts.enabled,
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
  }, [manches, members, shares, accounts.enabled, userId, horizon, now, genesis]);
}
