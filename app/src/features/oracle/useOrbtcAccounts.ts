import { useEffect, useMemo, useState } from 'react';

import { useAppRefresh } from '@/hooks/useAppRefresh';
import { supabase } from '@/lib/supabase';
import { MOCK_ORBTC_GENESIS } from '@/mocks/oracle';
import type { Member } from '@/types/domain';
import { genesisShares } from './orbtc';

export interface OrbtcAccounts {
  /** La base connaît les ORBTC (migration appliquée), ou le mode démo. */
  enabled: boolean;
  genesis: number;
  /** La part de chacun à la genèse — figée par la base, ou projetée avant elle. */
  shares: Map<string, number>;
  /** `true` : les parts viennent de la photo prise à la genèse. */
  frozen: boolean;
}

/**
 * La genèse des ORBTC et la part de chaque membre.
 *
 * Avec un backend, les deux viennent de la base (`orbtc_config`,
 * `orbtc_accounts`) : la photo du club se prend à la genèse, une fois, et un
 * membre arrivé ensuite n'en change pas la répartition. Avant la genèse, on
 * montre ce que chacun recevra — l'offre divisée entre les membres d'aujourd'hui.
 *
 * Une base sans la migration n'a pas d'ORBTC : `enabled` reste faux, et l'écran
 * ne montre rien plutôt qu'un solde que personne ne garantit.
 */
export function useOrbtcAccounts(members: readonly Member[], now: number): OrbtcAccounts {
  const [genesis, setGenesis] = useState<number | null>(supabase ? null : MOCK_ORBTC_GENESIS);
  const [frozen, setFrozen] = useState<Map<string, number> | null>(null);
  const refresh = useAppRefresh();
  /** La genèse est passée depuis le dernier chargement : on relit pour avoir la photo. */
  const due = genesis !== null && now >= genesis && frozen === null;

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let cancelled = false;

    (async () => {
      const config = await client.from('orbtc_config').select('genesis_at').maybeSingle();
      if (cancelled) return;
      const at = config.data ? Date.parse(config.data.genesis_at) : Number.NaN;
      if (config.error || !Number.isFinite(at)) {
        setGenesis(null);
        return;
      }
      setGenesis(at);

      if (Date.now() >= at) {
        // La première lecture après la genèse prend la photo, si personne ne
        // l'a encore prise. Sans effet ensuite.
        await client.rpc('orbtc_ensure_accounts');
      }
      const accounts = await client.from('orbtc_accounts').select('user_id, genesis_share');
      if (cancelled) return;
      setFrozen(
        accounts.data && accounts.data.length > 0
          ? new Map(accounts.data.map((row) => [row.user_id, Number(row.genesis_share)]))
          : null,
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh, due]);

  return useMemo(() => {
    const projected = genesisShares(members.map((member) => member.id));
    return {
      enabled: genesis !== null,
      genesis: genesis ?? Number.POSITIVE_INFINITY,
      shares: supabase && frozen ? frozen : projected,
      frozen: Boolean(supabase ? frozen : genesis !== null && now >= genesis),
    };
  }, [members, genesis, frozen, now]);
}
