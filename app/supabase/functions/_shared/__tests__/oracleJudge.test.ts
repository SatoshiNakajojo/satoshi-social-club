import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { accuracyPercent, seriesForPeriod, verdict, type PricePoint } from '../oracleJudge.ts';

const DAY = 86_400_000;
const OPENED = Date.UTC(2026, 9, 5, 0, 0);
const RESOLVES = OPENED + 7 * DAY;

/** Un cours horaire, comme CoinGecko le rend sur une semaine : `[ms, dollars]`. */
const hourly = (price: (day: number) => number) =>
  Array.from({ length: 7 * 24 + 1 }, (_, h) => {
    const ms = OPENED + h * 3_600_000;
    return [ms, price((ms - OPENED) / DAY)] as [number, number];
  });

describe('le juge de l’Oracle', () => {
  it('ramène le cours dans la base de temps du pari, sans rien avant ni après', () => {
    const prices: [number, number][] = [
      [OPENED - DAY, 100],
      [OPENED + DAY, 110],
      [OPENED, 105],
      [RESOLVES + DAY, 120],
      [OPENED + 2 * DAY, Number.NaN],
      [OPENED + 3 * DAY, 0],
    ];
    assert.deepEqual(seriesForPeriod(prices, OPENED, RESOLVES), [
      [0, 105],
      [1, 110],
    ]);
  });

  it('un tracé confondu avec le cours vaut 100', () => {
    const path: PricePoint[] = [
      [0, 100_000],
      [7, 107_000],
    ];
    const prices = hourly((day) => 100_000 + day * 1000);
    assert.equal(verdict(path, prices, OPENED, RESOLVES), 100);
  });

  it('un tracé 10 % au-dessus du cours vaut 90', () => {
    const path: PricePoint[] = [
      [0, 110_000],
      [7, 110_000],
    ];
    const prices = hourly(() => 100_000);
    assert.equal(verdict(path, prices, OPENED, RESOLVES), 90);
  });

  it('arrondit au centième, et refuse de juger sans cours', () => {
    const path: PricePoint[] = [
      [0, 100_000],
      [7, 101_234],
    ];
    const v = verdict(
      path,
      hourly(() => 100_000),
      OPENED,
      RESOLVES,
    )!;
    assert.equal(v, Math.round(v * 100) / 100);
    assert.equal(verdict(path, [], OPENED, RESOLVES), null);
    assert.equal(accuracyPercent(path, []), null);
  });
});
