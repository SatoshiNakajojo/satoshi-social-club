/**
 * Les ORBTC, côté app et côté base, disent-ils la même chose ?
 *
 * Les mises et la genèse sont écrites deux fois, et c'est voulu : la base
 * refuse un pari faute d'ORBTC et règle les manches, l'app les affiche. Ce test
 * lit la migration comme du texte et la compare aux modules TypeScript, sur le
 * modèle de `horizons-sql.test.mjs`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SQL = readFileSync(
  path.join(ROOT, 'supabase/migrations/20261018090000_orbtc.sql'),
  'utf8',
);
const ORBTC = readFileSync(path.join(ROOT, 'src/features/oracle/orbtc.ts'), 'utf8');
const HORIZONS = readFileSync(path.join(ROOT, 'src/lib/horizons.ts'), 'utf8');

/** `when '1w' then 10000` → { '1w': 10000 }, dans `orbtc_stake`. */
function sqlStakes() {
  const body = SQL.slice(SQL.indexOf('function public.orbtc_stake('));
  const out = {};
  for (const m of body.slice(0, body.indexOf('$$;')).matchAll(/when '(\w+)'\s+then (\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

/** `BASE_STAKE × weight`, pour chaque horizon de `horizons.ts`. */
function tsStakes() {
  const base = Number(/export const BASE_STAKE = ([\d_]+);/.exec(ORBTC)[1].replaceAll('_', ''));
  const out = {};
  for (const m of HORIZONS.matchAll(/\{\s*key:\s*'(\w+)'[^}]*?weight:\s*([\d.]+)\s*,?\s*\}/g)) {
    out[m[1]] = Math.round(base * Number(m[2]));
  }
  return out;
}

describe('les ORBTC, app et base', () => {
  it('les mises par horizon sont les mêmes', () => {
    const app = tsStakes();
    assert.equal(Object.keys(app).length, 6, 'six horizons lus dans horizons.ts');
    assert.deepEqual(sqlStakes(), app);
  });

  it('la même offre', () => {
    const ts = Number(
      /export const ORBTC_SUPPLY = ([\d_]+);/.exec(ORBTC)[1].replaceAll('_', ''),
    );
    const sql = Number(/supply\s+bigint not null default (\d+)/.exec(SQL)[1]);
    assert.equal(sql, ts);
  });

  it('la même date de genèse', () => {
    const ts = Date.parse(/ORBTC_GENESIS = Date\.parse\('([^']+)'\)/.exec(ORBTC)[1]);
    const sql = Date.parse(
      /values \('([^']+)'\)\s*on conflict \(id\) do nothing/
        .exec(SQL)[1]
        .replace(' ', 'T')
        .replace('+11', '+11:00'),
    );
    assert.equal(sql, ts);
  });
});
