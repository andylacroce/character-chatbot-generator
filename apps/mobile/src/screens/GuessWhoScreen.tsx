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
  GUESS_WHO_CORRECT_BANNER,
  GUESS_WHO_FALLBACK_AVATAR,
  GUESS_WHO_GIVE_UP_CONFIRM,
  GUESS_WHO_INSTRUCTIONS,
  GUESS_WHO_MYSTERY_NAME,
  GUESS_WHO_SCREEN_COPY,
  GUESS_WHO_STREAK_LABEL,
  type ThemeColors,
} from "character-chatbot-shared";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import { useUserName } from "../useUserName";
import { useGuessWhoController } from "../useGuessWhoController";
import { loadGuessWhoInstructionsSeen, saveGuessWhoInstructionsSeen } from "../storage";
import ChatView from "../components/ChatView";
import CharacterHeaderTitle from "../components/CharacterHeaderTitle";
import PortraitLightbox from "../components/PortraitLightbox";
import GameInstructionsModal from "../components/GameInstructionsModal";
import LeaderboardClaim from "../components/LeaderboardClaim";
import DarkModeButton from "../components/DarkModeButton";
import AccountHeaderButton from "../components/AccountHeaderButton";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "GuessWho">;

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * "Guess Who" (the self-describing chat game) — mirrors the web app's GuessWhoPage.tsx
 * and this app's own GuessWhoNextScreen.tsx on the same shared state machine
 * (useGuessWhoSession) and chat view. The player chats with a mystery character who
 * never reveals its own name, shown as "???" with a silhouette avatar until a correct
 * guess or give-up reveals the real identity. Leaving the screen keeps the run, which
 * resumes on return.
 */
export default function GuessWhoScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const userNameCtx = useUserName();
  const game = useGuessWhoController();
  const [showInstructions, setShowInstructions] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { started, lastEvent, giveUpRequested, clearGiveUpRequest, giveUp, displayedStreak, highScore } =
    game;

  const revealed =
    lastEvent?.type === "correct" || lastEvent?.type === "gameover" ? lastEvent : null;
  const displayName = revealed ? displayCharacterName(revealed.revealedName) : GUESS_WHO_MYSTERY_NAME;
  const displayAvatarUrl = revealed?.avatarUrl ?? GUESS_WHO_FALLBACK_AVATAR;

  useEffect(() => {
    loadGuessWhoInstructionsSeen().then((seen) => {
      if (!seen) setShowInstructions(true);
    });
  }, []);

  const closeInstructions = () => {
    setShowInstructions(false);
    void saveGuessWhoInstructionsSeen();
  };

  const confirmGiveUp = () =>
    Alert.alert(GUESS_WHO_GIVE_UP_CONFIRM.title, GUESS_WHO_GIVE_UP_CONFIRM.body, [
      { text: GUESS_WHO_GIVE_UP_CONFIRM.cancelLabel, style: "cancel" },
      {
        text: GUESS_WHO_GIVE_UP_CONFIRM.confirmLabel,
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

  const streakLine = `${GUESS_WHO_STREAK_LABEL}: ${displayedStreak}${
    typeof highScore === "number" && highScore > 0 ? ` · Best: ${highScore}` : ""
  }`;

  useEffect(() => {
    navigation.setOptions({
      headerTitle: started
        ? () => (
            <CharacterHeaderTitle
              name={displayName}
              avatarUrl={displayAvatarUrl}
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
  }, [navigation, started, displayName, displayAvatarUrl, streakLine, colors]);

  const instructions = (
    <GameInstructionsModal
      visible={showInstructions}
      onClose={closeInstructions}
      copy={GUESS_WHO_INSTRUCTIONS}
    />
  );

  if (!started) {
    const gameOver = lastEvent?.type === "gameover" ? lastEvent : null;
    return (
      <ScrollView contentContainerStyle={styles.startScroll} keyboardShouldPersistTaps="handled">
        {instructions}
        <Text style={styles.headline}>
          {gameOver ? GUESS_WHO_SCREEN_COPY.gameOverHeadline : GUESS_WHO_SCREEN_COPY.headline}
        </Text>
        <Text style={styles.subhead}>
          {gameOver
            ? fillTemplate(GUESS_WHO_SCREEN_COPY.gameOverSubhead, {
                name: displayCharacterName(gameOver.revealedName),
                streak: gameOver.finalStreak,
              })
            : GUESS_WHO_SCREEN_COPY.subhead}
        </Text>
        {game.starting ? (
          <View style={styles.startingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.startingText}>{GUESS_WHO_SCREEN_COPY.startingLabel}</Text>
          </View>
        ) : (
          <Button
            label={gameOver ? GUESS_WHO_SCREEN_COPY.playAgainLabel : GUESS_WHO_SCREEN_COPY.startLabel}
            onPress={() => void game.startGame()}
          />
        )}
        {game.error ? <Text style={styles.error}>{game.error}</Text> : null}
        {gameOver ? <LeaderboardClaim game="guessWho" /> : null}
        <View style={styles.spaced}>
          <Button
            label={GUESS_WHO_SCREEN_COPY.leaderboardLabel}
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
          {fillTemplate(GUESS_WHO_CORRECT_BANNER, {
            revealedName: displayCharacterName(lastEvent.revealedName),
            streak: lastEvent.streak,
          })}
        </Text>
        <Button
          label={GUESS_WHO_SCREEN_COPY.continueLabel}
          onPress={() => void game.continueRound()}
        />
      </View>
    );
  } else if (game.continuing) {
    banner = (
      <View style={[styles.banner, styles.startingRow]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.startingText}>{GUESS_WHO_SCREEN_COPY.continuingLabel}</Text>
      </View>
    );
  } else if (lastEvent?.type === "wrong") {
    banner = (
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{GUESS_WHO_SCREEN_COPY.wrongBanner}</Text>
      </View>
    );
  }

  return (
    <>
      {instructions}
      <PortraitLightbox
        visible={lightboxOpen}
        name={displayName}
        avatarUrl={displayAvatarUrl}
        onClose={() => setLightboxOpen(false)}
      />
      <ChatView
        messages={game.messages}
        characterName={displayName}
        characterAvatarUrl={displayAvatarUrl}
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
              gender: null,
              voiceConfig: findSpeakerVoiceConfig(game.messages, m.sender),
            }),
          )
        }
      />
    </>
  );
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
