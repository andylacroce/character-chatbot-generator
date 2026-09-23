import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import {
  persistedBotToBot,
  sanitizeCharacterName,
  type Bot,
  type CharacterValidationResult,
  type PersistedBot,
  type ThemeColors,
} from "character-chatbot-shared";
import { getPersistedBots, getRandomCharacter, validateCharacter } from "../api";
import { createBot, persistBotIfSignedIn, type CreateBotOptions } from "../botCreation";
import { loadBot, saveBot } from "../storage";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import { useAuth } from "../AuthContext";
import { useUserName } from "../useUserName";
import { BRAND } from "../theme";
import Avatar from "../components/Avatar";
import CharacterCarousel from "../components/CharacterCarousel";
import Wordmark from "../components/Wordmark";
import CopyrightWarningModal from "../components/CopyrightWarningModal";
import CharacterDescriptionModal from "../components/CharacterDescriptionModal";
import AccountModal from "../components/AccountModal";
import NameCaptureModal from "../components/NameCaptureModal";

type Props = NativeStackScreenProps<RootStackParamList, "Creator">;

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
/** Rows shown before collapsing behind a "Show N more" toggle — mirrors ResumeBotDropdown.tsx. */
const PREVIOUS_VISIBLE_LIMIT = 3;

/**
 * Character creation: name in → validate-character → personality → avatar → voice.
 * Mirrors the web app's useBotCreation pipeline, including the copyright/caution
 * modal and the "unrecognized name" description flow. Signed-in users additionally
 * get a server-backed "Previously" list (GET /api/bots) alongside the local resume
 * card, and a newly created character is persisted to their account (see
 * persistBotIfSignedIn in botCreation.ts).
 */
