import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Bet } from '@/features/oracle/betting';
import {
  ORBTC_SUPPLY,
  buildManches,
  formatOrbtc,
  formatShare,
  genesisShares,
  holdings,
  mancheLabel,
  mancheWindow,
  movementsOf,
  stakeFor,
  type StakedBet,
} from '@/features/oracle/orbtc';
import { scheduleFor, type HorizonKey } from '@/lib/horizons';

const DAY = 86_400_000;
/** Un instant à l'heure de Nouméa. */
const club = (iso: string) => Date.parse(`${iso}+11:00`);

const GENESIS = club('2026-09-01T00:00:00');
const SEVEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const PLAYERS = new Set(SEVEN);

let sequence = 0;
/** Un pari ouvert à `openedAt`, jugé à `accuracy` une fois résolu. */
const staked = (
  userId: string,
  horizon: HorizonKey,
  openedAt: number,
  accuracy: number | null = null,
): StakedBet => {
  sequence += 1;
  const schedule = scheduleFor(horizon, openedAt);
  const bet: Bet = {
    id: `bet-${sequence}`,
    userId,
    horizon,
    openedAt: schedule.openedAt,
    lockedAt: schedule.locksAt,
    resolvesAt: schedule.resolvesAt,
    path: [],
    hash: null,
  };
  return { bet, accuracy };
};

describe('mises', () => {
  it('la mise de base, multipliée par le poids de l’horizon', () => {
    assert.equal(stakeFor('1w'), 10_000);
    assert.equal(stakeFor('2w'), 12_500);
    assert.equal(stakeFor('1m'), 15_000);
    assert.equal(stakeFor('3m'), 20_000);
    assert.equal(stakeFor('6m'), 30_000);
    assert.equal(stakeFor('12m'), 40_000);
  });
});

describe('périodes de manche, à l’heure de Nouméa', () => {
  it('une semaine va du lundi minuit au lundi suivant', () => {
    // Samedi 17 octobre 2026, 23 h 30 à Nouméa : déjà dimanche nulle part, et
    // pas encore la semaine suivante.
    const w = mancheWindow('1w', club('2026-10-17T23:30:00'));
    assert.equal(w.start, club('2026-10-12T00:00:00'));
    assert.equal(w.end, club('2026-10-19T00:00:00'));
  });

  it('le lundi minuit ouvre la semaine suivante', () => {
    assert.equal(
      mancheWindow('1w', club('2026-10-19T00:00:00')).start,
      club('2026-10-19T00:00:00'),
    );
  });

  it('deux quinzaines successives se touchent sans se chevaucher', () => {
    const first = mancheWindow('2w', club('2026-10-14T12:00:00'));
    const next = mancheWindow('2w', first.end);
    assert.equal(first.end - first.start, 14 * DAY);
    assert.equal(next.start, first.end);
    // Un lundi : l'origine des quinzaines en est un.
    assert.equal(new Date(first.start + 11 * 3_600_000).getUTCDay(), 1);
  });

  it('mois, trimestre, semestre, année : le calendrier civil', () => {
    const at = club('2026-11-20T10:00:00');
    assert.deepEqual(mancheWindow('1m', at), {
      start: club('2026-11-01T00:00:00'),
      end: club('2026-12-01T00:00:00'),
    });
    assert.deepEqual(mancheWindow('3m', at), {
      start: club('2026-10-01T00:00:00'),
      end: club('2027-01-01T00:00:00'),
    });
    assert.deepEqual(mancheWindow('6m', at), {
      start: club('2026-07-01T00:00:00'),
      end: club('2027-01-01T00:00:00'),
    });
    assert.deepEqual(mancheWindow('12m', at), {
      start: club('2026-01-01T00:00:00'),
      end: club('2027-01-01T00:00:00'),
    });
  });

  it('chaque manche a un nom lisible', () => {
    const at = club('2026-10-14T12:00:00');
    assert.equal(mancheLabel('1w', mancheWindow('1w', at).start), 'SEM. DU 12 OCT 2026');
    assert.equal(mancheLabel('1m', mancheWindow('1m', at).start), 'OCTOBRE 2026');
    assert.equal(mancheLabel('3m', mancheWindow('3m', at).start), 'T4 2026');
    assert.equal(mancheLabel('6m', mancheWindow('6m', at).start), 'S2 2026');
    assert.equal(mancheLabel('12m', mancheWindow('12m', at).start), '2026');
  });
});

describe('genèse', () => {
  it('sept membres : sept parts égales de 3 000 000', () => {
    const shares = genesisShares(SEVEN);
    assert.equal(shares.size, 7);
    for (const value of shares.values()) assert.equal(value, 3_000_000);
  });

  it('une division qui ne tombe pas juste garde l’offre exacte', () => {
    const shares = genesisShares(['x', 'y', 'z', 'w', 'v', 'u', 't', 's']);
    const total = [...shares.values()].reduce((sum, value) => sum + value, 0);
    assert.equal(total, ORBTC_SUPPLY);
    const values = [...shares.values()];
    assert.ok(Math.max(...values) - Math.min(...values) <= 1);
  });
});

