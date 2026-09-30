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
import * as Haptics from "expo-haptics";
import {
  displayCharacterName,
  getReplayAudioUrl,
  findSpeakerVoiceConfig,
  fillTemplate,
  GUESS_WHO,
  GUESS_WHO_NEXT,
  type GameDefinition,
  type ThemeColors,
} from "character-chatbot-shared";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import { useUserName } from "../useUserName";
import { useGameController } from "../useGameController";
import { loadGameInstructionsSeen, saveGameInstructionsSeen } from "../storage";
import ChatView from "../components/ChatView";
import CharacterHeaderTitle from "../components/CharacterHeaderTitle";
import PortraitLightbox from "../components/PortraitLightbox";
import GameInstructionsModal from "../components/GameInstructionsModal";
import LeaderboardClaim from "../components/LeaderboardClaim";
import DarkModeButton from "../components/DarkModeButton";
import AccountHeaderButton from "../components/AccountHeaderButton";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "GuessWho" | "GuessWhoNext"> & {
  game: GameDefinition;
};

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * A guessing game, either one ("Guess Who" or "Guess Who's Next", picked by `game`) —
 * mirrors the web app's GamePage.tsx on the same shared state machine (useGameSession) and
 * copy. A start/game-over screen before a run, then the ordinary chat view with the streak in
 * the header and result banners above the transcript. In "Guess Who" the header shows "???"
 * and a silhouette until a reveal. Leaving the screen keeps the run, which resumes on return.
 */
