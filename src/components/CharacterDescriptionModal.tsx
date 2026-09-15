import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";

type Props = {
  visible: boolean;
  characterName: string;
  onSubmit: (description: string, appearance: string) => void;
  onCancel: () => void;
};

const MAX_LENGTH = 500;
const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * Mirrors CharacterDescriptionModal.tsx: shown when validate-character reports
 * `recognized: false` — collects a description instead of letting Claude improvise
 * a personality from just the name.
 */
export default function CharacterDescriptionModal({
  visible,
  characterName,
  onSubmit,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [description, setDescription] = useState("");
  const [appearance, setAppearance] = useState("");
  const trimmed = description.trim();

  const handleSubmit = () => {
    if (!trimmed) return;
    onSubmit(trimmed, appearance.trim());
    setDescription("");
    setAppearance("");
  };

  const handleCancel = () => {
    setDescription("");
    setAppearance("");
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdropPress} onPress={handleCancel}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.icon}>✎</Text>
              <Text style={styles.title}>Tell us about</Text>
              <Text style={styles.characterName}>"{characterName}"</Text>

              <Text style={styles.reason}>
                We don't recognize this as an existing character, so we can't build a personality
                from the name alone. Describe who they are — personality, background, how they talk
                — and we'll bring them to life from that instead.
              </Text>

              <Text style={styles.label}>Personality & background</Text>
              <TextInput
                style={styles.textarea}
                placeholder="e.g. A grumpy retired dragon-slayer who now runs a bakery and complains about everything, but secretly loves helping new adventurers."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={(t) => setDescription(t.slice(0, MAX_LENGTH))}
                maxLength={MAX_LENGTH}
                multiline
                numberOfLines={4}
                autoFocus
              />
              <Text style={styles.charCount}>
                {description.length}/{MAX_LENGTH}
              </Text>

              <Text style={styles.label}>Appearance (optional)</Text>
              <TextInput
                style={styles.textarea}
                placeholder="e.g. Stocky, silver-bearded, flour-dusted apron over old battle scars."
                placeholderTextColor={colors.textSecondary}
                value={appearance}
                onChangeText={(t) => setAppearance(t.slice(0, MAX_LENGTH))}
                maxLength={MAX_LENGTH}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.charCount}>
                {appearance.length}/{MAX_LENGTH}
              </Text>

              <View style={styles.buttonRow}>
                <Pressable style={styles.cancelButton} onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.continueButton, !trimmed && styles.continueButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={!trimmed}
                >
                  {/* Disabled uses textSecondary-on-surfaceVariant (same verified pairing as
                    ChatScreen's inactive send button), not onPrimary — onPrimary is only
                    contrast-correct against colors.primary, not colors.surfaceVariant. */}
                  <Text
                    style={[
                      styles.continueButtonText,
                      !trimmed && styles.continueButtonTextDisabled,
                    ]}
                  >
                    Create Character
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.disclaimer}>
                Your description shapes this character's personality
                {appearance.trim() ? " and portrait" : ""}. It must not contain illegal, sexual, or
                hateful content — anything that does will be disregarded when generating the
                character.
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
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
    backdropPress: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      maxHeight: "85%",
      width: "100%",
      maxWidth: 420,
    },
    icon: { fontSize: 28, textAlign: "center", marginBottom: 4, color: colors.secondary },
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
      marginTop: 2,
      marginBottom: 12,
    },
    reason: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: 16 },
    label: { color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6 },
    textarea: {
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 10,
      padding: 12,
      color: colors.text,
      fontSize: 14,
      textAlignVertical: "top",
      minHeight: 80,
      backgroundColor: colors.background,
    },
    charCount: {
      color: colors.textSecondary,
      fontSize: 11,
      textAlign: "right",
      marginTop: 4,
      marginBottom: 14,
    },
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
    continueButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    continueButtonDisabled: { backgroundColor: colors.surfaceVariant },
    continueButtonText: { color: colors.onPrimary, fontWeight: "600" },
    continueButtonTextDisabled: { color: colors.textSecondary },
    disclaimer: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 16 },
  });
}
