/**
 * Les ORBTC — « Oracle BTC », la monnaie de jeu de l'Oracle.
 *
 * Une offre fixe de 21 000 000 ORBTC, comme le bitcoin. À la genèse, chaque
 * membre du club en reçoit **une part égale** — 3 000 000 pour sept membres.
 * Ensuite rien ne se crée ni ne se détruit : les ORBTC ne font que changer de
 * main, d'un tracé moins juste vers un tracé plus juste.
 *
 * Les ORBTC n'ont **aucune valeur monétaire** : ils ne s'achètent pas, ne se
 * revendent pas, ne s'échangent contre rien. C'est ce qui garde l'Oracle dans
 * le jeu entre amis.
 *
 * ## Les manches
 *
 * Chacun ouvre son pari quand il veut : il n'y a pas de départ commun. Un pot
 * suppose pourtant des adversaires. On regroupe donc les paris en **manches** :
 * tous les paris d'un même horizon **ouverts pendant la même période** du
 * calendrier de Nouméa — la même semaine pour « 1 SEM », le même mois pour
 * « 1 MOIS », le même trimestre pour « 3 MOIS »…
 *
 *   • chaque pari engage la **mise de son horizon** (`stakeFor`) ;
 *   • la manche se règle quand **tous** ses paris sont résolus et jugés : le
 *     tracé le plus juste emporte le pot ; à égalité, le pot se partage ;
 *   • seul dans sa manche, on récupère sa mise : on ne gagne pas contre
 *     personne ;
 *   • un pari retiré n'existe plus : sa mise n'a jamais été engagée.
 *
 * Tout se **déduit** des paris et de leur justesse — les mêmes, jugés sur les
 * mêmes séries que le classement (`judging.ts`). Aucun solde n'est stocké :
 * deux écrans ne peuvent pas se contredire.
 *
 * Module pur, testable sans réseau ni rendu.
 */

import { CLUB_OFFSET_MINUTES } from '@/lib/clubTime';
import { formatClubDate, formatInteger } from '@/lib/format';
import { horizonOf, type HorizonKey } from '@/lib/horizons';
import type { Bet } from './betting';

/** L'offre totale, fixe : elle ne fait que se répartir. */
export const ORBTC_SUPPLY = 21_000_000;

/** La mise d'un pari à une semaine. Les autres horizons la multiplient. */
export const BASE_STAKE = 10_000;

/**
 * La genèse des ORBTC dans le club : à partir de là, chaque pari ouvert engage
 * sa mise. Les paris plus anciens restent au classement, pas au portefeuille.
 */
export const ORBTC_GENESIS = Date.parse('2026-11-01T00:00:00+11:00');

const DAY_MS = 86_400_000;
const OFFSET_MS = CLUB_OFFSET_MINUTES * 60_000;

/**
 * La mise d'un horizon : la mise de base, multipliée par le poids de l'horizon
 * au classement — 10 000 pour une semaine, 40 000 pour un an. Viser loin coûte
 * plus cher, et rapporte un pot plus gros.
 */
export function stakeFor(horizon: HorizonKey): number {
  return Math.round(BASE_STAKE * horizonOf(horizon).weight);
}

/** Minuit à Nouméa, ce jour-là. `Date.UTC` absorbe les jours et mois hors bornes. */
const clubMidnight = (year: number, month: number, day: number) =>
  Date.UTC(year, month, day) - OFFSET_MS;

/** Un lundi : l'origine des quinzaines. */
const FORTNIGHT_EPOCH = clubMidnight(2024, 0, 1);

export interface MancheWindow {
  /** Début de la période d'ouverture, inclus. */
  start: number;
  /** Fin de la période d'ouverture, exclue : au-delà, on entre dans la suivante. */
  end: number;
}

/** La période de manche qui contient cet instant, pour cet horizon. */
export function mancheWindow(horizon: HorizonKey, ms: number): MancheWindow {
  const here = new Date(ms + OFFSET_MS);
  const y = here.getUTCFullYear();
  const m = here.getUTCMonth();
  const d = here.getUTCDate();
  // 0 = lundi : la semaine du club commence le lundi.
  const weekday = (here.getUTCDay() + 6) % 7;

  switch (horizon) {
    case '1w': {
      const start = clubMidnight(y, m, d - weekday);
      return { start, end: start + 7 * DAY_MS };
    }
    case '2w': {
      const monday = clubMidnight(y, m, d - weekday);
      const index = Math.floor((monday - FORTNIGHT_EPOCH) / (14 * DAY_MS));
      const start = FORTNIGHT_EPOCH + index * 14 * DAY_MS;
      return { start, end: start + 14 * DAY_MS };
    }
    case '1m':
      return { start: clubMidnight(y, m, 1), end: clubMidnight(y, m + 1, 1) };
    case '3m': {
      const first = Math.floor(m / 3) * 3;
      return { start: clubMidnight(y, first, 1), end: clubMidnight(y, first + 3, 1) };
    }
    case '6m': {
      const first = m < 6 ? 0 : 6;
      return { start: clubMidnight(y, first, 1), end: clubMidnight(y, first + 6, 1) };
    }
    case '12m':
      return { start: clubMidnight(y, 0, 1), end: clubMidnight(y + 1, 0, 1) };
  }
}

