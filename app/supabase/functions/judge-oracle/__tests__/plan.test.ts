import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { judge, pathOf, rangeUrl, type PendingBet } from '../plan.ts';

const DAY = 86_400_000;
const OPENED = Date.UTC(2026, 9, 5, 9, 0);
const RESOLVES = OPENED + 7 * DAY;

const bet = (path: unknown, attempts = 0): PendingBet => ({
  id: 'p1',
  opened_at: new Date(OPENED).toISOString(),
  resolves_at: new Date(RESOLVES).toISOString(),
  path_data: path,
  judge_attempts: attempts,
});

/** Un cours horaire plat à 100 000 $ sur la période. */
const flat = Array.from(
  { length: 7 * 24 + 1 },
  (_, h) => [OPENED + h * 3_600_000, 100_000] as [number, number],
);

describe('le juge de l’Oracle (judge-oracle)', () => {
  it('juge un pari sur le cours de sa période', () => {
    const decision = judge(
      bet([
        [0, 110_000],
        [7, 110_000],
      ]),
      flat,
    );
    assert.deepEqual(decision, { kind: 'judged', accuracy: 90 });
  });

  it('un pari sans tracé est clos sans justesse', () => {
    assert.deepEqual(judge(bet([]), flat), { kind: 'judged', accuracy: null });
    assert.deepEqual(judge(bet('pas un tracé'), null), { kind: 'judged', accuracy: null });
  });

  it('sans cours, on ne devine pas : on retente plus tard', () => {
    assert.deepEqual(
      judge(
        bet(
          [
            [0, 1],
            [7, 2],
          ],
          3,
        ),
        null,
      ),
      {
        kind: 'retry',
        attempts: 4,
        reason: 'cours indisponible',
      },
    );
    assert.equal(
      judge(
        bet([
          [0, 1],
          [7, 2],
        ]),
        [],
      ).kind,
      'retry',
    );
  });

  it('écarte les points invalides du tracé', () => {
    assert.deepEqual(
      pathOf(
        bet([
          [0, 1],
          [1, -5],
          ['x', 2],
          [2, 3],
        ]),
      ),
      [
        [0, 1],
        [2, 3],
      ],
    );
  });

  it('demande exactement la période, en secondes', () => {
    const url = new URL(rangeUrl(OPENED, RESOLVES, 'clé'));
    assert.equal(url.pathname, '/api/v3/coins/bitcoin/market_chart/range');
    assert.equal(url.searchParams.get('from'), String(OPENED / 1000));
    assert.equal(url.searchParams.get('to'), String(RESOLVES / 1000));
    assert.equal(url.searchParams.get('x_cg_demo_api_key'), 'clé');
  });
});
