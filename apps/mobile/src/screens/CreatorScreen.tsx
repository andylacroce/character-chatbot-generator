import { useEffect, useMemo, useState } from "react";
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
  displayCharacterName,
  GAME_CTA_LABEL,
  sanitizeCharacterName,
  useCharacterCreation,
  type Bot,
  type ThemeColors,
} from "character-chatbot-shared";
import { mobileTransport, persistBotIfSignedIn } from "../botCreation";
import { loadBot, saveBot } from "../storage";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import { useAuth } from "../AuthContext";
import { useUserName } from "../useUserName";
import { BRAND } from "../theme";
import Avatar from "../components/Avatar";
import CharacterCarousel, { CAROUSEL_MAX_SIZE } from "../components/CharacterCarousel";
import Wordmark from "../components/Wordmark";
import CopyrightWarningModal from "../components/CopyrightWarningModal";
import CharacterDescriptionModal from "../components/CharacterDescriptionModal";
import AccountModal from "../components/AccountModal";
import NameCaptureModal from "../components/NameCaptureModal";

type Props = NativeStackScreenProps<RootStackParamList, "Creator">;

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
/** Smallest the carousel halo shrinks to before the screen falls back to scrolling. */
const CAROUSEL_MIN_SIZE = 110;
/** Carousel height beyond its halo: stage margin + name label minHeight + bottom margin. */
const CAROUSEL_CHROME = 66;

/**
 * Character creation: name in → validate-character → personality → avatar → voice.
 * Uses character-chatbot-shared's useCharacterCreation, mirroring the web app's
 * useBotCreation. Signed-in users additionally get a link to HistoryScreen, and a
 * newly created character is persisted to their account.
 */
export default function CreatorScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const auth = useAuth();
  const userNameCtx = useUserName();
  const [savedBot, setSavedBot] = useState<Bot | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Reload on every focus, not just mount: returning from a chat must show that
  // character in the resume card, not whichever one was saved when this screen mounted.
  useEffect(() => {
    const reload = () => void loadBot().then(setSavedBot);
    reload();
    return navigation.addListener("focus", reload);
  }, [navigation]);

  const creation = useCharacterCreation({
    transport: mobileTransport,
    onCreated: (bot) => {
      navigation.navigate("Chat", { bot });
      void saveBot(bot).then(() => persistBotIfSignedIn(bot));
    },
    userNameCtx,
    log: () => {},
  });

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

  // The carousel is the one flexible element: it shrinks so the whole screen fits
  // without scrolling on short Android displays. viewportH keeps the tallest height
  // seen, so the Android keyboard doesn't also shrink the carousel.
  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [carouselH, setCarouselH] = useState(0);
  const carouselSize =
    viewportH && contentH
      ? Math.max(
          CAROUSEL_MIN_SIZE,
          Math.min(CAROUSEL_MAX_SIZE, viewportH - (contentH - carouselH) - CAROUSEL_CHROME),
        )
      : CAROUSEL_MAX_SIZE;

  const busy = creation.loading || creation.validating;
  const busyMessage = creation.validating ? "Validating character" : creation.loadingMessage;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setViewportH((prev) => Math.max(prev, h));
        }}
        onContentSizeChange={(_w, h) => setContentH(h)}
      >
        <Wordmark text={BRAND.name} />
        <Text style={styles.kicker}>{BRAND.kicker}</Text>

        {savedBot && !busy ? (
          <Pressable
            style={styles.resumeCard}
            onPress={() => navigation.navigate("Chat", { bot: savedBot })}
            android_ripple={{ color: colors.secondaryContainer }}
          >
            <Avatar name={savedBot.name} avatarUrl={savedBot.avatarUrl} size={36} />
            <View style={styles.resumeTextWrap}>
              <Text style={styles.resumeLabel}>Continue chatting with</Text>
              <Text style={styles.resumeName}>{displayCharacterName(savedBot.name)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        <View onLayout={(e) => setCarouselH(e.nativeEvent.layout.height)}>
          <CharacterCarousel
            onSelect={(name) => creation.createNamed(name)}
            disabled={busy}
            size={carouselSize}
          />
        </View>

        <Text style={styles.headline}>{BRAND.headline}</Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sherlock Holmes"
            placeholderTextColor={colors.textSecondary}
            value={creation.input}
            onChangeText={creation.setInput}
            editable={!busy && !creation.randomizing}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void creation.handleCreate()}
          />
          <Pressable
            onPress={() => void creation.handleRandomCharacter()}
            disabled={busy || creation.randomizing}
            accessibilityLabel="Random character"
            android_ripple={{ color: colors.secondaryContainer, borderless: true, radius: 24 }}
            style={styles.diceButton}
            hitSlop={8}
          >
            {creation.randomizing ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <Ionicons name="shuffle-outline" size={20} color={colors.secondary} />
            )}
          </Pressable>
        </View>

        {creation.error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{creation.error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void creation.handleCreate()}
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
              <Text style={styles.createButtonText}>{busyMessage}</Text>
            </View>
          ) : (
            <Text style={styles.createButtonText}>Create</Text>
          )}
        </Pressable>

        {busy ? (
          <Pressable
            onPress={creation.handleCancel}
            style={styles.cancelButton}
            android_ripple={{ color: colors.outline, borderless: true }}
            hitSlop={8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}

        <View style={styles.links}>
          <Pressable
            onPress={() => navigation.navigate("CharWall")}
            style={styles.link}
            android_ripple={{ color: colors.secondaryContainer, borderless: true }}
          >
            <Ionicons name="grid-outline" size={16} color={colors.secondary} />
            <Text style={styles.linkText}>Character Wall</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("Game")}
            style={styles.link}
            android_ripple={{ color: colors.secondaryContainer, borderless: true }}
          >
            <Ionicons name="help-circle-outline" size={16} color={colors.secondary} />
            <Text style={styles.linkText}>{GAME_CTA_LABEL}</Text>
          </Pressable>
          {auth.status === "signedIn" ? (
            <Pressable
              onPress={() => navigation.navigate("History")}
              style={styles.link}
              android_ripple={{ color: colors.secondaryContainer, borderless: true }}
            >
              <Ionicons name="time-outline" size={16} color={colors.secondary} />
              <Text style={styles.linkText}>Past chats</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {creation.validationResult ? (
        <CopyrightWarningModal
          visible={creation.showValidationModal}
          validation={creation.validationResult}
          onContinue={creation.handleValidationContinue}
          onCancel={creation.handleValidationCancel}
          onSelectSuggestion={creation.handleValidationSuggestion}
        />
      ) : null}
      <CharacterDescriptionModal
        visible={creation.showDescriptionModal}
        characterName={sanitizeCharacterName(creation.input)}
        onSubmit={creation.handleDescriptionSubmit}
        onCancel={creation.handleDescriptionCancel}
      />
      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        userNameCtx={userNameCtx}
        onOpenHistory={() => {
          setShowAccountModal(false);
          navigation.navigate("History");
        }}
      />
      <NameCaptureModal
        visible={creation.showNameGateModal}
        mode="gate"
        currentName=""
        onSave={creation.handleNameGateSave}
        onSkip={creation.handleNameGateSkip}
        onClose={creation.handleNameGateSkip}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 24, paddingTop: 20, alignItems: "center" },
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
    links: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      columnGap: 16,
      marginTop: 12,
    },
    link: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8 },
    linkText: { color: colors.secondary, fontSize: 14, fontWeight: "600" },
  });
}
