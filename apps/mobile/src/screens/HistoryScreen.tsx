import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import {
  CLEAR_HISTORY_CONFIRM,
  DELETE_CHAT_CONFIRM,
  displayCharacterName,
  formatRelativeTime,
  persistedBotToBot,
  type PersistedBot,
  type ThemeColors,
} from "character-chatbot-shared";
import { deleteSavedChats, getPersistedBots } from "../api";
import { clearLocalChats } from "../storage";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import { useAuth } from "../AuthContext";
import Avatar from "../components/Avatar";

type Props = NativeStackScreenProps<RootStackParamList, "History">;

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * A signed-in user's saved characters (GET /api/bots), each resumable into its chat.
 * Mirrors the web app's /history page (HistoryPage.tsx); broken out of CreatorScreen so
 * a long list doesn't push the creation form below the fold. Each chat can be deleted, or
 * all of them cleared, behind a confirmation; the matching local chat data goes with it.
 */
export default function HistoryScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const auth = useAuth();
  const [bots, setBots] = useState<PersistedBot[] | null>(null);

  useEffect(() => {
    if (auth.status !== "signedIn") return;
    getPersistedBots()
      .then(setBots)
      .catch(() => setBots([]));
  }, [auth.status]);

  /** Confirms, then deletes one chat (`bot`) or all of them, server first, then locally. */
  const confirmDelete = (bot?: PersistedBot) => {
    const copy = bot
      ? {
          ...DELETE_CHAT_CONFIRM,
          title: DELETE_CHAT_CONFIRM.title.replace("{name}", displayCharacterName(bot.name)),
        }
      : CLEAR_HISTORY_CONFIRM;
    Alert.alert(copy.title, copy.body, [
      { text: copy.cancelLabel, style: "cancel" },
      {
        text: copy.confirmLabel,
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSavedChats(bot?.id);
            await clearLocalChats(bot?.name);
            setBots((prev) => (bot ? (prev ?? []).filter((b) => b.id !== bot.id) : []));
          } catch {
            Alert.alert(copy.errorMessage);
          }
        },
      },
    ]);
  };

  let body: React.ReactNode;
  if (auth.status === "loading" || (auth.status === "signedIn" && !bots)) {
    body = <ActivityIndicator color={colors.secondary} style={styles.spinner} />;
  } else if (auth.status !== "signedIn") {
    body = <Text style={styles.message}>Sign in to see characters you&apos;ve chatted with.</Text>;
  } else if (!bots || bots.length === 0) {
    body = <Text style={styles.message}>No saved chats yet.</Text>;
  } else {
    body = bots.map((b) => (
      <Pressable
        key={b.id}
        style={styles.row}
        onPress={() => navigation.navigate("Chat", { bot: persistedBotToBot(b) })}
        android_ripple={{ color: colors.secondaryContainer }}
      >
        <Avatar name={b.name} avatarUrl={b.avatarUrl} size={36} />
        <View style={styles.nameWrap}>
          <Text style={styles.name}>{displayCharacterName(b.name)}</Text>
          <Text style={styles.time}>{formatRelativeTime(b.updatedAt)}</Text>
        </View>
        <Pressable
          onPress={() => confirmDelete(b)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Delete chat with ${displayCharacterName(b.name)}`}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
        </Pressable>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>
    ));
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {body}
      {bots && bots.length > 0 ? (
        <Pressable style={styles.clearButton} onPress={() => confirmDelete()}>
          <Text style={styles.clearButtonText}>Clear all chats</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { flexGrow: 1, padding: 24, backgroundColor: colors.background },
    spinner: { marginTop: 32 },
    message: { color: colors.textSecondary, fontSize: 15, textAlign: "center", marginTop: 32 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 14,
      padding: 10,
      marginBottom: 10,
      backgroundColor: colors.surface,
    },
    nameWrap: { flex: 1 },
    name: { color: colors.text, fontSize: 16, fontWeight: "600", fontFamily: serif },
    time: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    clearButton: {
      alignSelf: "center",
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.outline,
    },
    clearButtonText: { color: colors.error, fontSize: 14, fontWeight: "600" },
  });
}
