import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { resolveApiUrl } from "../api";
import { useTheme } from "../ThemeContext";
import { displayCharacterName } from "character-chatbot-shared";

type Props = {
  visible: boolean;
  name: string;
  avatarUrl: string | null | undefined;
  onClose: () => void;
  /** Optional CTA below the name, e.g. "Chat with X" from the Character Wall. */
  action?: { label: string; onPress: () => void };
};

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/** Full-screen portrait viewer — mirrors CharsGallery.tsx's <dialog> lightbox. */
export default function PortraitLightbox({ visible, name, avatarUrl, onClose, action }: Props) {
  const { colors } = useTheme();
  const usable = avatarUrl && !avatarUrl.endsWith(".svg");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          {usable ? (
            <Image
              source={{ uri: resolveApiUrl(avatarUrl) }}
              style={styles.image}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.image,
                styles.fallback,
                { backgroundColor: colors.secondaryContainer },
              ]}
            >
              <Text style={[styles.fallbackInitial, { color: colors.secondary }]}>
                {name.trim().charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          )}
          <Text style={[styles.name, { color: "#fff" }]}>{displayCharacterName(name)}</Text>
          {action ? (
            <Pressable onPress={action.onPress} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: colors.primary }]}>{action.label}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { alignItems: "center", padding: 24, width: "100%" },
  image: { width: 280, height: 280, borderRadius: 16 },
  fallback: { alignItems: "center", justifyContent: "center" },
  fallbackInitial: { fontSize: 96, fontWeight: "600" },
  name: { fontFamily: serif, fontSize: 22, marginTop: 16, textAlign: "center" },
  actionButton: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  actionText: { fontSize: 15, fontWeight: "700" },
  closeButton: { position: "absolute", top: -8, right: 8, padding: 8 },
});
