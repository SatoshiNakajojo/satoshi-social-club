import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Micro } from '@/components/ui/Micro';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { formatOrbtc, type Movement } from '@/features/oracle/orbtc';
import { formatClubDate, formatInteger, formatPoints } from '@/lib/format';
import { horizonOf } from '@/lib/horizons';
import { c, f } from '@/theme/tokens';

/** Mouvements affichés avant « voir tout ». */
const PREVIEW = 6;

/**
 * Mes ORBTC, manche par manche : ce qui est en jeu, puis ce qui a été gagné,
 * perdu ou rendu. Le portefeuille en tête de l'onglet en est la somme.
 */
export function OrbtcMovements({ movements }: { movements: Movement[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? movements : movements.slice(0, PREVIEW);

  return (
    <View>
      <SectionTitle
        label="MES ORBTC"
        hint={`${movements.length} MANCHE${movements.length > 1 ? 'S' : ''}`}
      />
      {movements.length === 0 ? (
        <Text
          style={{
            fontFamily: f.serifItalic,
            fontSize: 14,
            color: c.sepia,
            paddingVertical: 14,
            paddingHorizontal: 2,
          }}
        >
          Aucune manche jouée pour l’instant.
        </Text>
      ) : (
        shown.map((move) => <MovementLine key={move.manche.key} move={move} />)
      )}
      {movements.length > PREVIEW ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setAll((on) => !on)}
          style={{ paddingVertical: 12 }}
        >
          <Text
            style={{ fontFamily: f.labelMed, fontSize: 9, letterSpacing: 1.62, color: c.gold }}
          >
            {all ? 'RÉDUIRE' : `VOIR LES ${movements.length - PREVIEW} AUTRES`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MovementLine({ move }: { move: Movement }) {
  const { manche, kind, amount, accuracy, at } = move;
  const justesse = accuracy === null ? '' : ` · ${accuracy.toFixed(0)} % JUSTE`;
  const detail =
    kind === 'won'
      ? `GAGNÉE${justesse} · POT ${formatInteger(manche.pot)}`
      : kind === 'lost'
        ? `PERDUE${justesse} · ${manche.entries.length} JOUEURS`
        : kind === 'refunded'
          ? 'SEUL DANS LA MANCHE · MISE RENDUE'
          : `EN JEU · POT ${formatInteger(manche.pot)} · DEPUIS LE ${formatClubDate(at)}`;
  const tone =
    kind === 'won'
      ? c.sage
      : kind === 'lost'
        ? c.oxblood
        : kind === 'engaged'
          ? c.gold
          : c.sepiaFaint;

  return (
    <View
      className="flex-row items-center border-b border-hairline"
      style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 2 }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
      <View className="flex-1" style={{ gap: 3 }}>
        <Text numberOfLines={1} style={{ fontFamily: f.sansSemi, fontSize: 12, color: c.bone }}>
          {`${horizonOf(manche.horizon).label} · ${manche.label}`}
        </Text>
        <Micro tracking={0.8} size={8} numberOfLines={1} style={{ color: c.sepiaMuted }}>
          {detail}
        </Micro>
      </View>
      <Text
        style={{
          fontFamily: f.labelMed,
          fontSize: 12,
          color: kind === 'engaged' ? c.sepiaDim : tone,
          fontVariant: ['tabular-nums'],
        }}
      >
        {kind === 'engaged'
          ? formatOrbtc(amount)
          : kind === 'refunded'
            ? '±0'
            : formatPoints(amount)}
      </Text>
    </View>
  );
}
