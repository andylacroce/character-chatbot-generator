import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CharacterEntry, ThemeColors } from "character-chatbot-shared";
import { getChars, resolveApiUrl } from "../api";
import { createBot } from "../botCreation";
import { saveBot } from "../storage";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import PortraitLightbox from "../components/PortraitLightbox";

type Props = NativeStackScreenProps<RootStackParamList, "CharWall">;

const PAGE_SIZE = 30;
const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/** Public gallery of every generated character portrait — mirrors CharsGallery.tsx. */
export default function CharWallScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [characters, setCharacters] = useState<CharacterEntry[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<CharacterEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const data = await getChars(PAGE_SIZE, offsetRef.current);
      setCharacters((prev) => [...prev, ...data.characters]);
      offsetRef.current += data.characters.length;
      setHasMore(data.hasMore);
    } catch {
      setError(true);
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
      setInitialLoad(false);
    }
  }, [hasMore]);

  useEffect(() => {
    loadMore();
    // Intentionally once on mount — loadMore's own hasMore guard handles the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChatWith = async () => {
    if (!selected) return;
    setCreating(true);
    setCreateError("");
    try {
      const bot = await createBot(
        selected.name,
        () => {},
        () => false,
      );
      if (!bot) return;
      await saveBot(bot);
      setSelected(null);
      // navigate, not replace: keeps the wall in the stack so Chat's back button
      // returns here instead of leaving the user with no way out of the chat.
      navigation.navigate("Chat", { bot });
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to start chatting with this character.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <PortraitLightbox
        visible={!!selected}
        name={selected?.name ?? ""}
        avatarUrl={selected?.avatarUrl}
        onClose={() => (creating ? null : setSelected(null))}
        action={{
          label: creating ? "Loading…" : `Chat with ${selected?.name ?? ""}`,
          onPress: handleChatWith,
        }}
      />
      {createError ? <Text style={styles.error}>{createError}</Text> : null}

      {error && characters.length === 0 && (
        <Text style={styles.state}>Couldn't load the gallery right now — try again in a bit.</Text>
      )}
      {!error && initialLoad && (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      {!initialLoad && characters.length === 0 && !error && (
        <Text style={styles.state}>No characters yet — go create the first one!</Text>
      )}

      {characters.length > 0 && (
        <FlatList
          data={characters}
          numColumns={3}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          contentContainerStyle={styles.grid}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <Pressable
              style={styles.tile}
              onPress={() => setSelected(item)}
              android_ripple={{ color: colors.secondaryContainer }}
            >
              {item.avatarUrl.endsWith(".svg") ? (
                <View style={[styles.tileImage, styles.tileFallback]}>
                  <Text style={[styles.tileFallbackInitial, { color: colors.secondary }]}>
                    {item.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              ) : (
                <Image
                  source={{ uri: resolveApiUrl(item.avatarUrl) }}
                  style={styles.tileImage}
                  contentFit="cover"
                />
              )}
              <Text style={styles.tileCaption} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
        />
      )}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    state: { textAlign: "center", color: colors.textSecondary, marginTop: 40 },
    error: { color: colors.error, textAlign: "center", padding: 12 },
    grid: { padding: 8 },
    tile: { flex: 1 / 3, padding: 6, alignItems: "center" },
    tileImage: { width: "100%", aspectRatio: 1, borderRadius: 10 },
    tileFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.secondaryContainer,
    },
    tileFallbackInitial: { fontSize: 32, fontWeight: "600", fontFamily: serif },
    tileCaption: { marginTop: 4, fontSize: 12, color: colors.text, textAlign: "center" },
    footer: { marginVertical: 16 },
  });
}
