import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import type { ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";

type Props = {
  visible: boolean;
  mode: "gate" | "edit";
  currentName: string;
  onSave: (name: string) => void;
  onSkip?: () => void;
  onClose: () => void;
};

const MAX_LENGTH = 50;
const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * Captures or changes the visitor's own preferred name — what a character should call
 * them. Used two ways: as a one-time gate right before character creation when no name
 * is known yet (`mode="gate"`), and as an anytime "change your name" action from
 * AccountModal (`mode="edit"`) — mirrors the web app's NameCaptureModal.tsx.
 */
export default function NameCaptureModal({
  visible,
  mode,
  currentName,
  onSave,
  onSkip,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [value, setValue] = useState(currentName);

  // Resets local state exactly when the modal transitions to open, so a stale value from
  // a previous open never lingers — mirrors NameCaptureModal.tsx's own render-time reset.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setValue(currentName);
  }

  const handleSave = () => {
    onSave(value.trim());
  };

  const handleSkip = () => {
    if (onSkip) onSkip();
    else onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdropPress} onPress={onClose}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>
              {mode === "gate" ? "Before we begin" : "Change your name"}
            </Text>
            <Text style={styles.reason}>
              {mode === "gate"
                ? "So the character knows how to greet you. Totally optional."
                : "Update the name characters greet you by."}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Andy"
              placeholderTextColor={colors.textSecondary}
              value={value}
              onChangeText={(t) => setValue(t.slice(0, MAX_LENGTH))}
              maxLength={MAX_LENGTH}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>{mode === "gate" ? "Continue" : "Save"}</Text>
            </Pressable>
            {mode === "gate" ? (
              <Pressable style={styles.skipButton} onPress={handleSkip}>
                <Text style={styles.skipButtonText}>Skip for now</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.skipButton} onPress={onClose}>
                <Text style={styles.skipButtonText}>Cancel</Text>
              </Pressable>
            )}
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
      width: "100%",
      maxWidth: 380,
    },
    title: {
      fontFamily: serif,
      fontSize: 20,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
    },
    reason: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 18,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
      backgroundColor: colors.background,
      marginBottom: 16,
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 24,
      paddingVertical: 13,
      alignItems: "center",
    },
    saveButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: "600" },
    skipButton: { marginTop: 12, alignItems: "center", padding: 8 },
    skipButtonText: { color: colors.textSecondary, fontSize: 14 },
  });
}