describe('manches', () => {
  const monday = club('2026-10-05T09:00:00');

  it('le tracé le plus juste emporte le pot', () => {
    const now = monday + 30 * DAY;
    const [manche] = buildManches(
      [
        staked('a', '1w', monday, 91),
        staked('b', '1w', monday + DAY, 84),
        staked('c', '1w', monday + 2 * DAY, 60),
      ],
      PLAYERS,
      GENESIS,
      now,
    );
    assert.equal(manche!.status, 'settled');
    assert.equal(manche!.pot, 30_000);
    assert.deepEqual(manche!.winners, ['a']);
    assert.equal(manche!.payouts.get('a'), 30_000);
  });

  it('à égalité, le pot se partage — le reste va au premier à avoir parié', () => {
    const now = monday + 30 * DAY;
    const [manche] = buildManches(
      [
        staked('a', '3m', monday, 88.004),
        staked('b', '3m', monday + DAY, 88.001),
        staked('c', '3m', monday + 2 * DAY, 40),
      ],
      PLAYERS,
      GENESIS,
      now + 120 * DAY,
    );
    assert.deepEqual(manche!.winners, ['a', 'b']);
    assert.equal(manche!.payouts.get('a'), 30_000);
    assert.equal(manche!.payouts.get('b'), 30_000);
  });

  it('seul dans sa manche, on récupère sa mise', () => {
    const [manche] = buildManches(
      [staked('a', '1w', monday, 99)],
      PLAYERS,
      GENESIS,
      monday + 30 * DAY,
    );
    assert.equal(manche!.status, 'refunded');
    assert.equal(manche!.payouts.get('a'), 10_000);
  });

  it('ouverte, puis en jeu, puis en attente du cours', () => {
    const bets = [staked('a', '1w', monday), staked('b', '1w', monday + DAY)];
    const status = (now: number, list = bets) =>
      buildManches(list, PLAYERS, GENESIS, now)[0]!.status;
    assert.equal(status(monday + 2 * DAY), 'open');
    assert.equal(status(club('2026-10-12T01:00:00')), 'playing');
    assert.equal(status(monday + 30 * DAY), 'pending');
  });

  it('deux semaines différentes font deux manches', () => {
    const manches = buildManches(
      [staked('a', '1w', monday), staked('b', '1w', monday + 7 * DAY)],
      PLAYERS,
      GENESIS,
      monday,
    );
    assert.equal(manches.length, 2);
  });

  it('avant la genèse, ou d’un inconnu : rien n’est engagé', () => {
    const manches = buildManches(
      [staked('a', '1w', GENESIS - DAY, 90), staked('intrus', '1w', monday, 90)],
      PLAYERS,
      GENESIS,
      monday + 30 * DAY,
    );
    assert.equal(manches.length, 0);
  });
});

describe('portefeuilles', () => {
  const monday = club('2026-10-05T09:00:00');
  const now = monday + 60 * DAY;
  const manches = buildManches(
    [
      staked('a', '1w', monday, 91),
      staked('b', '1w', monday + DAY, 84),
      staked('c', '1w', monday + 2 * DAY, 60),
      // En cours : un an, ouvert il y a peu.
      staked('a', '12m', now - 3 * DAY),
      staked('d', '12m', now - 2 * DAY),
    ],
    PLAYERS,
    GENESIS,
    now,
  );
  const rows = holdings(genesisShares(SEVEN), manches);
  const of = (id: string) => rows.find((row) => row.userId === id)!;

  it('l’offre se conserve, mises en jeu comprises', () => {
    assert.equal(
      rows.reduce((sum, row) => sum + row.total, 0),
      ORBTC_SUPPLY,
    );
  });

  it('le gagnant prend les mises des autres ; une mise engagée n’est plus disponible', () => {
    assert.equal(of('a').delta, 20_000);
    assert.equal(of('a').inPlay, 40_000);
    assert.equal(of('a').available, 3_000_000 + 20_000 - 40_000);
    assert.equal(of('b').delta, -10_000);
    assert.equal(of('c').delta, -10_000);
    assert.equal(of('d').delta, 0);
    assert.equal(of('d').available, 3_000_000 - 40_000);
  });

  it('du plus riche au plus pauvre', () => {
    assert.equal(rows[0]!.userId, 'a');
    assert.ok(rows.every((row, i) => i === 0 || rows[i - 1]!.total >= row.total));
  });

  it('mes mouvements : la manche en cours d’abord, puis les gains', () => {
    const moves = movementsOf('a', manches);
    assert.deepEqual(
      moves.map((move) => [move.kind, move.amount]),
      [
        ['engaged', 40_000],
        ['won', 20_000],
      ],
    );
    assert.deepEqual(
      movementsOf('b', manches).map((move) => [move.kind, move.amount]),
      [['lost', -10_000]],
    );
    assert.deepEqual(movementsOf(null, manches), []);
  });
});

describe('formatage', () => {
  it('espaces insécables étroites, à la française', () => {
    assert.equal(formatOrbtc(3_000_000), '3 000 000 ORBTC');
    assert.equal(formatShare(1 / 7), '14,29 %');
  });
});