export default function CreatorScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const auth = useAuth();
  const userNameCtx = useUserName();
  const [input, setInput] = useState("");
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [randomizing, setRandomizing] = useState(false);
  const [error, setError] = useState("");
  const [savedBot, setSavedBot] = useState<Bot | null>(null);
  const [persistedBots, setPersistedBots] = useState<PersistedBot[]>([]);
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showNameGateModal, setShowNameGateModal] = useState(false);
  const [validationResult, setValidationResult] = useState<CharacterValidationResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const cancelledRef = useRef(false);
  // Holds whichever creation entry point (typed name or carousel tap) triggered the
  // name gate, so it can resume exactly where it left off once the gate closes.
  const pendingAfterGateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadBot().then(setSavedBot);
  }, []);

  useEffect(() => {
    if (auth.status !== "signedIn") return;
    getPersistedBots()
      .then(setPersistedBots)
      .catch(() => setPersistedBots([]));
  }, [auth.status]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => setShowAccountModal(true)}
          hitSlop={8}
          android_ripple={{ color: colors.secondaryContainer, borderless: true, radius: 18 }}
          style={styles.headerAccountButton}
          accessibilityLabel={auth.status === "signedIn" ? "Account" : "Sign in"}
        >
          <Ionicons
            name={auth.status === "signedIn" ? "person-circle" : "person-circle-outline"}
            size={22}
            color={colors.text}
          />
        </Pressable>
      ),
    });
  }, [navigation, colors, auth.status, styles.headerAccountButton]);

  const handleResume = () => {
    if (savedBot) navigation.navigate("Chat", { bot: savedBot });
  };

  const handleResumePersisted = (bot: PersistedBot) => {
    navigation.navigate("Chat", { bot: persistedBotToBot(bot) });
  };

  const finishCreate = async (name: string, options?: CreateBotOptions) => {
    cancelledRef.current = false;
    setError("");
    try {
      const bot = await createBot(name, setLoadingMessage, () => cancelledRef.current, options);
      if (!bot) return;
      await saveBot(bot);
      persistBotIfSignedIn(bot);
      setLoadingMessage(null);
      // navigate, not replace: keeps Creator in the stack so Chat gets a working
      // back button instead of leaving the user with no way out of the chat.
      navigation.navigate("Chat", { bot });
    } catch (err) {
      if (cancelledRef.current) return;
      setLoadingMessage(null);
      setError(
        err instanceof Error ? err.message : "Failed to generate character. Please try again.",
      );
    }
  };

  // Pauses `proceed` behind a one-time "what should we call you" gate the first time
  // this device doesn't yet know the visitor's own preferred name (and hasn't already
  // skipped being asked) — resolved only once we authoritatively know there's no name
  // (isResolved), so an already-named signed-in user isn't asked again just because
  // GET /api/user-profile hadn't returned yet. Mirrors useBotCreation.ts's own gate,
  // generalized to cover both of this screen's creation entry points (typed name and
  // carousel tap) via a pending-callback ref instead of a re-entrant handleCreate call.
  const maybeGateOnName = (proceed: () => void) => {
    if (userNameCtx.isResolved && !userNameCtx.name && !userNameCtx.hasSkippedGate) {
      pendingAfterGateRef.current = proceed;
      setShowNameGateModal(true);
      return;
    }
    proceed();
  };

  const handleNameGateSave = (name: string) => {
    if (name.trim()) userNameCtx.setName(name.trim());
    else userNameCtx.markGateSkipped();
    setShowNameGateModal(false);
    pendingAfterGateRef.current?.();
    pendingAfterGateRef.current = null;
  };

  const handleNameGateSkip = () => {
    userNameCtx.markGateSkipped();
    setShowNameGateModal(false);
    pendingAfterGateRef.current?.();
    pendingAfterGateRef.current = null;
  };

  const runCreate = async () => {
    const name = sanitizeCharacterName(input);
    if (!name) {
      setError("Please enter a name or character.");
      return;
    }

    setError("");
    cancelledRef.current = false;
    setLoadingMessage("Validating character");
    const validation = await validateCharacter(name);
    if (cancelledRef.current) return;

    if (validation.blocked) {
      setLoadingMessage(null);
      setError("That name isn't allowed. Please choose a different name.");
      return;
    }
    if (validation.warningLevel === "warning" || validation.warningLevel === "caution") {
      setLoadingMessage(null);
      setValidationResult(validation);
      setShowValidationModal(true);
      return;
    }
    if (validation.recognized === false) {
      setLoadingMessage(null);
      setShowDescriptionModal(true);
      return;
    }

    await finishCreate(name, { recognized: true });
  };

  const handleCreate = () => maybeGateOnName(runCreate);

  const handleCancel = () => {
    cancelledRef.current = true;
    setLoadingMessage(null);
  };

  const handleRandom = async () => {
    setRandomizing(true);
    setError("");
    try {
      const { name } = await getRandomCharacter();
      setInput(name);
    } catch {
      setError("Failed to get a random character.");
    } finally {
      setRandomizing(false);
    }
  };

  const handleValidationContinue = () => {
    setShowValidationModal(false);
    const name = sanitizeCharacterName(input);
    finishCreate(name, {
      skipPersistence: true,
      recognized: validationResult?.recognized !== false,
    });
  };

  // Tapping a carousel portrait is a known-recognized name already (it came from the
  // shared cache) — skip straight to generation, same as CharWallScreen's tiles.
  const handleCarouselSelect = (name: string) => {
    maybeGateOnName(() => finishCreate(name, { recognized: true }));
  };

  const handleValidationSuggestion = (suggestion: string) => {
    setInput(suggestion);
    setShowValidationModal(false);
  };

  const handleDescriptionSubmit = (description: string, appearance: string) => {
    setShowDescriptionModal(false);
    const name = sanitizeCharacterName(input);
    finishCreate(name, {
      description,
      appearanceDescription: appearance || undefined,
      skipPersistence: true,
      recognized: false,
    });
  };

  const busy = loadingMessage !== null;
  const otherPersistedBots = persistedBots.filter(
    (b) => !savedBot || b.name.toLowerCase() !== savedBot.name.toLowerCase(),
  );
  const visiblePersistedBots = previousExpanded
    ? otherPersistedBots
    : otherPersistedBots.slice(0, PREVIOUS_VISIBLE_LIMIT);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Wordmark text={BRAND.name} />
        <Text style={styles.kicker}>{BRAND.kicker}</Text>

        {savedBot && !busy ? (
          <Pressable
            style={styles.resumeCard}
            onPress={handleResume}
            android_ripple={{ color: colors.secondaryContainer }}
          >
            <Avatar name={savedBot.name} avatarUrl={savedBot.avatarUrl} size={36} />
            <View style={styles.resumeTextWrap}>
              <Text style={styles.resumeLabel}>Continue chatting with</Text>
              <Text style={styles.resumeName}>{savedBot.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {!busy && auth.status === "signedIn" && otherPersistedBots.length > 0 ? (
          <View style={styles.previousSection}>
            <Text style={styles.previousLabel}>Previously</Text>
            {visiblePersistedBots.map((b) => (
              <Pressable
                key={b.id}
                style={styles.resumeCard}
                onPress={() => handleResumePersisted(b)}
                android_ripple={{ color: colors.secondaryContainer }}
              >
                <Avatar name={b.name} avatarUrl={b.avatarUrl} size={36} />
                <View style={styles.resumeTextWrap}>
                  <Text style={styles.resumeName}>{b.name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
            {otherPersistedBots.length > PREVIOUS_VISIBLE_LIMIT ? (
              <Pressable onPress={() => setPreviousExpanded((e) => !e)} style={styles.showMore}>
                <Text style={styles.showMoreText}>
                  {previousExpanded
                    ? "Show less"
                    : `Show ${otherPersistedBots.length - PREVIOUS_VISIBLE_LIMIT} more`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <CharacterCarousel onSelect={handleCarouselSelect} disabled={busy} />

        <Text style={styles.headline}>{BRAND.headline}</Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sherlock Holmes"
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            editable={!busy && !randomizing}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleCreate}
          />
          <Pressable
            onPress={handleRandom}
            disabled={busy || randomizing}
            accessibilityLabel="Random character"
            android_ripple={{ color: colors.secondaryContainer, borderless: true, radius: 24 }}
            style={styles.diceButton}
            hitSlop={8}
          >
            {randomizing ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <Ionicons name="shuffle-outline" size={20} color={colors.secondary} />
            )}
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleCreate}
          disabled={busy}
          android_ripple={{ color: "rgba(255,255,255,0.25)" }}
          style={({ pressed }) => [
            styles.createButton,
            busy && styles.createButtonBusy,
            pressed && Platform.OS === "ios" && styles.createButtonPressedIOS,
          ]}
        >
          {busy ? (
            <View style={styles.createButtonRow}>
              <ActivityIndicator color={colors.onPrimary} />
              <Text style={styles.createButtonText}>{loadingMessage}</Text>
            </View>
          ) : (
            <Text style={styles.createButtonText}>Create</Text>
          )}
        </Pressable>

        {busy ? (
          <Pressable
            onPress={handleCancel}
            style={styles.cancelButton}
            android_ripple={{ color: colors.outline, borderless: true }}
            hitSlop={8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => navigation.navigate("CharWall")}
          style={styles.wallLink}
          android_ripple={{ color: colors.secondaryContainer, borderless: true }}
        >
          <Ionicons name="grid-outline" size={16} color={colors.secondary} />
          <Text style={styles.wallLinkText}>Browse the Character Wall</Text>
        </Pressable>
      </ScrollView>

      {validationResult ? (
        <CopyrightWarningModal
          visible={showValidationModal}
          validation={validationResult}
          onContinue={handleValidationContinue}
          onCancel={() => setShowValidationModal(false)}
          onSelectSuggestion={handleValidationSuggestion}
        />
      ) : null}
      <CharacterDescriptionModal
        visible={showDescriptionModal}
        characterName={sanitizeCharacterName(input)}
        onSubmit={handleDescriptionSubmit}
        onCancel={() => setShowDescriptionModal(false)}
      />
      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        userNameCtx={userNameCtx}
      />
      <NameCaptureModal
        visible={showNameGateModal}
        mode="gate"
        currentName=""
        onSave={handleNameGateSave}
        onSkip={handleNameGateSkip}
        onClose={handleNameGateSkip}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // Trimmed from earlier sizes (kicker margin 20, headline 24/24) so the wordmark
    // and carousel — now the screen's two major visual focal points, per the web
    // app's own hero treatment — have room without pushing the form too far below
    // the fold. Scrolling to reach Create is fine; it's the top content that matters.
    scroll: { flexGrow: 1, padding: 24, paddingTop: 28, alignItems: "center" },
    kicker: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 2,
      textTransform: "uppercase",
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: 14,
    },
    resumeCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      alignSelf: "stretch",
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 14,
      padding: 10,
      marginBottom: 14,
      backgroundColor: colors.surface,
    },
    resumeTextWrap: { flex: 1 },
    resumeLabel: { color: colors.textSecondary, fontSize: 11 },
    resumeName: { color: colors.text, fontSize: 16, fontWeight: "600", fontFamily: serif },
    previousSection: { alignSelf: "stretch", marginBottom: 4 },
    previousLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    showMore: { alignSelf: "center", padding: 6, marginBottom: 10 },
    showMoreText: { color: colors.secondary, fontSize: 13, fontWeight: "600" },
    headerAccountButton: { padding: 6, marginLeft: 4 },
    headline: {
      fontFamily: serif,
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 25,
      color: colors.text,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 18,
      alignSelf: "stretch",
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 12,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      marginBottom: 16,
      alignSelf: "stretch",
    },
    input: {
      flex: 1,
      fontFamily: serif,
      fontSize: 18,
      color: colors.text,
      paddingVertical: 14,
    },
    diceButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    errorBanner: {
      backgroundColor: colors.errorContainer,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      alignSelf: "stretch",
    },
    errorText: { color: colors.error, textAlign: "center" },
    createButton: {
      // No `elevation` here: combined with `overflow: "hidden"` (needed to clip the
      // ripple to the rounded corners), Android's shadow compositing washes out the
      // button's own background color once pressed — see ChatScreen's send button
      // for the same fix. shadow* (iOS-only) is unaffected.
      backgroundColor: colors.primary,
      borderRadius: 24,
      paddingVertical: 15,
      alignItems: "center",
      overflow: "hidden",
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      alignSelf: "stretch",
    },
    createButtonBusy: { opacity: 0.9 },
    createButtonPressedIOS: { opacity: 0.85 },
    createButtonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    createButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: "600" },
    cancelButton: { marginTop: 16, alignItems: "center", alignSelf: "center", padding: 8 },
    cancelText: { color: colors.textSecondary, fontSize: 14 },
    wallLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 32,
      padding: 8,
    },
    wallLinkText: { color: colors.secondary, fontSize: 14, fontWeight: "600" },
  });
}
