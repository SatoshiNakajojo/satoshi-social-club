/**
 * À venir ou passée : où ranger une soirée.
 *
 * Une soirée passe dans l'historique **le lendemain**, à Nouméa : celle de ce
 * soir reste dans « À venir » toute la journée, et toute la nuit. La couper à
 * l'heure pile la ferait disparaître pendant qu'on s'y rend.
 */

import { clubDayKey } from '@/lib/monthGrid';

/** La soirée a-t-elle eu lieu un jour déjà passé, au club ? */
export function isPastNight(startsAt: string, now: number): boolean {
  const day = clubDayKey(startsAt);
  const today = clubDayKey(new Date(now).toISOString());
  return day !== '' && day < today;
}

/**
 * Les soirées à venir, de la plus proche à la plus lointaine, et les
 * passées, de la plus récente à la plus ancienne : on relit d'abord la
 * dernière.
 */
export function splitNights<T extends { startsAt: string }>(
  events: readonly T[],
  now: number,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const event of events) (isPastNight(event.startsAt, now) ? past : upcoming).push(event);
  upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  past.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}
