import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { displayCharacterName, type ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";
import type { ReplyAudio } from "../useReplyAudio";
import Avatar from "./Avatar";

/** A transcript entry. `avatarUrl` pins a past speaker's portrait (the game changes speakers). */
export type ChatViewMessage = {
  sender: string;
  text: string;
  avatarUrl?: string;
  audioFileUrl?: string;
  /** The speaker's round-specific gender hint, for audio replay after a game handoff. */
  gender?: string | null;
};

type Props = {
  messages: ChatViewMessage[];
  /** The current character: input placeholder, and the fallback avatar for their messages. */
  characterName: string;
  characterAvatarUrl: string;
  /** What to label the player's own messages ("Me" when they haven't named themselves). */
  userName: string;
  input: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  /** A reply is in flight: shows the typing indicator and locks the input. */
  sending: boolean;
  /** Locks the input without the typing indicator (e.g. the game's Continue banner). */
  inputLocked?: boolean;
  error?: string;
  audio: ReplyAudio;
  /** Shown above the transcript, e.g. the guessing game's result banners. */
  banner?: ReactNode;
  /** Replays one of the character's messages; mirrors the web ChatMessage replay button. */
  onReplay?: (message: ChatViewMessage) => void;
};

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * The chat transcript and input row shared by ChatScreen and GameScreen — mobile's
 * counterpart to the web app's ChatShell.tsx — so both screens get the same rendering and
 * the same Android keyboard handling.
 */
export default function ChatView({
  messages,
  characterName,
  characterAvatarUrl,
  userName,
  input,
  onChangeInput,
  onSend,
  sending,
  inputLocked = false,
  error,
  audio,
  banner,
  onReplay,
}: Props) {
  const { colors } = useTheme();
  // Memoized: this view re-renders on every keystroke, and recreating a fresh StyleSheet
  // each time was the actual cause of the send button intermittently failing to paint its
  // background on real Android devices while typing — not reproducible in the web preview.
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // `inverted` FlatList was tried for bottom-anchoring, but RN's per-item scaleY(-1)
  // counter-transform didn't take effect on this RN/Hermes/Android combo. Bottom-anchoring
  // instead comes from an explicit scrollToEnd, re-fired on every signal that can change
  // how much content fits (new message, keyboard show/hide, list container resize).
  const listRef = useRef<FlatList<ChatViewMessage>>(null);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  // Whether the Android keyboard is open — used to drop insets.bottom from the input row's
  // own padding while it's up. That padding is for the gesture-nav bar when the keyboard's
  // closed; KeyboardAvoidingView's lift already clears the keyboard, so leaving insets.bottom
  // on top of it left a real, measured gap on a Samsung (see CLAUDE.md for the full story).
  const [androidKeyboardOpen, setAndroidKeyboardOpen] = useState(false);

  useEffect(() => {
    // Mirrors the web app's useChatScrollAndFocus.ts: scroll immediately, then again after a
    // short delay, since the keyboard's viewport resize can settle after the event fires.
    const rescroll = () => {
      listRef.current?.scrollToEnd({ animated: false });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120);
    };
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      if (Platform.OS === "android") setAndroidKeyboardOpen(true);
      rescroll();
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      if (Platform.OS === "android") setAndroidKeyboardOpen(false);
      rescroll();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const locked = sending || inputLocked;
  const canSend = !locked && input.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      // Expo SDK 57 forces edge-to-edge on Android, which stops the native window resize
      // (adjustResize) this used to lean on. "padding" is the behavior that held up under
      // edge-to-edge; keyboardVerticalOffset uses the header's actual rendered height, since
      // a hardcoded value was wrong by a device-specific amount.
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      {banner}
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(_, index) => String(index)}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item, index }) => {
          const rowStyle = [styles.messageRow, index === messages.length - 1 && styles.lastRow];
          if (item.sender === "User") {
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
                <Avatar
                  name={item.sender}
                  avatarUrl={item.avatarUrl ?? characterAvatarUrl}
                  size={26}
                />
                <Text style={[styles.senderLabel, styles.botSenderLabel]}>
                  {displayCharacterName(item.sender)}
                </Text>
                {onReplay ? (
                  <Pressable
                    onPress={() => onReplay(item)}
                    disabled={!audio.audioEnabled}
                    hitSlop={10}
                    accessibilityLabel={`Replay audio for ${displayCharacterName(item.sender)}'s message`}
                    style={!audio.audioEnabled && styles.replayDisabled}
                  >
                    <Ionicons name="volume-medium-outline" size={16} color={colors.accent} />
                  </Pressable>
                ) : null}
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
          onPress={audio.toggleAudio}
          accessibilityLabel={audio.audioEnabled ? "Mute audio" : "Unmute audio"}
          android_ripple={{ color: colors.secondaryContainer, borderless: true, radius: 20 }}
          hitSlop={4}
        >
          <Ionicons
            name={audio.audioEnabled ? "volume-high-outline" : "volume-mute-outline"}
            size={18}
            color={colors.accent}
          />
        </Pressable>
        {audio.playing ? (
          <Pressable
            style={[styles.iconButton, styles.stopButton]}
            onPress={audio.stop}
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
          onChangeText={onChangeInput}
          placeholder={`Message ${displayCharacterName(characterName)}`}
          placeholderTextColor={colors.textSecondary}
          editable={!locked}
          returnKeyType="send"
          onSubmitEditing={onSend}
          onFocus={() => {
            listRef.current?.scrollToEnd({ animated: false });
            setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120);
          }}
          multiline
        />
        <Pressable
          style={[styles.sendButton, !canSend && styles.sendButtonInactive]}
          onPress={onSend}
          accessibilityLabel="Send"
          disabled={!canSend}
          android_ripple={{ color: "rgba(255,255,255,0.3)", borderless: true, radius: 21 }}
        >
          <Ionicons
            name="arrow-up"
            size={22}
            // Inactive: muted icon on a plain, unfilled circle. Active: colors.primary +
            // colors.onPrimary, the theme's own contrast-correct pairing (verified 4.8:1 /
            // 6.6:1). A constant white was tried and failed dark mode's contrast (2.7:1).
            color={canSend ? colors.onPrimary : colors.textSecondary}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    list: { flex: 1 },
    listContent: { padding: 16, flexGrow: 1, justifyContent: "flex-end" },
    messageRow: {
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.outline,
    },
    lastRow: { borderBottomWidth: 0 },
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
    replayDisabled: { opacity: 0.4 },
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
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonInactive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outline,
    },
  });
}
