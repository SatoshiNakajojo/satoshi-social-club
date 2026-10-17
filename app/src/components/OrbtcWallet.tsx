import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Micro } from '@/components/ui/Micro';
import { ORBTC_SUPPLY, formatOrbtc, formatShare } from '@/features/oracle/orbtc';
import type { MemberHolding } from '@/features/oracle/useOrbtc';
import { formatClubDate, formatInteger, formatPoints } from '@/lib/format';
import { c, cardGradient, f, radius } from '@/theme/tokens';

export interface OrbtcWalletProps {
  me: MemberHolding | null;
  holdings: MemberHolding[];
  /** Les ORBTC engagés dans des manches pas encore réglées, tout le club confondu. */
  inPlay: number;
  started: boolean;
  genesis: number;
}

/**
 * Mon portefeuille d'ORBTC, en tête de l'Oracle.
 *
 * Trois chiffres, dans l'ordre où l'on se pose les questions : combien j'ai,
 * quelle part du club ça représente, et ce que j'ai gagné depuis la genèse.
 * Dessous, la barre de l'offre : les 21 millions, à la couleur de chacun —
 * égale au départ, elle se déforme au fil des manches.
 */
export function OrbtcWallet({ me, holdings, inPlay, started, genesis }: OrbtcWalletProps) {
  const equalShare = holdings[0]?.genesis ?? 0;

  return (
    <LinearGradient
      colors={cardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: c.borderLift,
        padding: 16,
        gap: 12,
      }}
    >
      <View className="flex-row items-start justify-between">
        <View style={{ gap: 6 }}>
          <Micro tracking={1.8}>{me ? 'MON PORTEFEUILLE · ORBTC' : 'L’OFFRE ORBTC'}</Micro>
          <View className="flex-row items-baseline" style={{ gap: 6 }}>
            <Text
              style={{
                fontFamily: f.serif,
                fontSize: 30,
                color: c.ivory,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatInteger(me ? me.total : ORBTC_SUPPLY)}
            </Text>
            <Micro size={9} tracking={1.4} style={{ color: c.gold }}>
              ORBTC
            </Micro>
          </View>
        </View>
        {me ? (
          <View className="items-end" style={{ gap: 6 }}>
            <Micro tracking={1.4} size={8}>
              PART DE L’OFFRE
            </Micro>
            <Text style={{ fontFamily: f.serif, fontSize: 22, color: c.gold }}>
              {formatShare(me.share)}
            </Text>
          </View>
        ) : null}
      </View>

      {me && started ? (
        <View className="flex-row flex-wrap" style={{ columnGap: 16, rowGap: 4 }}>
          <Figure label="DISPONIBLE" value={formatInteger(me.available)} />
          <Figure label="EN JEU" value={formatInteger(me.inPlay)} />
          <Figure
            label="DEPUIS LA GENÈSE"
            value={formatPoints(me.delta)}
            color={me.delta > 0 ? c.sage : me.delta < 0 ? c.oxblood : c.sepiaDim}
          />
        </View>
      ) : null}

      <SupplyBar holdings={holdings} />

      <Text style={{ fontFamily: f.sans, fontSize: 10, lineHeight: 15, color: c.sepiaFaint }}>
        {started
          ? `Offre fixe de ${formatOrbtc(ORBTC_SUPPLY)}, partagée en ${holdings.length} parts égales à la genèse${equalShare ? ` (${formatOrbtc(equalShare)} chacun)` : ''}. ${formatOrbtc(inPlay)} sont en jeu dans les manches en cours.`
          : `Genèse le ${formatClubDate(genesis).toLowerCase()} : chacun recevra une part égale de l’offre${equalShare ? `, soit ${formatOrbtc(equalShare)}` : ''}.`}
      </Text>
    </LinearGradient>
  );
}

function Figure({
  label,
  value,
  color = c.bone,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View className="flex-row items-baseline" style={{ gap: 6 }}>
      <Micro size={7.5} tracking={1.3} style={{ color: c.sepiaMuted }}>
        {label}
      </Micro>
      <Text
        style={{ fontFamily: f.labelMed, fontSize: 11, color, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Les 21 millions, en une barre : un segment par membre, à sa couleur, de la
 * largeur de ce qu'il possède. Égale à la genèse ; elle raconte ensuite le jeu.
 */
export function SupplyBar({
  holdings,
  height = 6,
}: {
  holdings: MemberHolding[];
  height?: number;
}) {
  if (holdings.length === 0) return null;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Répartition de l’offre d’ORBTC entre les membres"
      className="flex-row"
      style={{ height, gap: 2, borderRadius: height / 2, overflow: 'hidden' }}
    >
      {holdings.map((row) => (
        <View
          key={row.userId}
          style={{
            flex: Math.max(row.total, 0),
            backgroundColor: row.member.color,
            opacity: 0.85,
          }}
        />
      ))}
    </View>
  );
}
