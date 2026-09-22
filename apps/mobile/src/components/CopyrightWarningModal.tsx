import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CharacterValidationResult, ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";

type Props = {
  visible: boolean;
  validation: CharacterValidationResult;
  onContinue: () => void;
  onCancel: () => void;
  onSelectSuggestion: (suggestion: string) => void;
};

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/** Mirrors CopyrightWarningModal.tsx: shown when validate-character flags a name as caution/warning. */
export default function CopyrightWarningModal({
  visible,
  validation,
  onContinue,
  onCancel,
  onSelectSuggestion,
}: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const isWarning = validation.warningLevel === "warning";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <ScrollView>
            <Text style={styles.icon}>{isWarning ? "⚠️" : "⚡"}</Text>
            <Text style={styles.title}>
              {isWarning ? "Copyright/Trademark Warning" : "Character Notice"}
            </Text>
            <Text style={styles.characterName}>"{validation.characterName}"</Text>

            {validation.reason ? <Text style={styles.reason}>{validation.reason}</Text> : null}

            {validation.suggestions && validation.suggestions.length > 0 ? (
              <View style={styles.suggestions}>
                <Text style={styles.suggestionsTitle}>Suggested alternatives (tap to use):</Text>
                {validation.suggestions.map((s, i) => (
                  <Pressable
                    key={i}
                    onPress={() => onSelectSuggestion(s)}
                    style={styles.suggestionItem}
                    android_ripple={{ color: colors.secondaryContainer }}
                  >
                    <Text style={styles.suggestionText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.buttonRow}>
              <Pressable style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.continueButton} onPress={onContinue}>
                <Text style={styles.continueButtonText}>Continue Anyway</Text>
              </Pressable>
            </View>

            <Text style={styles.disclaimer}>
              By continuing, you acknowledge potential copyright or trademark concerns. Use of
              protected characters may have legal implications. This character and its portrait
              won't be saved or shared with other users — it exists only for this session.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      maxHeight: "85%",
      width: "100%",
      maxWidth: 420,
    },
    icon: { fontSize: 32, textAlign: "center", marginBottom: 8 },
    title: {
      fontFamily: serif,
      fontSize: 20,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
    },
    characterName: {
      fontFamily: serif,
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 12,
    },
    reason: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: 16 },
    suggestions: { marginBottom: 16 },
    suggestionsTitle: { color: colors.textSecondary, fontSize: 12, marginBottom: 8 },
    suggestionItem: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.secondaryContainer,
      marginBottom: 6,
    },
    suggestionText: { color: colors.secondary, fontWeight: "600" },
    buttonRow: { flexDirection: "row", gap: 10, marginTop: 4 },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.outline,
      alignItems: "center",
    },
    cancelButtonText: { color: colors.text, fontWeight: "600" },
    // colors.error paired with white text was checked and fails contrast in dark
    // mode (~3.2:1, borderline/fails WCAG for text) since the dark palette's error
    // tone is deliberately lightened. colors.primary + colors.onPrimary is already
    // verified (4.8:1 / 6.6:1, see ChatScreen's send button) — reused here instead
    // of introducing a second, unverified color pairing.
    continueButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    continueButtonText: { color: colors.onPrimary, fontWeight: "600" },
    disclaimer: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 16 },
  });
}
