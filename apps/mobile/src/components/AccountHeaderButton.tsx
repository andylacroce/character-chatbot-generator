import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../ThemeContext";
import { useAuth } from "../AuthContext";
import { useUserName } from "../useUserName";
import AccountModal from "./AccountModal";

type Props = {
  /**
   * Narrowed to just what this button needs (navigate to History) — takes it as a prop
   * rather than reading `useNavigation()` so it can be rendered from a screenOptions
   * headerRight, and so unit tests can pass a plain mock navigation object without a real
   * NavigationContainer, matching every screen's own existing test pattern.
   */
  navigation: { navigate: (screen: "History") => void };
};

/**
 * Account/sign-in entry point, rendered as every screen's default headerRight (see App.tsx) —
 * closes the parity gap where only CreatorScreen had a way to sign in, change your name, or
 * reach Past Chats. Owns its own AccountModal instance rather than taking one as a prop, so
 * every screen gets it for free with no per-screen wiring.
 */
export default function AccountHeaderButton({ navigation }: Props) {
  const { colors } = useTheme();
  const auth = useAuth();
  const userNameCtx = useUserName();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        hitSlop={8}
        android_ripple={{ color: colors.secondaryContainer, borderless: true, radius: 18 }}
        style={styles.button}
        accessibilityLabel={auth.status === "signedIn" ? "Account" : "Sign in"}
      >
        <Ionicons
          name={auth.status === "signedIn" ? "person-circle" : "person-circle-outline"}
          size={22}
          color={colors.text}
        />
      </Pressable>
      <AccountModal
        visible={visible}
        onClose={() => setVisible(false)}
        userNameCtx={userNameCtx}
        onOpenHistory={() => {
          setVisible(false);
          navigation.navigate("History");
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: { padding: 6, marginRight: 4 },
});
