import { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  getReplayAudioUrl,
  useChatSession,
  type Bot,
  type ChatLogger,
  type ChatStorage,
  type ChatTransport,
} from "character-chatbot-shared";
import { generatePersonality, getPersistedMessages, getVoiceConfig, sendChatMessage } from "../api";
import { persistBotIfSignedIn } from "../botCreation";
import { loadBot, loadChatHistory, saveBot, saveChatHistory } from "../storage";
import type { RootStackParamList } from "../navigation/types";
import { useAuth } from "../AuthContext";
import { useUserName } from "../useUserName";
import { useReplyAudio } from "../useReplyAudio";
import ChatView from "../components/ChatView";
import CharacterHeaderTitle from "../components/CharacterHeaderTitle";
import PortraitLightbox from "../components/PortraitLightbox";
import ReportModal, { type ReportTarget } from "../components/ReportModal";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

const transport: ChatTransport = {
  send: sendChatMessage,
  fetchHistory: async (botName) =>
    (await getPersistedMessages(botName)).map(({ sender, text }) => ({ sender, text })),
  fetchVoiceConfig: (bot) => getVoiceConfig(bot.name, bot.gender, bot.personality),
  refreshPersona: (bot) => generatePersonality({ name: bot.name }),
};

/** Stores a re-signed character over the active saved one (when it is the same) and on the account. */
async function saveRefreshedBot(bot: Bot) {
  try {
    if ((await loadBot())?.name === bot.name) await saveBot(bot);
  } catch (err) {
    console.warn("[Chat] chat_refreshed_bot_save_failed", err);
  }
  persistBotIfSignedIn(bot);
}

// Stored turns never carry a reply's audio URL, which is only good for the session it came from.
const storage: ChatStorage = {
  load: loadChatHistory,
  save: (botName, messages) =>
    saveChatHistory(
      botName,
      messages.map(({ sender, text }) => ({ sender, text })),
    ),
};

const log: ChatLogger = (level, event, message, meta) =>
  console[level === "info" ? "log" : level](`[Chat] ${event}: ${message}`, meta);

/** One-on-one chat with a created or resumed character. */
export default function ChatScreen({ route, navigation }: Props) {
  const { bot } = route.params;
  const auth = useAuth();
  const userNameCtx = useUserName();
  const userName = userNameCtx.name || "Me";
  const audio = useReplyAudio();
  const [input, setInput] = useState("");
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const chat = useChatSession({
    bot,
    userName: userName !== "Me" ? userName : undefined,
    authStatus: auth.status,
    transport,
    storage,
    log,
    onReply: (response) => audio.play(response.audioFileUrl),
    onBotRefreshed: (refreshed) => void saveRefreshedBot(refreshed),
  });

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

  const handleSend = () => {
    const text = input.trim();
    if (!text || chat.sending) return;
    setInput("");
    void chat.send(text);
  };

  return (
    <>
      <PortraitLightbox
        visible={lightboxOpen}
        name={bot.name}
        avatarUrl={bot.avatarUrl}
        onClose={() => setLightboxOpen(false)}
        onReport={() => {
          // One modal at a time: iOS can't stack the report modal over the lightbox.
          setLightboxOpen(false);
          setReportTarget({ targetType: "character", characterName: bot.name });
        }}
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
      <ChatView
        messages={chat.messages}
        characterName={bot.name}
        characterAvatarUrl={bot.avatarUrl}
        userName={userName}
        input={input}
        onChangeInput={setInput}
        onSend={handleSend}
        sending={chat.sending || chat.introLoading}
        error={chat.error}
        audio={audio}
        onReplay={async (m) =>
          audio.play(
            getReplayAudioUrl({
              text: m.text,
              botName: m.sender,
              gender: bot.gender,
              voiceConfig: await chat.ensureVoiceConfig(),
            }),
          )
        }
      />
    </>
  );
}
