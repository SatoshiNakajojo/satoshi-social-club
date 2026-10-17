/**
 * La justesse d'un pari de l'Oracle — le juge.
 *
 * Module pur : ni réseau, ni Deno, ni React. L'application et la fonction Edge
 * `judge-oracle` l'utilisent toutes deux : un pari jugé par le serveur et un
 * pari jugé à l'écran sortent du même code, à la virgule près.
 *
 * Les courbes sont en **prix** : `[jour depuis l'ouverture du pari, dollars]`.
 */

/** `[jour, prix]` — en jours depuis l'ouverture du pari. */
export type PricePoint = readonly [day: number, price: number];

/** Le tracé est confondu avec le cours. */
export const PERFECT = 100;

const DAY_MS = 86_400_000;

/**
 * Seconde composante de la polyligne à la première demandée.
 *
 * Générique aux deux espaces : une ordonnée de toile pour des points de toile,
 * un prix pour des `PricePoint`. C'est la même interpolation, et la dupliquer
 * ferait diverger deux copies au premier correctif.
 */
export function interpolateY(
  points: readonly (readonly [number, number])[],
  atX: number,
): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (atX <= first[0]) return first[1];
  if (atX >= last[0]) return last[1];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (atX <= b[0]) {
      const span = b[0] - a[0];
      if (span === 0) return b[1];
      const t = (atX - a[0]) / span;
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return last[1];
}

/**
 * Écart absolu moyen entre une prédiction et la courbe réelle, en % (README §7.3).
 * Les deux séries sont ré-échantillonnées sur les jours communs par
 * interpolation linéaire ; renvoie `null` si le recouvrement est vide.
 */
export function meanAbsoluteGap(
  prediction: readonly PricePoint[],
  actual: readonly PricePoint[],
): number | null {
  if (prediction.length < 2 || actual.length < 2) return null;

  const from = Math.max(prediction[0]![0], actual[0]![0]);
  const to = Math.min(prediction[prediction.length - 1]![0], actual[actual.length - 1]![0]);
  if (!(to > from)) return null;

  const SAMPLES = 64;
  let total = 0;
  let counted = 0;

  for (let i = 0; i <= SAMPLES; i++) {
    const at = from + ((to - from) * i) / SAMPLES;
    const predicted = interpolateY(prediction, at);
    const real = interpolateY(actual, at);
    if (real === 0) continue;
    total += Math.abs((predicted - real) / real) * 100;
    counted += 1;
  }

  return counted === 0 ? null : total / counted;
}

/**
 * À quel point un tracé colle au cours réel, en pourcentage — voir
 * `src/lib/accuracy.ts` pour la lecture de ce chiffre.
 *
 * `null` tant qu'il n'y a rien à comparer : renvoyer zéro se lirait comme
 * « vous vous trompez complètement », alors qu'on ne sait simplement pas.
 */
export function accuracyPercent(
  prediction: readonly PricePoint[],
  actual: readonly PricePoint[],
): number | null {
  const error = meanAbsoluteGap(prediction, actual);
  if (error === null) return null;
  // Borné en bas : une erreur de 300 % donnerait -200, ce qui n'est pas une
  // justesse. Borné en haut par construction, l'erreur n'étant jamais négative.
  return Math.max(0, Math.min(PERFECT, PERFECT - error));
}

/**
 * Le cours d'un pari, tel que CoinGecko le rend (`[ms, dollars]`), ramené dans
 * la base de temps du pari : jours depuis son ouverture, rien avant, rien après
 * sa résolution. Les points invalides sont écartés.
 */
export function seriesForPeriod(
  prices: readonly (readonly [number, number])[],
  openedAt: number,
  resolvesAt: number,
): PricePoint[] {
  return prices
    .filter(
      ([ms, price]) =>
        Number.isFinite(ms) &&
        Number.isFinite(price) &&
        price > 0 &&
        ms >= openedAt &&
        ms <= resolvesAt,
    )
    .sort((a, b) => a[0] - b[0])
    .map(([ms, price]) => [(ms - openedAt) / DAY_MS, price] as PricePoint);
}

/**
 * Le verdict, arrondi au centième : c'est ce chiffre qui est écrit en base, et
 * c'est lui que comparent les manches d'ORBTC. Au-delà, le doigt n'est pas plus
 * précis, et deux machines pourraient différer sur la dernière décimale.
 */
export function verdict(
  path: readonly PricePoint[],
  prices: readonly (readonly [number, number])[],
  openedAt: number,
  resolvesAt: number,
): number | null {
  const accuracy = accuracyPercent(path, seriesForPeriod(prices, openedAt, resolvesAt));
  return accuracy === null ? null : Math.round(accuracy * 100) / 100;
}