const MONTHS = [
  'JANVIER',
  'FÉVRIER',
  'MARS',
  'AVRIL',
  'MAI',
  'JUIN',
  'JUILLET',
  'AOÛT',
  'SEPTEMBRE',
  'OCTOBRE',
  'NOVEMBRE',
  'DÉCEMBRE',
];

/** `SEM. DU 12 OCT 2026`, `OCTOBRE 2026`, `T4 2026` — le nom d'une manche. */
export function mancheLabel(horizon: HorizonKey, start: number): string {
  const here = new Date(start + OFFSET_MS);
  const y = here.getUTCFullYear();
  const m = here.getUTCMonth();
  switch (horizon) {
    case '1w':
      return `SEM. DU ${formatClubDate(start)}`;
    case '2w':
      return `QUINZAINE DU ${formatClubDate(start)}`;
    case '1m':
      return `${MONTHS[m]} ${y}`;
    case '3m':
      return `T${Math.floor(m / 3) + 1} ${y}`;
    case '6m':
      return `S${m < 6 ? 1 : 2} ${y}`;
    case '12m':
      return String(y);
  }
}

/** Un pari, et sa justesse une fois résolu (`null` tant qu'il n'est pas jugé). */
export interface StakedBet {
  bet: Bet;
  accuracy: number | null;
}

/**
 * Où en est une manche :
 *
 *   • `open` — sa période court encore : on peut y entrer ;
 *   • `playing` — fermée aux entrées, des paris courent encore ;
 *   • `pending` — tout est résolu, mais un pari attend le cours qui le juge ;
 *   • `settled` — réglée : le pot est versé au plus juste ;
 *   • `refunded` — un seul joueur : sa mise lui revient.
 */
export type MancheStatus = 'open' | 'playing' | 'pending' | 'settled' | 'refunded';

export interface Manche {
  /** `horizon:début` — stable, unique. */
  key: string;
  horizon: HorizonKey;
  start: number;
  end: number;
  label: string;
  stake: number;
  /** Les paris engagés, dans l'ordre d'ouverture. */
  entries: StakedBet[];
  pot: number;
  status: MancheStatus;
  /** Les gagnants, dans l'ordre d'ouverture — vide tant que rien n'est réglé. */
  winners: string[];
  /** Ce que chaque joueur reçoit au règlement (gain, part de pot ou mise rendue). */
  payouts: Map<string, number>;
  /** L'instant du règlement : la dernière résolution. `null` tant qu'il n'a pas eu lieu. */
  settledAt: number | null;
}

/** Deux justesses égales au centième près sont une égalité : le doigt n'est pas plus précis. */
const scoreOf = (accuracy: number) => Math.round(accuracy * 100);

/**
 * Le partage d'un pot entre gagnants, en ORBTC entiers.
 *
 * Le reste de la division va, une unité chacun, aux premiers à avoir parié :
 * rien ne se perd, et l'ordre ne dépend pas de l'affichage.
 */
function split(pot: number, winners: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  const share = Math.floor(pot / winners.length);
  let rest = pot - share * winners.length;
  for (const id of winners) {
    out.set(id, share + (rest > 0 ? 1 : 0));
    rest -= 1;
  }
  return out;
}

/**
 * Les manches, à partir des paris du club.
 *
 * Seuls comptent les paris ouverts depuis la genèse, par un membre qui y a
 * reçu sa part (`players`) : une mise venue de nulle part fausserait l'offre.
 */
