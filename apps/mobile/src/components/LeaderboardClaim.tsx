import { useMemo } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import {
  LEADERBOARD_COPY,
  useLeaderboardClaim,
  type LeaderboardClaimTransport,
  type ThemeColors,
} from "character-chatbot-shared";
import { apiErrorMessage, getLeaderboardSettings, saveLeaderboardSettings } from "../api";
import { useTheme } from "../ThemeContext";
import Button from "./Button";

const transport: LeaderboardClaimTransport = {
  load: getLeaderboardSettings,
  save: async (request) => {
    try {
      return await saveLeaderboardSettings(request);
    } catch (err) {
      throw new Error(apiErrorMessage(err, ""));
    }
  },
};

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * Lets a top-ten player choose or remove their public leaderboard name. Same shared claim
 * flow and copy as the web app's LeaderboardClaim.tsx; renders nothing otherwise.
 */
export default function LeaderboardClaim({ onChange }: { onChange?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const claim = useLeaderboardClaim(transport, onChange);

  if (!claim.settings) return claim.error ? <Text style={styles.error}>{claim.error}</Text> : null;
  if (!claim.visible) return null;

  return (
    <View style={styles.card} accessibilityLabel="Your leaderboard entry">
      <Text style={styles.title}>{LEADERBOARD_COPY.claimTitle}</Text>
      <Text style={styles.body}>{LEADERBOARD_COPY.claimBody}</Text>
      <TextInput
        style={styles.input}
        value={claim.name}
        onChangeText={claim.setName}
        placeholder={LEADERBOARD_COPY.claimNameLabel}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={LEADERBOARD_COPY.claimNameLabel}
        maxLength={30}
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => void claim.save()}
      />
      <Button
        label={
          claim.settings.showOnLeaderboard
            ? LEADERBOARD_COPY.updateLabel
            : LEADERBOARD_COPY.joinLabel
        }
        onPress={() => void claim.save()}
        disabled={claim.name.trim().length < 2}
        busy={claim.saving}
      />
      {claim.settings.showOnLeaderboard ? (
        <View style={styles.spaced}>
          <Button
            label={LEADERBOARD_COPY.removeLabel}
            variant="secondary"
            onPress={() => void claim.leave()}
            disabled={claim.saving}
          />
        </View>
      ) : null}
      {claim.error ? <Text style={styles.error}>{claim.error}</Text> : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      alignSelf: "stretch",
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 14,
      padding: 16,
      marginTop: 20,
      backgroundColor: colors.surface,
    },
    title: { fontFamily: serif, fontSize: 18, fontWeight: "600", color: colors.text },
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginVertical: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.background,
      marginBottom: 12,
    },
    spaced: { marginTop: 10 },
    error: { color: colors.error, fontSize: 13, textAlign: "center", marginTop: 10 },
  });
}
