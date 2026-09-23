import { useMemo, type ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";

type Props = {
  visible: boolean;
  /** Backdrop tap and the Android back button. */
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/** The app's dimmed-backdrop dialog card, shared by every modal. */
export default function ModalCard({ visible, onClose, title, children }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <ScrollView>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {children}
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
    title: {
      fontFamily: serif,
      fontSize: 20,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      marginBottom: 12,
    },
  });
}