function GameScreen({ navigation, game: definition }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const userNameCtx = useUserName();
  const { copy } = definition;
  const game = useGameController(definition);
  const [showInstructions, setShowInstructions] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const {
    started,
    lastEvent,
    giveUpRequested,
    clearGiveUpRequest,
    giveUp,
    speaker,
    displayedStreak,
    highScore,
  } = game;

  useEffect(() => {
    loadGameInstructionsSeen(definition).then((seen) => {
      if (!seen) setShowInstructions(true);
    });
  }, [definition]);

  const closeInstructions = () => {
    setShowInstructions(false);
    void saveGameInstructionsSeen(definition);
  };

  const confirmGiveUp = () =>
    Alert.alert(copy.giveUpConfirm.title, copy.giveUpConfirm.body, [
      { text: copy.giveUpConfirm.cancelLabel, style: "cancel" },
      {
        text: copy.giveUpConfirm.confirmLabel,
        style: "destructive",
        onPress: () => void giveUp(true),
      },
    ]);

  // A give-up typed into the chat ("I give up") gets the same confirmation as the button.
  useEffect(() => {
    if (!giveUpRequested) return;
    clearGiveUpRequest();
    confirmGiveUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giveUpRequested]);

  // Native-only touch: feel the verdict as well as read it.
  useEffect(() => {
    if (!lastEvent) return;
    Haptics.notificationAsync(
      lastEvent.type === "correct"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
  }, [lastEvent]);

  const streakLine = `${copy.streakLabel}: ${displayedStreak}${
    typeof highScore === "number" && highScore > 0 ? ` · Best: ${highScore}` : ""
  }`;

  useEffect(() => {
    navigation.setOptions({
      headerTitle: started
        ? () => (
            <CharacterHeaderTitle
              name={speaker.name}
              avatarUrl={speaker.avatarUrl}
              subtitle={streakLine}
              onPress={() => setLightboxOpen(true)}
            />
          )
        : undefined,
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowInstructions(true)}
            hitSlop={8}
            style={styles.headerButton}
            accessibilityLabel="How to play"
          >
            <Ionicons name="help-circle-outline" size={21} color={colors.text} />
          </Pressable>
          {started ? (
            <Pressable
              onPress={confirmGiveUp}
              hitSlop={8}
              style={styles.headerButton}
              accessibilityLabel="Give up"
            >
              <Ionicons name="flag-outline" size={20} color={colors.text} />
            </Pressable>
          ) : null}
          <AccountHeaderButton navigation={navigation} />
          <DarkModeButton />
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, started, speaker.name, speaker.avatarUrl, streakLine, colors]);

  const instructions = (
    <GameInstructionsModal
      visible={showInstructions}
      onClose={closeInstructions}
      copy={copy.instructions}
    />
  );

  if (!started) {
    const gameOver = lastEvent?.type === "gameover" ? lastEvent : null;
    return (
      <ScrollView contentContainerStyle={styles.startScroll} keyboardShouldPersistTaps="handled">
        {instructions}
        <Text style={styles.headline}>
          {gameOver ? copy.screen.gameOverHeadline : copy.screen.headline}
        </Text>
        <Text style={styles.subhead}>
          {gameOver
            ? fillTemplate(copy.screen.gameOverSubhead, {
                name: displayCharacterName(gameOver.revealedName),
                streak: gameOver.finalStreak,
              })
            : copy.screen.subhead}
        </Text>
        {game.starting ? (
          <View style={styles.startingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.startingText}>{copy.screen.startingLabel}</Text>
          </View>
        ) : (
          <Button
            label={gameOver ? copy.screen.playAgainLabel : copy.screen.startLabel}
            onPress={() => void game.startGame()}
          />
        )}
        {game.error ? <Text style={styles.error}>{game.error}</Text> : null}
        {gameOver ? <LeaderboardClaim game={definition} /> : null}
        <View style={styles.spaced}>
          <Button
            label={copy.screen.leaderboardLabel}
            variant="secondary"
            onPress={() => navigation.navigate("Leaderboard")}
          />
        </View>
      </ScrollView>
    );
  }

  let banner: React.ReactNode = null;
  if (game.awaitingContinue && lastEvent?.type === "correct") {
    banner = (
      <View style={[styles.banner, styles.correctBanner]}>
        <Text style={styles.bannerText}>
          {fillTemplate(copy.correctBanner, {
            revealedName: displayCharacterName(lastEvent.revealedName),
            streak: lastEvent.streak,
          })}
        </Text>
        <Button label={copy.screen.continueLabel} onPress={() => void game.continueRound()} />
      </View>
    );
  } else if (game.continuing) {
    banner = (
      <View style={[styles.banner, styles.startingRow]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.startingText}>{copy.screen.continuingLabel}</Text>
      </View>
    );
  } else if (lastEvent?.type === "wrong") {
    banner = (
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{copy.screen.wrongBanner}</Text>
      </View>
    );
  }

  return (
    <>
      {instructions}
      <PortraitLightbox
        visible={lightboxOpen}
        name={speaker.name}
        avatarUrl={speaker.avatarUrl}
        onClose={() => setLightboxOpen(false)}
      />
      <ChatView
        messages={game.messages}
        characterName={speaker.name}
        characterAvatarUrl={speaker.avatarUrl}
        userName={userNameCtx.name || "Me"}
        input={game.input}
        onChangeInput={game.setInput}
        onSend={() => void game.sendMessage()}
        sending={game.loading}
        inputLocked={game.awaitingContinue || game.continuing}
        error={game.error}
        audio={game.audio}
        banner={banner}
        onReplay={(m) =>
          game.audio.play(
            getReplayAudioUrl({
              audioFileUrl: m.audioFileUrl,
              text: m.text,
              botName: m.sender,
              gender: m.gender ?? (m.sender === speaker.name ? speaker.gender : null),
              // See useGameController.ts's replayMessageAudio (web) for why this matters:
              // without it, a message with no audio of its own would regenerate through a
              // context-free server-side re-cast that can pick a different voice/gender.
              voiceConfig: findSpeakerVoiceConfig(game.messages, m.sender),
            }),
          )
        }
      />
    </>
  );
}

/** "Guess Who" (chat with a mystery character) — the navigation route's component. */
export function GuessWhoScreen(props: Omit<Props, "game">) {
  return <GameScreen {...props} game={GUESS_WHO} />;
}

/** "Guess Who's Next" (chat with a named character who steers toward a hidden one). */
export function GuessWhoNextScreen(props: Omit<Props, "game">) {
  return <GameScreen {...props} game={GUESS_WHO_NEXT} />;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    headerActions: { flexDirection: "row", alignItems: "center" },
    headerButton: { padding: 6 },
    startScroll: {
      flexGrow: 1,
      padding: 24,
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    headline: {
      fontFamily: serif,
      fontSize: 28,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      marginBottom: 12,
    },
    subhead: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      marginBottom: 24,
    },
    startingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
    startingText: { color: colors.text, fontSize: 15 },
    error: { color: colors.error, textAlign: "center", marginTop: 12 },
    spaced: { marginTop: 12 },
    banner: {
      margin: 12,
      marginBottom: 0,
      padding: 14,
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.outline,
      backgroundColor: colors.surface,
    },
    correctBanner: { borderColor: colors.primary },
    bannerText: { color: colors.text, fontSize: 15, textAlign: "center" },
  });
}
