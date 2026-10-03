import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPastNight, splitNights } from '@/features/nights/nightTimeline';

// Le 27 septembre 2026, 10 h à Nouméa (UTC+11).
const NOW = Date.parse('2026-09-27T10:00:00+11:00');

describe('à venir ou dans l’historique', () => {
  it('une soirée passe dans l’historique le lendemain, à Nouméa', () => {
    assert.equal(isPastNight('2026-09-26T19:30:00+11:00', NOW), true);
    // Ce soir : encore à venir, et même à 23 h 59.
    assert.equal(isPastNight('2026-09-27T19:30:00+11:00', NOW), false);
    assert.equal(
      isPastNight('2026-09-27T19:30:00+11:00', Date.parse('2026-09-27T23:59:00+11:00')),
      false,
    );
    // Ce matin, déjà commencée : la journée n'est pas finie.
    assert.equal(isPastNight('2026-09-27T08:00:00+11:00', NOW), false);
    assert.equal(isPastNight('pas une date', NOW), false);
  });

  it('ne se trompe pas de jour à cause de l’heure UTC', () => {
    // 20 h à Nouméa le 26 = 9 h UTC le 26 ; le 27 à 1 h du matin à Nouméa,
    // c'est encore le 26 en UTC — mais déjà le lendemain au club.
    assert.equal(
      isPastNight('2026-09-26T20:00:00+11:00', Date.parse('2026-09-27T01:00:00+11:00')),
      true,
    );
  });

  it('range les à venir du plus proche, les passées de la plus récente', () => {
    const nights = [
      { id: 'a', startsAt: '2026-10-03T19:30:00+11:00' },
      { id: 'b', startsAt: '2026-09-18T20:00:00+11:00' },
      { id: 'c', startsAt: '2026-09-27T19:30:00+11:00' },
      { id: 'd', startsAt: '2026-09-25T19:30:00+11:00' },
    ];
    const { upcoming, past } = splitNights(nights, NOW);
    assert.deepEqual(
      upcoming.map((night) => night.id),
      ['c', 'a'],
    );
    assert.deepEqual(
      past.map((night) => night.id),
      ['d', 'b'],
    );
  });
});
