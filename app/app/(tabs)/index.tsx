import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AttendanceNotices } from '@/components/AttendanceNotices';
import { EventCard } from '@/components/EventCard';
import { Fab } from '@/components/Fab';
import { MonthCalendar } from '@/components/MonthCalendar';
import { NightSheet } from '@/components/NightSheet';
import { ScreenShell } from '@/components/ScreenShell';
import { splitNights } from '@/features/nights/nightTimeline';
import { useEvents } from '@/features/nights/useEvents';
import { useMembers } from '@/hooks/useMembers';
import { useSession } from '@/hooks/useSession';
import { clubDayKey, currentMonth, monthPrefix, shiftMonth } from '@/lib/monthGrid';
import { c, f } from '@/theme/tokens';

/** Onglet Nights — agenda du club et checklists potluck. */
export default function NightsScreen() {
  const { userId } = useSession();
  const { byId } = useMembers();
  const {
    events,
    loading,
    error,
    toggleRsvp,
    toggleDecline,
    create,
    creating,
    update,
    saving,
    remove,
    notices,
    dismissNotice,
  } = useEvents(userId);

  const [sheetOpen, setSheetOpen] = useState(false);
  /** La soirée qu'on modifie — la feuille se remonte à chaque soirée. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (events.find((event) => event.id === editingId) ?? null) : null;
  /** À venir, le mois en grille, ou l'historique des soirées passées. */
  const [view, setView] = useState<'upcoming' | 'month' | 'history'>('upcoming');
  const asMonth = view === 'month';
  const [month, setMonth] = useState(() => currentMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const me = userId ? (byId.get(userId) ?? null) : null;

  /**
   * En vue mois, la liste suit la grille : le mois affiché, ou le jour choisi.
   *
   * La grille et la liste doivent parler du même mois — feuilleter jusqu'en
   * décembre et lire en dessous une soirée de septembre ne veut rien dire. Un
   * mois sans rien affiche « Rien ce mois-ci », ce qui est une information et
   * non une perte.
   */
  const now = useNow();
  const { upcoming, past } = useMemo(() => splitNights(events, now), [events, now]);
  const shown = useMemo(() => {
    // Une soirée passe dans l'historique le lendemain (`nightTimeline.ts`).
    if (view === 'upcoming') return upcoming;
    if (view === 'history') return past;
    if (selectedDay)
      return events.filter((event) => clubDayKey(event.startsAt) === selectedDay);
    const prefix = monthPrefix(month.year, month.month);
    return events.filter((event) => clubDayKey(event.startsAt).startsWith(prefix));
  }, [view, upcoming, past, events, month, selectedDay]);

  /** Le titre d'une soirée pour l'annoncer — `null` si elle n'est pas encore là. */
  const titleFor = useCallback(
    (eventId: string) => events.find((event) => event.id === eventId)?.title ?? null,
    [events],
  );

  const handleCreate = async (draft: Parameters<typeof create>[0]) => {
    const created = await create(draft);
    // La feuille ne se referme que si la soirée est partie : sur échec, la
    // saisie reste à l'écran avec son message.
    if (created) setSheetOpen(false);
    return created;
  };

  const handleSave = async (edit: Parameters<typeof update>[1]) => {
    if (!editingId) return false;
    const saved = await update(editingId, edit);
    if (saved) setEditingId(null);
    return saved;
  };

  return (
    <>
      <ScreenShell
        overline={
          view === 'history' ? 'Les soirées passées du club' : 'Prochaines sessions du club'
        }
        title="Les Nights"
        me={me}
        /* Les réponses des autres membres, pendant qu'on est dans l'app.
           Posées par-dessus la liste plutôt qu'insérées dedans : une bannière
           qui pousse le contenu ferait rater le bouton qu'on visait. */
        overlay={
          <AttendanceNotices
            notices={notices}
            membersById={byId}
            titleFor={titleFor}
            onDismiss={dismissNotice}
          />
        }
      >
        <View className="flex-row border-b border-border" style={{ gap: 26, marginBottom: 20 }}>
          <ViewTab
            label="À venir"
            active={view === 'upcoming'}
            onPress={() => setView('upcoming')}
          />
          <ViewTab
            label="Le mois"
            active={asMonth}
            onPress={() => {
              setView('month');
              setMonth(currentMonth());
            }}
          />
          <ViewTab
            label="Historique"
            active={view === 'history'}
            onPress={() => setView('history')}
          />
        </View>

        {asMonth ? (
          <MonthCalendar
            year={month.year}
            month={month.month}
            events={events}
            selected={selectedDay}
            onSelect={setSelectedDay}
            onShiftMonth={(delta) => {
              setMonth((current) => shiftMonth(current.year, current.month, delta));
              setSelectedDay(null);
            }}
          />
        ) : null}

        <View style={{ gap: 20 }}>
          {loading ? <EventSkeleton /> : null}

          {!loading && error ? <Notice message={error} /> : null}

          {!loading && !error && shown.length === 0 ? (
            <Empty
              message={
                view === 'history'
                  ? 'Aucune soirée passée'
                  : selectedDay
                    ? 'Rien ce jour-là'
                    : asMonth
                      ? 'Rien ce mois-ci'
                      : 'Aucune session prévue'
              }
            />
          ) : (
            shown.map((event, index) => (
              <EventCard
                key={event.id}
                event={event}
                currentUserId={userId}
                membersById={byId}
                // La première carte est dépliée par défaut (README §7.1) ;
                // dans l'historique, aucune : on parcourt.
                defaultExpanded={index === 0 && view !== 'history'}
                // Une soirée passée ne se répond plus : on la relit.
                past={view === 'history' || past.includes(event)}
                onToggleRsvp={toggleRsvp}
                onToggleDecline={toggleDecline}
                onEdit={setEditingId}
              />
            ))
          )}

          {/* De quoi faire défiler la dernière carte au-dessus du bouton « + ». */}
          <View style={{ height: 44 }} />
        </View>
      </ScreenShell>

      {/* Le club n'a pas d'organisateur désigné : n'importe quel membre propose
        une soirée, et la RLS vérifie seulement qu'il en est un. */}
      <Fab label="Proposer une soirée" onPress={() => setSheetOpen(true)} />
      <NightSheet
        visible={sheetOpen}
        creating={creating}
        error={error}
        onClose={() => setSheetOpen(false)}
        onCreate={handleCreate}
      />
      {/* Seul celui qui l'a proposée modifie une soirée : la carte ne montre
          MODIFIER qu'à lui, et la RLS (`events_update_own`) le garantit. */}
      <NightSheet
        key={editingId ?? 'aucune'}
        visible={editing !== null}
        editing={editing}
        creating={saving}
        error={error}
        onClose={() => setEditingId(null)}
        onSave={handleSave}
        onDelete={async () => {
          if (!editingId) return false;
          const removed = await remove(editingId);
          if (removed) setEditingId(null);
          return removed;
        }}
      />
    </>
  );
}

/**
 * L'heure, relue toutes les dix minutes : passé minuit, la soirée de la veille
 * rejoint l'historique sans qu'on ait à rouvrir l'app.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10 * 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function ViewTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingBottom: 11,
        marginBottom: -1,
        borderBottomWidth: 1,
        borderBottomColor: active ? c.gold : 'transparent',
      }}
    >
      <Text
        style={{ fontFamily: f.serif, fontSize: 15, color: active ? c.ivory : c.sepiaMuted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EventSkeleton() {
  return (
    <View style={{ gap: 20 }}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          className="bg-surface border border-border"
          style={{ height: 148, borderRadius: 4 }}
        />
      ))}
    </View>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <Text style={{ fontFamily: f.sans, fontSize: 12, lineHeight: 18, color: c.oxbloodMuted }}>
      {message}
    </Text>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <Text
      style={{
        fontFamily: f.serifItalic,
        fontSize: 15,
        color: c.sepia,
        textAlign: 'center',
        paddingVertical: 40,
      }}
    >
      {message}
    </Text>
  );
}
