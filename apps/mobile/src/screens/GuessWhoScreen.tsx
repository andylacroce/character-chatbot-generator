import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  displayCharacterName,
  fillTemplate,
  GUESS_WHO_CORRECT_BANNER,
  GUESS_WHO_GIVE_UP_CONFIRM,
  GUESS_WHO_INSTRUCTIONS,
  GUESS_WHO_SCREEN_COPY,
  GUESS_WHO_STREAK_LABEL,
  type ThemeColors,
} from "character-chatbot-shared";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import { useGuessWhoController } from "../useGuessWhoController";
import { loadGuessWhoInstructionsSeen, saveGuessWhoInstructionsSeen } from "../storage";
import GameInstructionsModal from "../components/GameInstructionsModal";
import LeaderboardClaim from "../components/LeaderboardClaim";
import DarkModeButton from "../components/DarkModeButton";
import AccountHeaderButton from "../components/AccountHeaderButton";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "GuessWho">;

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * "Guess Who" (the clue-reveal game) — mirrors the web app's GuessWhoPage.tsx on the
 * same shared state machine (useGuessWhoSession) and copy. A start/game-over screen
 * before a run, then a clue card + dedicated guess input (no chat, no audio — unlike
 * "Guess Who's Next"). Leaving the screen keeps the run, which resumes on return.
 */
export default function GuessWhoScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const game = useGuessWhoController();
  const [showInstructions, setShowInstructions] = useState(false);
  const {
    started,
    lastEvent,
    giveUp,
    displayedStreak,
    highScore,
    clue,
    clueNumber,
    totalClues,
    guess,
    setGuess,
    loading,
    submitGuess,
  } = game;

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
  }, [navigation, started, colors]);

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
            label={
              gameOver ? GUESS_WHO_SCREEN_COPY.playAgainLabel : GUESS_WHO_SCREEN_COPY.startLabel
            }
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

  const showReveal = lastEvent?.type === "correct" || lastEvent?.type === "gameover";

  return (
    <ScrollView contentContainerStyle={styles.roundScroll} keyboardShouldPersistTaps="handled">
      {instructions}
      <View style={styles.streakRow}>
        <Text style={styles.streakText}>{streakLine}</Text>
      </View>

      {showReveal && (lastEvent?.type === "correct" || lastEvent?.type === "gameover") ? (
        <View style={styles.revealBanner}>
          <Image source={{ uri: lastEvent.avatarUrl }} style={styles.revealAvatar} />
          <Text style={styles.revealText}>
            {lastEvent.type === "correct"
              ? fillTemplate(GUESS_WHO_CORRECT_BANNER, {
                  revealedName: displayCharacterName(lastEvent.revealedName),
                  streak: lastEvent.streak,
                })
              : fillTemplate(GUESS_WHO_SCREEN_COPY.gameOverSubhead, {
                  name: displayCharacterName(lastEvent.revealedName),
                  streak: lastEvent.finalStreak,
                })}
          </Text>
          {lastEvent.type === "correct" ? (
            game.continuing ? (
              <View style={styles.startingRow}>
                <ActivityIndicator color={colors.onPrimary} />
                <Text style={[styles.startingText, { color: colors.onPrimary }]}>
                  {GUESS_WHO_SCREEN_COPY.continuingLabel}
                </Text>
              </View>
            ) : (
              <Button
                label={GUESS_WHO_SCREEN_COPY.continueLabel}
                onPress={() => void game.continueRound()}
              />
            )
          ) : (
            <Button
              label={GUESS_WHO_SCREEN_COPY.playAgainLabel}
              onPress={() => void game.quitGame()}
            />
          )}
        </View>
      ) : (
        <>
          <View style={styles.clueCard}>
            <Text style={styles.clueLabel}>
              {GUESS_WHO_SCREEN_COPY.clueLabel} {clueNumber} / {totalClues || 5}
            </Text>
            <Text style={styles.clueText}>{clue}</Text>
          </View>

          {lastEvent?.type === "wrong" && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>Not quite — here&apos;s another clue.</Text>
            </View>
          )}

          <View style={styles.guessRow}>
            <TextInput
              value={guess}
              onChangeText={setGuess}
              placeholder={GUESS_WHO_SCREEN_COPY.guessPlaceholder}
              placeholderTextColor={colors.textSecondary}
              style={styles.guessInput}
              editable={!loading}
              onSubmitEditing={() => void submitGuess()}
              returnKeyType="send"
            />
            <Button
              label={GUESS_WHO_SCREEN_COPY.guessButtonLabel}
              onPress={() => void submitGuess()}
              disabled={loading || !guess.trim()}
            />
          </View>

          <Pressable onPress={confirmGiveUp} style={styles.spaced}>
            <Text style={styles.giveUpLink}>{GUESS_WHO_SCREEN_COPY.giveUpLabel}</Text>
          </Pressable>
        </>
      )}

      {game.error ? <Text style={styles.error}>{game.error}</Text> : null}
    </ScrollView>
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
    roundScroll: {
      flexGrow: 1,
      padding: 20,
      backgroundColor: colors.background,
      gap: 16,
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
    spaced: { marginTop: 12, alignItems: "center" },
    streakRow: { alignItems: "center" },
    streakText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
    clueCard: {
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outline,
      backgroundColor: colors.surface,
      alignItems: "center",
      gap: 10,
    },
    clueLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.textSecondary,
    },
    clueText: {
      fontFamily: serif,
      fontSize: 18,
      lineHeight: 26,
      color: colors.text,
      textAlign: "center",
    },
    banner: {
      padding: 12,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outline,
    },
    bannerText: { color: colors.text, fontSize: 14, textAlign: "center" },
    guessRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    guessInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 15,
    },
    giveUpLink: { color: colors.textSecondary, fontSize: 13, textDecorationLine: "underline" },
    revealBanner: {
      padding: 20,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      gap: 12,
    },
    revealAvatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 3,
      borderColor: colors.onPrimary,
    },
    revealText: { color: colors.onPrimary, fontSize: 16, fontWeight: "700", textAlign: "center" },
  });
}
