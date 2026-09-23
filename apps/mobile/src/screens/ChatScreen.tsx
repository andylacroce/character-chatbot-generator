import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { ChatMessage, ThemeColors } from "character-chatbot-shared";
import {
  ApiError,
  type ChatRequestBody,
  getPersistedMessages,
  resolveApiUrl,
  sendChatMessage,
} from "../api";
import { appendChatMessage, loadAudioEnabled, loadChatHistory, saveAudioEnabled } from "../storage";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import { useAuth } from "../AuthContext";
import { useUserName } from "../useUserName";
import Avatar from "../components/Avatar";
import PortraitLightbox from "../components/PortraitLightbox";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

/** Formats stored ChatMessage turns into the "User: "/"Bot: " strings chat.ts expects. */
function formatHistory(messages: ChatMessage[], botName: string): string[] {
  return messages
    .slice(-20)
    .map((m) => (m.sender === botName ? `Bot: ${m.text}` : `User: ${m.text}`));
}

function logChatError(label: string, err: unknown) {
  if (err instanceof ApiError) {
    console.error(`[Chat] ${label}: HTTP ${err.status} — ${err.message}`);
  } else {
    console.error(`[Chat] ${label}:`, err);
  }
}

export default function ChatScreen({ route, navigation }: Props) {
  const { bot } = route.params;
  const { colors } = useTheme();
  const auth = useAuth();
  const userNameCtx = useUserName();
  const userName = userNameCtx.name || "Me";
  // Memoized: this screen re-renders on every keystroke (input state), and recreating
  // a fresh StyleSheet each time was the actual cause of the send button intermittently
  // failing to paint its background on real Android devices while typing — not
  // reproducible in the web preview, which doesn't hit Android's native view diffing.
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // `inverted` FlatList was tried to get robust bottom-anchoring, but RN's per-item
  // scaleY(-1) counter-transform (the standard fix for its upside-down rendering)
  // didn't take effect as expected on this RN 0.86/Hermes/Android combo — reverted
  // rather than spend more time on it. Bottom-anchoring instead comes from an explicit
  // scrollToEnd, re-fired on every signal that can change how much content fits
  // (new message, keyboard show/hide, list container resize) — see listRef below.
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const insets = useSafeAreaInsets();
  const introSentRef = useRef(false);
  const headerHeight = useHeaderHeight();
  // Whether the Android keyboard is open — used to drop insets.bottom from the
  // input row's own padding while it's up. That padding is for the gesture-nav bar
  // when the keyboard's closed; KeyboardAvoidingView's own lift already clears the
  // keyboard on its own, so leaving insets.bottom active on top of it left a real,
  // measured gap on a Samsung (diagnosed via a temporary debug overlay: the gap's
  // size matched insets.bottom almost exactly — see CLAUDE.md for the full story).
  const [androidKeyboardOpen, setAndroidKeyboardOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", () => setAndroidKeyboardOpen(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setAndroidKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Bigger, tappable header avatar (opens the portrait lightbox below) — set here
  // rather than statically in App.tsx's Stack.Screen options so it can share this
  // screen's own lightbox state.
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          onPress={() => setLightboxOpen(true)}
          style={styles.headerTitle}
          android_ripple={{ color: colors.secondaryContainer, borderless: true }}
        >
          <Avatar name={bot.name} avatarUrl={bot.avatarUrl} size={48} />
          <Text style={styles.headerTitleText}>{bot.name}</Text>
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, bot.name, bot.avatarUrl, colors]);

  useEffect(() => {
    // Mirrors the web app's useChatScrollAndFocus.ts: scroll immediately, then again
    // after a short delay, since the keyboard's viewport resize can settle
    // asynchronously after the show/hide event fires.
    const rescroll = () => {
      listRef.current?.scrollToEnd({ animated: false });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120);
    };
    const showSub = Keyboard.addListener("keyboardDidShow", rescroll);
    const hideSub = Keyboard.addListener("keyboardDidHide", rescroll);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const playReply = (audioFileUrl: string | undefined) => {
    if (!audioFileUrl || !audioEnabled) return;
    try {
      // Playback failing (bad URL, decode error) must never surface as a
      // failed message send — the reply already arrived and is on screen;
      // TTS is a bonus on top of it, not a precondition for it.
      player.replace(resolveApiUrl(audioFileUrl));
      player.play();
    } catch {
      // Silently skip audio — the text reply is what matters.
    }
  };

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    loadAudioEnabled().then(setAudioEnabled);

    loadChatHistory(bot.name).then(async (localHistory) => {
      setMessages(localHistory);
      let history = localHistory;

      // Signed-in users: reconcile with the server's copy before deciding whether this
      // is a "fresh chat" — a new device with no local history but real server history
      // must not fire the intro turn. Mirrors useChatController.ts's exact rule: adopt
      // the server list only if it's longer than what's already loaded.
      if (auth.status === "signedIn") {
        try {
          const serverMessages = await getPersistedMessages(bot.name);
          if (serverMessages.length > history.length) {
            history = serverMessages.map((m) => ({ sender: m.sender, text: m.text }));
            setMessages(history);
          }
        } catch {
          // Best effort — local history already rendered above.
        }
      }

      // Fresh chat, no saved turns yet — get the character to open with a line of its
      // own instead of dropping the user into a blank screen (mirrors the web app's
      // hidden "introduce yourself" turn in useChatController.ts).
      if (history.length === 0 && !introSentRef.current) {
        introSentRef.current = true;
        setSending(true);
        try {
          const introBody: ChatRequestBody = {
            message: "Introduce yourself in 2 sentences or less.",
            personality: bot.personality,
            botName: bot.name,
            gender: bot.gender ?? undefined,
            conversationHistory: [],
            voiceConfig: bot.voiceConfig!,
            isIntro: true,
          };
          const response = await sendChatMessage(introBody);

          const introMessage: ChatMessage = { sender: bot.name, text: response.reply };
          setMessages([introMessage]);
          await appendChatMessage(bot.name, introMessage);
          playReply(response.audioFileUrl);
        } catch (err) {
          logChatError("intro fetch failed", err);
          setError(err instanceof Error ? err.message : "Failed to reach the character.");
        } finally {
          setSending(false);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.name]);

  const toggleAudio = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    saveAudioEnabled(next);
    if (!next && playerStatus.playing) player.pause();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = { sender: "User", text };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setError("");
    setSending(true);
    await appendChatMessage(bot.name, userMessage);

    try {
      const body: ChatRequestBody = {
        message: text,
        personality: bot.personality,
        botName: bot.name,
        gender: bot.gender ?? undefined,
        conversationHistory: formatHistory(messages, bot.name),
        voiceConfig: bot.voiceConfig!,
        userName: userName !== "Me" ? userName : undefined,
      };
      const response = await sendChatMessage(body);

      const botMessage: ChatMessage = { sender: bot.name, text: response.reply };
      setMessages((prev) => [...prev, botMessage]);
      await appendChatMessage(bot.name, botMessage);
      playReply(response.audioFileUrl);
    } catch (err) {
      logChatError("send failed", err);
      setError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      // Expo SDK 57 forces edge-to-edge on Android, which stops the native window
      // resize (adjustResize) this used to lean on — confirmed empirically
      // (useWindowDimensions stayed constant across keyboardDidShow). "padding"
      // (not "height") is the behavior that held up under edge-to-edge on Android
      // here; keyboardVerticalOffset uses useHeaderHeight() (the header's actual
      // rendered height on whichever device is running) instead of a guessed
      // constant, since a hardcoded value was wrong by a device-specific amount.
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <PortraitLightbox
        visible={lightboxOpen}
        name={bot.name}
        avatarUrl={bot.avatarUrl}
        onClose={() => setLightboxOpen(false)}
      />
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(_, index) => String(index)}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item, index }) => {
          const isUser = item.sender === "User";
          const rowStyle = [
            styles.messageRow,
            index === messages.length - 1 && styles.messageRowLast,
          ];
          if (isUser) {
            return (
              <View style={[rowStyle, styles.userBlock]}>
                <Text style={[styles.senderLabel, styles.userSenderLabel]}>{userName}</Text>
                <Text style={styles.userText}>{item.text}</Text>
              </View>
            );
          }
          return (
            <View style={[rowStyle, styles.botBlock]}>
              <View style={styles.botByline}>
                <Avatar name={bot.name} avatarUrl={bot.avatarUrl} size={26} />
                <Text style={[styles.senderLabel, styles.botSenderLabel]}>{bot.name}</Text>
              </View>
              <View style={styles.quote}>
                <Text style={styles.botText}>{item.text}</Text>
              </View>
            </View>
          );
        }}
      />
      {sending ? (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View
        style={[
          styles.inputRow,
          {
            paddingBottom:
              10 + (Platform.OS === "android" && androidKeyboardOpen ? 0 : insets.bottom),
          },
        ]}
      >
        <Pressable
          style={styles.iconButton}
          onPress={toggleAudio}
          accessibilityLabel={audioEnabled ? "Mute audio" : "Unmute audio"}
          android_ripple={{ color: colors.secondaryContainer, borderless: true, radius: 20 }}
          hitSlop={4}
        >
          <Ionicons
            name={audioEnabled ? "volume-high-outline" : "volume-mute-outline"}
            size={18}
            color={colors.accent}
          />
        </Pressable>
        {playerStatus.playing ? (
          <Pressable
            style={[styles.iconButton, styles.stopButton]}
            onPress={() => player.pause()}
            accessibilityLabel="Stop audio"
            android_ripple={{ color: colors.errorContainer, borderless: true, radius: 20 }}
            hitSlop={4}
          >
            <Ionicons name="stop-outline" size={18} color={colors.error} />
          </Pressable>
        ) : null}
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={`Message ${bot.name}`}
          placeholderTextColor={colors.textSecondary}
          editable={!sending}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          onFocus={() => {
            listRef.current?.scrollToEnd({ animated: false });
            setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120);
          }}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (sending || !input.trim()) && styles.sendButtonInactive]}
          onPress={handleSend}
          accessibilityLabel="Send"
          disabled={sending || !input.trim()}
          android_ripple={{ color: "rgba(255,255,255,0.3)", borderless: true, radius: 21 }}
        >
          <Ionicons
            name="arrow-up"
            size={22}
            // Inactive (empty box): muted icon on a plain, unfilled circle — reads as
            // "not clickable yet". Active (text entered): filled with colors.primary
            // + colors.onPrimary, the theme's own contrast-correct pairing (white in
            // light mode, near-black in dark — verified 4.8:1 / 6.6:1, both pass
            // WCAG). A constant color here was tried and was wrong: forcing white
            // for "active" broke dark mode's contrast (2.7:1, fails) because dark
            // mode's primary is a light salmon that white doesn't sit on well.
            color={sending || !input.trim() ? colors.textSecondary : colors.onPrimary}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
    headerTitleText: { fontSize: 17, fontWeight: "600", color: colors.text },
    list: { flex: 1 },
    listContent: { padding: 16, flexGrow: 1, justifyContent: "flex-end" },
    messageRow: {
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.outline,
    },
    messageRowLast: { borderBottomWidth: 0 },
    userBlock: { alignItems: "flex-end" },
    senderLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    userSenderLabel: { color: colors.textSecondary, marginBottom: 4 },
    botSenderLabel: { color: colors.accent },
    userText: { color: colors.textSecondary, fontSize: 15, textAlign: "right", maxWidth: "85%" },
    botBlock: { alignItems: "flex-start" },
    botByline: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    quote: {
      borderLeftWidth: 2,
      borderLeftColor: colors.accent,
      paddingLeft: 12,
      maxWidth: "92%",
    },
    botText: { fontFamily: serif, color: colors.text, fontSize: 17, lineHeight: 25 },
    typingRow: { alignItems: "center", paddingBottom: 6 },
    error: { color: colors.error, textAlign: "center", paddingHorizontal: 16, paddingBottom: 4 },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 6,
      paddingHorizontal: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.outline,
      backgroundColor: colors.background,
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: colors.outline,
      alignItems: "center",
      justifyContent: "center",
    },
    stopButton: { borderColor: colors.error },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      maxHeight: 120,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    // Active (default): filled, clearly a pressable CTA — there's text to send.
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    // Inactive (empty box, or mid-send): plain outline, no fill — reads as
    // not-yet-clickable rather than a second "brand color" button in the row.
    sendButtonInactive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outline,
    },
  });
}
