import { useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";
import { useAuth } from "../AuthContext";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const SIGN_IN_ERROR_MESSAGES: Record<string, string> = {
  cancelled: "",
  failed: "Sign-in didn't go through. Please try again.",
  missing_token: "Sign-in didn't go through. Please try again.",
  server_misconfigured: "Sign-in isn't available right now. Please try again later.",
};

/**
 * Sign in / sign out — mirrors the visual family of CopyrightWarningModal/
 * CharacterDescriptionModal. Reachable from CreatorScreen's header only for this
 * pass (mobile has no shared header/menu component the way the web app does).
 */
export default function AccountModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, email, name, signIn, signOut } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    setSigningIn(true);
    setError("");
    const result = await signIn();
    setSigningIn(false);
    if (!result.ok) {
      setError(
        SIGN_IN_ERROR_MESSAGES[result.error] ?? "Sign-in didn't go through. Please try again.",
      );
    }
  };

  const handleSignOut = async () => {
    setError("");
    await signOut();
  };

  const handleClose = () => {
    setError("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Ionicons
            name="person-circle-outline"
            size={32}
            color={colors.secondary}
            style={styles.icon}
          />

          {status === "signedIn" ? (
            <>
              <Text style={styles.title}>Signed in</Text>
              <Text style={styles.identity}>{name || email}</Text>
              <Pressable style={styles.primaryButton} onPress={handleSignOut}>
                <Text style={styles.primaryButtonText}>Sign out</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.reason}>
                Sign in with Google to save your characters and chat history to your account.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.primaryButton, signingIn && styles.primaryButtonBusy]}
                onPress={handleSignIn}
                disabled={signingIn || status === "loading"}
              >
                {signingIn ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.primaryButtonText}>Sign in with Google</Text>
                )}
              </Pressable>
            </>
          )}

          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
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
      width: "100%",
      maxWidth: 380,
      alignItems: "center",
    },
    icon: { marginBottom: 8 },
    title: { fontFamily: serif, fontSize: 20, fontWeight: "600", color: colors.text },
    identity: { color: colors.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 20 },
    reason: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 20,
    },
    error: { color: colors.error, fontSize: 13, textAlign: "center", marginBottom: 12 },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 24,
      paddingVertical: 13,
      paddingHorizontal: 24,
      alignItems: "center",
      alignSelf: "stretch",
    },
    primaryButtonBusy: { opacity: 0.9 },
    primaryButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: "600" },
    closeButton: { marginTop: 16, padding: 8 },
    closeButtonText: { color: colors.textSecondary, fontSize: 14 },
  });
}
