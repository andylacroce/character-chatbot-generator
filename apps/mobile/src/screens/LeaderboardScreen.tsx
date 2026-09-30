import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  GAME_LIST,
  GAMES,
  LEADERBOARD_COPY,
  useLeaderboard,
  type GameDefinition,
  type GameId,
  type ThemeColors,
} from "character-chatbot-shared";
import { getLeaderboard } from "../api";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import LeaderboardClaim from "../components/LeaderboardClaim";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "Leaderboard">;

/**
 * One tab's table + claim form. A separate component (rather than inline in
 * LeaderboardScreen) so switching tabs remounts it and its `useLeaderboard`/claim state
 * genuinely re-fetches for the new game — `useLeaderboard`'s own `reload` is memoized
 * once per mount, so swapping just the `fetchEntries` function passed to a single,
 * already-mounted instance would silently keep showing the previous tab's stale data.
 */
function LeaderboardBody({
  game,
  colors,
  styles,
}: {
  game: GameDefinition;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { entries, loading, error, reload } = useLeaderboard(
    async () => (await getLeaderboard(game)).entries ?? [],
  );

  let body: React.ReactNode;
  if (loading) body = <ActivityIndicator color={colors.secondary} style={styles.spinner} />;
  else if (error) body = <Text style={styles.message}>{error}</Text>;
  else if (entries.length === 0)
    body = <Text style={styles.message}>{LEADERBOARD_COPY.empty}</Text>;
  else
    body = (
      <View style={styles.table} accessibilityLabel={LEADERBOARD_COPY.tableCaption}>
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.rank, styles.headerText]}>{LEADERBOARD_COPY.rankLabel}</Text>
          <Text style={[styles.player, styles.headerText]}>{LEADERBOARD_COPY.playerLabel}</Text>
          <Text style={[styles.streak, styles.headerText]}>{LEADERBOARD_COPY.streakLabel}</Text>
        </View>
        {entries.map((entry) => (
          <View key={entry.rank} style={styles.row}>
            <Text style={styles.rank}>{entry.rank}</Text>
            <Text style={styles.player}>{entry.name}</Text>
            <Text style={styles.streak}>{entry.streak}</Text>
          </View>
        ))}
      </View>
    );

  return (
    <>
      {body}
      <LeaderboardClaim onChange={reload} game={game} />
    </>
  );
}

/**
 * Public top-ten streaks plus the claim form for both games, as tabs — mirrors the web
 * app's /leaderboard page. "Guess Who" is the first/default-active tab, per the standing
 * "featured first everywhere both games are listed" rule.
 */
export default function LeaderboardScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [activeId, setActiveId] = useState<GameId>(GAME_LIST[0].id);
  const active = GAMES[activeId];

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.tabs}>
        {GAME_LIST.map((game) => (
          <Pressable
            key={game.id}
            onPress={() => setActiveId(game.id)}
            style={[styles.tab, activeId === game.id && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeId === game.id && styles.tabTextActive]}>
              {game.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <LeaderboardBody key={active.id} game={active} colors={colors} styles={styles} />
      <View style={styles.play}>
        <Button
          label={active.copy.ctaLabel}
          onPress={() =>
            navigation.navigate(active.id === "guessWho" ? "GuessWho" : "GuessWhoNext")
          }
        />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { flexGrow: 1, padding: 24, backgroundColor: colors.background },
    spinner: { marginTop: 32 },
    message: { color: colors.textSecondary, fontSize: 15, textAlign: "center", marginTop: 24 },
    tabs: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.outline,
      marginBottom: 16,
    },
    tab: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderBottomWidth: 3,
      borderBottomColor: "transparent",
    },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { color: colors.textSecondary, fontWeight: "600", fontSize: 14 },
    tabTextActive: { color: colors.primary },
    table: {
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 14,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.outline,
    },
    headerRow: { backgroundColor: colors.background },
    headerText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
    rank: { width: 48, color: colors.text, fontSize: 15 },
    player: { flex: 1, color: colors.text, fontSize: 15 },
    streak: { width: 64, textAlign: "right", color: colors.text, fontSize: 15 },
    play: { marginTop: 24 },
  });
}
