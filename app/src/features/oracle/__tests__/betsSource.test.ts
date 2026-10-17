import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { betFromRow, type BetRow } from '@/features/oracle/betting';
import { isMissingVerdict } from '@/features/oracle/betsSource';

const row = (extra: Partial<BetRow> = {}): BetRow => ({
  id: 'p1',
  user_id: 'u1',
  horizon: '1w',
  opened_at: '2026-10-05T09:00:00Z',
  locked_at: '2026-10-06T09:00:00Z',
  resolves_at: '2026-10-12T09:00:00Z',
  path_data: [
    [0, 110000],
    [7, 120000],
  ],
  hash: '8F2A',
  ...extra,
});

describe('le verdict du serveur, lu dans une ligne', () => {
  it('nombre ou chaîne : `numeric` arrive sous les deux formes', () => {
    assert.equal(
      betFromRow(row({ accuracy: 91.25, judged_at: '2026-10-12T10:00:00Z' }))!.accuracy,
      91.25,
    );
    assert.equal(
      betFromRow(row({ accuracy: '84.10', judged_at: '2026-10-12T10:00:00Z' }))!.accuracy,
      84.1,
    );
  });

  it('pas encore jugé, ou base pas encore migrée : ni verdict, ni date', () => {
    const fresh = betFromRow(row({ accuracy: null, judged_at: null }))!;
    assert.equal(fresh.accuracy, null);
    assert.equal(fresh.judgedAt, null);
    const legacy = betFromRow(row())!;
    assert.equal(legacy.accuracy, null);
    assert.equal(legacy.judgedAt, null);
  });

  it('jugé sans justesse possible : une date, pas de chiffre', () => {
    const judged = betFromRow(row({ accuracy: null, judged_at: '2026-10-12T10:00:00Z' }))!;
    assert.equal(judged.accuracy, null);
    assert.equal(judged.judgedAt, Date.parse('2026-10-12T10:00:00Z'));
  });
});

describe('une base sans la migration des ORBTC', () => {
  it('se reconnaît à la colonne inconnue', () => {
    assert.ok(
      isMissingVerdict({
        code: '42703',
        message: 'column predictions.accuracy does not exist',
      }),
    );
    assert.ok(isMissingVerdict({ message: 'column "judged_at" does not exist' }));
    assert.ok(!isMissingVerdict({ code: '42501', message: 'permission denied' }));
    assert.ok(!isMissingVerdict(null));
  });
});
