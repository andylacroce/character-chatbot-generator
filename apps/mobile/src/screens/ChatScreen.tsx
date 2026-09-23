import { useEffect, useRef, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getReplayAudioUrl, type ChatMessage } from "character-chatbot-shared";
import { ApiError, type ChatRequestBody, getPersistedMessages, sendChatMessage } from "../api";
import { appendChatMessage, loadChatHistory } from "../storage";
import type { RootStackParamList } from "../navigation/types";
import { useAuth } from "../AuthContext";
import { useUserName } from "../useUserName";
import { useReplyAudio } from "../useReplyAudio";
import ChatView from "../components/ChatView";
import CharacterHeaderTitle from "../components/CharacterHeaderTitle";
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

/** One-on-one chat with a created or resumed character. */
export default function ChatScreen({ route, navigation }: Props) {
  const { bot } = route.params;
  const auth = useAuth();
  const userNameCtx = useUserName();
  const userName = userNameCtx.name || "Me";
  const audio = useReplyAudio();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const introSentRef = useRef(false);

  // Set here rather than statically in App.tsx so it can share this screen's lightbox state.
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <CharacterHeaderTitle
          name={bot.name}
          avatarUrl={bot.avatarUrl}
          onPress={() => setLightboxOpen(true)}
        />
      ),
    });
  }, [navigation, bot.name, bot.avatarUrl]);

  useEffect(() => {
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
          audio.play(response.audioFileUrl);
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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = { sender: "User", text };
    setMessages([...messages, userMessage]);
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
      audio.play(response.audioFileUrl);
    } catch (err) {
      logChatError("send failed", err);
      setError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PortraitLightbox
        visible={lightboxOpen}
        name={bot.name}
        avatarUrl={bot.avatarUrl}
        onClose={() => setLightboxOpen(false)}
      />
      <ChatView
        messages={messages}
        characterName={bot.name}
        characterAvatarUrl={bot.avatarUrl}
        userName={userName}
        input={input}
        onChangeInput={setInput}
        onSend={handleSend}
        sending={sending}
        error={error}
        audio={audio}
        onReplay={(m) =>
          audio.play(
            getReplayAudioUrl({
              text: m.text,
              botName: m.sender,
              gender: bot.gender,
              voiceConfig: bot.voiceConfig,
            }),
          )
        }
      />
    </>
  );
}
