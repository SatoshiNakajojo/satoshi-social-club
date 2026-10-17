import { Text, View } from 'react-native';

import { MemberAvatar } from '@/components/MemberAvatar';
import { SupplyBar } from '@/components/OrbtcWallet';
import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { BASE_STAKE, ORBTC_SUPPLY, formatShare } from '@/features/oracle/orbtc';
import type { MemberHolding } from '@/features/oracle/useOrbtc';
import { formatInteger, formatPoints } from '@/lib/format';
import { a, c, f } from '@/theme/tokens';

/**
 * Qui possède quoi : les 21 millions d'ORBTC, membre par membre.
 *
 * La grammaire des classements — avatar, nom, chiffre à droite — mais sans
 * rang : ce n'est pas une compétition de plus, c'est le registre du club.
 */
export function OrbtcSupply({
  holdings,
  userId,
}: {
  holdings: MemberHolding[];
  userId: string | null;
}) {
  return (
    <View>
      <SectionTitle
        label="L’OFFRE ORBTC"
        hint={formatInteger(ORBTC_SUPPLY)}
        labelColor={c.goldMuted}
        gradientFrom={a.fameRule}
      />

      <View style={{ marginTop: 10, marginBottom: 4 }}>
        <SupplyBar holdings={holdings} height={8} />
      </View>

      {holdings.map((row) => (
        <View
          key={row.userId}
          className="flex-row items-center border-b border-hairline"
          style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 2 }}
        >
          <MemberAvatar member={row.member} size={26} />
          <View className="flex-1" style={{ gap: 3 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: f.sansSemi,
                fontSize: 12.5,
                color: row.userId === userId ? c.gold : c.bone,
              }}
            >
              {row.member.displayName}
            </Text>
            <Micro tracking={0.8} size={8} numberOfLines={1} style={{ color: c.sepiaMuted }}>
              {row.inPlay > 0
                ? `${formatInteger(row.inPlay)} EN JEU · ${formatShare(row.share)}`
                : formatShare(row.share)}
            </Micro>
          </View>
          <View className="items-end" style={{ gap: 3 }}>
            <Text
              style={{
                fontFamily: f.serif,
                fontSize: 17,
                color: c.ivory,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatInteger(row.total)}
            </Text>
            <Micro
              size={8}
              tracking={0.9}
              style={{
                color: row.delta > 0 ? c.sage : row.delta < 0 ? c.oxblood : c.sepiaFaint,
              }}
            >
              {row.delta === 0 ? 'ÉGAL' : formatPoints(row.delta)}
            </Micro>
          </View>
        </View>
      ))}

      <Text
        style={{
          fontFamily: f.sans,
          fontSize: 10,
          lineHeight: 16,
          color: c.sepiaFaint,
          marginTop: 10,
        }}
      >
        {`Chaque pari engage la mise de son horizon : ${formatInteger(BASE_STAKE)} ORBTC pour une semaine, jusqu’à ${formatInteger(BASE_STAKE * 4)} pour un an. Les paris d’un même horizon ouverts pendant la même période — semaine, mois, trimestre… — forment une manche : le tracé le plus juste emporte le pot, à égalité on partage, et seul on récupère sa mise. Les ORBTC n’ont aucune valeur monétaire : ils ne s’achètent ni ne se revendent.`}
      </Text>
    </View>
  );
}