export function buildManches(
  staked: readonly StakedBet[],
  players: ReadonlySet<string>,
  genesis: number,
  now: number,
): Manche[] {
  const groups = new Map<string, StakedBet[]>();
  for (const entry of staked) {
    const { bet } = entry;
    if (bet.openedAt < genesis || !players.has(bet.userId)) continue;
    const { start } = mancheWindow(bet.horizon, bet.openedAt);
    const key = `${bet.horizon}:${start}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  const manches: Manche[] = [];
  for (const [key, group] of groups) {
    const entries = group.slice().sort((x, y) => x.bet.openedAt - y.bet.openedAt);
    const horizon = entries[0]!.bet.horizon;
    const window = mancheWindow(horizon, entries[0]!.bet.openedAt);
    const stake = stakeFor(horizon);
    const pot = stake * entries.length;
    const lastResolution = Math.max(...entries.map(({ bet }) => bet.resolvesAt));

    let status: MancheStatus;
    if (now < window.end) status = 'open';
    else if (lastResolution > now) status = 'playing';
    else if (entries.length < 2) status = 'refunded';
    else if (entries.some(({ accuracy }) => accuracy === null)) status = 'pending';
    else status = 'settled';

    let winners: string[] = [];
    let payouts = new Map<string, number>();
    if (status === 'refunded') {
      payouts = new Map(entries.map(({ bet }) => [bet.userId, stake]));
    } else if (status === 'settled') {
      const best = Math.max(...entries.map(({ accuracy }) => scoreOf(accuracy!)));
      winners = entries
        .filter(({ accuracy }) => scoreOf(accuracy!) === best)
        .map(({ bet }) => bet.userId);
      payouts = split(pot, winners);
    }

    manches.push({
      key,
      horizon,
      start: window.start,
      end: window.end,
      label: mancheLabel(horizon, window.start),
      stake,
      entries,
      pot,
      status,
      winners,
      payouts,
      settledAt: status === 'settled' || status === 'refunded' ? lastResolution : null,
    });
  }

  return manches.sort((x, y) => y.start - x.start || x.horizon.localeCompare(y.horizon));
}

/** Une manche réglée, ou remboursée : ses ORBTC ont rejoint les portefeuilles. */
export const isClosed = (manche: Manche) =>
  manche.status === 'settled' || manche.status === 'refunded';

/**
 * La part de chacun à la genèse : l'offre divisée en parts égales.
 *
 * Avec sept membres, la division tombe juste. Sinon, le reste va, une unité
 * chacun, aux premiers identifiants — l'offre reste exactement de 21 millions.
 */
export function genesisShares(memberIds: readonly string[]): Map<string, number> {
  const ids = [...new Set(memberIds)].sort();
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const share = Math.floor(ORBTC_SUPPLY / ids.length);
  let rest = ORBTC_SUPPLY - share * ids.length;
  for (const id of ids) {
    out.set(id, share + (rest > 0 ? 1 : 0));
    rest -= 1;
  }
  return out;
}

export interface Holding {
  userId: string;
  /** Reçu à la genèse. */
  genesis: number;
  /** Ce qu'on peut encore miser. */
  available: number;
  /** Les mises engagées dans des manches pas encore réglées. */
  inPlay: number;
  /** `available + inPlay` : ce qu'on possède, pot en jeu compris. */
  total: number;
  /** Part de l'offre totale, entre 0 et 1. */
  share: number;
  /** `total − genesis` : ce qu'on a gagné (ou perdu) depuis la genèse. */
  delta: number;
}

/**
 * Les portefeuilles, du plus riche au plus pauvre.
 *
 * Invariant : la somme des `total` vaut toujours l'offre. Une mise engagée
 * reste comptée chez son joueur tant que sa manche n'est pas réglée.
 */
export function holdings(
  shares: ReadonlyMap<string, number>,
  manches: readonly Manche[],
): Holding[] {
  const net = new Map<string, number>();
  const engaged = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, value: number) =>
    map.set(id, (map.get(id) ?? 0) + value);

  for (const manche of manches) {
    for (const { bet } of manche.entries) {
      if (isClosed(manche))
        add(net, bet.userId, (manche.payouts.get(bet.userId) ?? 0) - manche.stake);
      else add(engaged, bet.userId, manche.stake);
    }
  }

  return [...shares.entries()]
    .map(([userId, genesis]) => {
      const total = genesis + (net.get(userId) ?? 0);
      const inPlay = engaged.get(userId) ?? 0;
      return {
        userId,
        genesis,
        available: total - inPlay,
        inPlay,
        total,
        share: total / ORBTC_SUPPLY,
        delta: total - genesis,
      };
    })
    .sort((x, y) => y.total - x.total || x.userId.localeCompare(y.userId));
}

export type MovementKind = 'won' | 'lost' | 'refunded' | 'engaged';

export interface Movement {
  manche: Manche;
  kind: MovementKind;
  /** Variation du portefeuille total : `+20 000`, `−10 000`, `0`, ou la mise engagée. */
  amount: number;
  /** Quand : le règlement, ou l'ouverture de mon pari si la manche court encore. */
  at: number;
  /** Ma justesse dans cette manche, si elle est jugée. */
  accuracy: number | null;
}

/** Mes mouvements d'ORBTC, du plus récent au plus ancien. */
export function movementsOf(userId: string | null, manches: readonly Manche[]): Movement[] {
  if (!userId) return [];
  const out: Movement[] = [];
  for (const manche of manches) {
    const mine = manche.entries.find(({ bet }) => bet.userId === userId);
    if (!mine) continue;
    if (manche.status === 'refunded') {
      out.push({
        manche,
        kind: 'refunded',
        amount: 0,
        at: manche.settledAt!,
        accuracy: mine.accuracy,
      });
    } else if (manche.status === 'settled') {
      const amount = (manche.payouts.get(userId) ?? 0) - manche.stake;
      out.push({
        manche,
        kind: amount > 0 ? 'won' : 'lost',
        amount,
        at: manche.settledAt!,
        accuracy: mine.accuracy,
      });
    } else {
      out.push({
        manche,
        kind: 'engaged',
        amount: manche.stake,
        at: mine.bet.openedAt,
        accuracy: null,
      });
    }
  }
  return out.sort((x, y) => y.at - x.at);
}

/** `3 000 000 ORBTC` — espace insécable étroite, comme les autres montants. */
export function formatOrbtc(value: number): string {
  return `${formatInteger(value)} ORBTC`;
}

/** `14,29 %` — la part de l'offre, à deux décimales. */
export function formatShare(share: number): string {
  const body = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(share * 100);
  return `${body.replace(/[\s  ]/g, ' ')} %`;
}
