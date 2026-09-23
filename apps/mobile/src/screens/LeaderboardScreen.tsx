import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LEADERBOARD_COPY, useLeaderboard, type ThemeColors } from "character-chatbot-shared";
import { getLeaderboard } from "../api";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import LeaderboardClaim from "../components/LeaderboardClaim";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "Leaderboard">;

const fetchEntries = async () => (await getLeaderboard()).entries ?? [];

/** Public top-ten streaks plus the claim form — mirrors the web app's /leaderboard page. */
export default function LeaderboardScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { entries, loading, error, reload } = useLeaderboard(fetchEntries);

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
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {body}
      <LeaderboardClaim onChange={reload} />
      <View style={styles.play}>
        <Button label={LEADERBOARD_COPY.playLabel} onPress={() => navigation.navigate("Game")} />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { flexGrow: 1, padding: 24, backgroundColor: colors.background },
    spinner: { marginTop: 32 },
    message: { color: colors.textSecondary, fontSize: 15, textAlign: "center", marginTop: 24 },
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
