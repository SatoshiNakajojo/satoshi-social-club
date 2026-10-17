import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { MemberAvatar } from '@/components/MemberAvatar';
import { Micro } from '@/components/ui/Micro';
import { formatOrbtc, type Manche } from '@/features/oracle/orbtc';
import type { OrbtcState } from '@/features/oracle/useOrbtc';
import { formatClubDate, formatInteger } from '@/lib/format';
import type { Member } from '@/types/domain';
import { a, c, f, radius } from '@/theme/tokens';

export interface MancheCardProps {
  current: OrbtcState['current'];
  /** La manche de mon pari en cours, si ce n'est pas la courante. */
  myManche: Manche | null;
  membersById: Map<string, Member>;
  started: boolean;
  genesis: number;
  /** Connecté et membre : sinon on ne parle pas de solde. */
  canBet: boolean;
  canStake: boolean;
}

/**
 * Le pot de la manche ouverte, sur l'horizon affiché.
 *
 * C'est ce qu'on joue en déposant un tracé : on le voit **avant** de parier —
 * la mise, le pot, qui est déjà dedans, et jusqu'à quand on peut y entrer.
 */
export function MancheCard({
  current,
  myManche,
  membersById,
  started,
  genesis,
  canBet,
  canStake,
}: MancheCardProps) {
  if (!started) {
    return (
      <Shell>
        <Micro tracking={1.6}>MANCHES EN ORBTC</Micro>
        <Text style={{ fontFamily: f.serifItalic, fontSize: 15, color: c.parchment }}>
          {`Les premières manches s’ouvriront à la genèse, le ${formatClubDate(genesis).toLowerCase()}.`}
        </Text>
      </Shell>
    );
  }

  const manche = current.manche;
  const players = manche?.entries.map(({ bet }) => bet.userId) ?? [];
  const pot = manche?.pot ?? 0;
  // `end` est exclu : le dernier jour d'entrée est la veille.
  const lastDay = formatClubDate(current.end - 1).replace(/ \d{4}$/, '');
  const elsewhere = myManche && myManche.key !== manche?.key ? myManche : null;

  return (
    <Shell>
      <Micro tracking={1.6} numberOfLines={1}>
        {`MANCHE · ${current.label}`}
      </Micro>

      <View className="flex-row items-end justify-between">
        <View className="flex-row items-baseline" style={{ gap: 6 }}>
          <Micro size={8.5} tracking={1.4} style={{ color: c.sepiaMuted }}>
            POT
          </Micro>
          <Text
            style={{
              fontFamily: f.serif,
              fontSize: 26,
              color: c.ivory,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatInteger(pot)}
          </Text>
          <Micro size={8.5} tracking={1.4} style={{ color: c.gold }}>
            ORBTC
          </Micro>
        </View>
        <Players ids={players} membersById={membersById} />
      </View>

      <Micro tracking={1.1} size={8} style={{ color: c.sepiaDim, lineHeight: 14 }}>
        {`MISE ${formatOrbtc(current.stake)} · ${players.length} JOUEUR${players.length > 1 ? 'S' : ''} · ENTRÉES JUSQU’AU ${lastDay}`}
      </Micro>

      <Text style={{ fontFamily: f.sans, fontSize: 10, lineHeight: 15, color: c.sepiaFaint }}>
        Le tracé le plus juste emporte le pot ; seul dans la manche, on récupère sa mise.
      </Text>

      {elsewhere ? (
        <Text style={{ fontFamily: f.sans, fontSize: 11, lineHeight: 16, color: c.parchment }}>
          {`Votre pari en cours joue dans la manche ${inSentence(elsewhere)} — pot de ${formatOrbtc(elsewhere.pot)}, ${elsewhere.entries.length} joueur${elsewhere.entries.length > 1 ? 's' : ''}.`}
        </Text>
      ) : null}

      {canBet && !canStake ? (
        <Text style={{ fontFamily: f.sans, fontSize: 11, lineHeight: 16, color: c.oxblood }}>
          Solde disponible insuffisant pour la mise de cet horizon.
        </Text>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: a.cardBorderOpen,
        backgroundColor: c.surfaceDeep,
        padding: 15,
        paddingHorizontal: 16,
        gap: 10,
      }}
    >
      {children}
    </View>
  );
}

/** Les joueurs déjà dans la manche, en avatars qui se chevauchent. */
function Players({ ids, membersById }: { ids: string[]; membersById: Map<string, Member> }) {
  if (ids.length === 0) {
    return (
      <Text style={{ fontFamily: f.serifItalic, fontSize: 13, color: c.sepia }}>
        Personne encore
      </Text>
    );
  }
  return (
    <View className="flex-row">
      {ids.map((id, index) => (
        <View key={id} style={{ marginLeft: index === 0 ? 0 : -7 }}>
          <MemberAvatar
            member={membersById.get(id) ?? null}
            size={24}
            ringColor={c.surfaceDeep}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Le nom d'une manche au fil d'une phrase : `sem. du 05 oct 2026`, `octobre
 * 2026` — mais `T3 2026` et `S2 2026` gardent leur capitale, ce sont des sigles.
 */
function inSentence(manche: Manche): string {
  return manche.horizon === '1w' || manche.horizon === '2w' || manche.horizon === '1m'
    ? manche.label.toLowerCase()
    : manche.label;
}
