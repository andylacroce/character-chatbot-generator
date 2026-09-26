import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  CHARACTER_CATEGORIES,
  displayCharacterName,
  generateCharacter,
  getCharacterCategoryLabel,
  isCharacterCategory,
  type CharacterCategory,
  type CharacterEntry,
  type CharsGroup,
  type CharsSort,
  type ThemeColors,
} from "character-chatbot-shared";
import { getChars, resolveApiUrl } from "../api";
import { mobileTransport, persistBotIfSignedIn } from "../botCreation";
import { saveBot } from "../storage";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../ThemeContext";
import PortraitLightbox from "../components/PortraitLightbox";

type Props = NativeStackScreenProps<RootStackParamList, "CharWall">;

const PAGE_SIZE = 30;
const COLUMNS = 3;
const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const SORT_OPTIONS: { value: CharsSort; label: string }[] = [
  { value: "newest", label: "Recent" },
  { value: "oldest", label: "Oldest" },
  { value: "name-asc", label: "A–Z" },
  { value: "name-desc", label: "Z–A" },
];

type Row = CharacterEntry[];
type Section = { key: string; label: string; count: number; data: Row[] };

/** Splits a flat list into fixed-size rows, for a grid rendered inside a SectionList. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Public gallery of every generated character portrait — mirrors CharsGallery.tsx, including
 * its sort-by and group-by-category controls (grouped sections start collapsed, same as web).
 */
export default function CharWallScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [characters, setCharacters] = useState<CharacterEntry[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<CharacterEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [sortBy, setSortBy] = useState<CharsSort>("newest");
  const [groupBy, setGroupBy] = useState<CharsGroup>("none");
  const [expandedGroups, setExpandedGroups] = useState<Set<CharacterCategory>>(() => new Set());
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  // A ref, not state: loadMore's identity must stay stable regardless of hasMore so the
  // reset effect below and onEndReached always call the latest version, not a stale closure.
  const hasMoreRef = useRef(true);
  const queryVersionRef = useRef(0);

  // Takes sort/group as explicit params rather than closing over sortBy/groupBy state: a
  // control change needs to fetch with the *new* value immediately, before React has
  // re-rendered with it, and reading state directly in an effect keyed on that same state
  // would mean calling setState synchronously inside an effect body (flagged by
  // react-hooks/set-state-in-effect) — see resetAndLoad below, which is called straight
  // from each control's own onPress instead.
  const loadMore = useCallback(async (reset: boolean, sort: CharsSort, group: CharsGroup) => {
    if (loadingRef.current || (!reset && !hasMoreRef.current)) return;
    const queryVersion = queryVersionRef.current;
    const offset = reset ? 0 : offsetRef.current;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const data = await getChars(PAGE_SIZE, offset, sort, group);
      if (queryVersion !== queryVersionRef.current) return;
      const page = data.characters.map((entry) => ({
        ...entry,
        category: isCharacterCategory(entry.category) ? entry.category : "other",
      }));
      setCharacters((prev) => (reset ? page : [...prev, ...page]));
      offsetRef.current = offset + page.length;
      hasMoreRef.current = data.hasMore;
    } catch {
      if (queryVersion !== queryVersionRef.current) return;
      setError(true);
      hasMoreRef.current = false;
    } finally {
      if (queryVersion !== queryVersionRef.current) return;
      loadingRef.current = false;
      setLoadingMore(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    void loadMore(true, sortBy, groupBy);
    // Intentionally once on mount — resetAndLoad below handles every later sort/group change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetches from the start for a sort/group change. Called directly from the control's
  // own onPress (an event handler, not an effect), so the fetch uses the new value right
  // away rather than waiting for a re-render. A version counter discards any still-in-flight
  // response from the control state that was just replaced.
  const resetAndLoad = (nextSort: CharsSort, nextGroup: CharsGroup) => {
    queryVersionRef.current += 1;
    loadingRef.current = false;
    hasMoreRef.current = true;
    offsetRef.current = 0;
    setCharacters([]);
    setError(false);
    setInitialLoad(true);
    setSortBy(nextSort);
    setGroupBy(nextGroup);
    setExpandedGroups(new Set());
    void loadMore(true, nextSort, nextGroup);
  };

  const handleChatWith = async () => {
    if (!selected) return;
    setCreating(true);
    setCreateError("");
    try {
      const bot = await generateCharacter(mobileTransport, selected.name, {
        onProgress: () => {},
        setLoadingMessage: () => {},
        cancelToken: null,
      });
      await saveBot(bot);
      persistBotIfSignedIn(bot);
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

  const toggleGroup = (category: CharacterCategory) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const sections: Section[] = useMemo(() => {
    if (groupBy === "none") {
      return [
        { key: "all", label: "", count: characters.length, data: chunk(characters, COLUMNS) },
      ];
    }
    return CHARACTER_CATEGORIES.map(({ value, label }) => {
      const entries = characters.filter((entry) => entry.category === value);
      return {
        key: value,
        label,
        count: entries.length,
        // Collapsed sections render only their header (data: []) — only the ones
        // with any entries at all are shown, same as web's gallery groups.
        data: expandedGroups.has(value) ? chunk(entries, COLUMNS) : [],
      };
    }).filter((section) => section.count > 0);
  }, [characters, groupBy, expandedGroups]);

  return (
    <View style={styles.container}>
      <PortraitLightbox
        visible={!!selected}
        name={selected?.name ?? ""}
        avatarUrl={selected?.avatarUrl}
        onClose={() => (creating ? null : setSelected(null))}
        action={{
          label: creating ? "Loading…" : `Chat with ${displayCharacterName(selected?.name ?? "")}`,
          onPress: handleChatWith,
        }}
      />
      {createError ? <Text style={styles.error}>{createError}</Text> : null}

      <View style={styles.controls}>
        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((option) => {
            const active = option.value === sortBy;
            return (
              <Pressable
                key={option.value}
                onPress={() => resetAndLoad(option.value, groupBy)}
                style={[styles.sortChip, active && styles.sortChipActive]}
                android_ripple={{ color: colors.secondaryContainer }}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.groupToggleRow}>
          <Pressable
            onPress={() => resetAndLoad(sortBy, groupBy === "category" ? "none" : "category")}
          >
            <Text style={styles.groupToggleLabel}>Group by category</Text>
          </Pressable>
          <Switch
            value={groupBy === "category"}
            onValueChange={(value) => resetAndLoad(sortBy, value ? "category" : "none")}
            trackColor={{ true: colors.primary, false: colors.outline }}
          />
        </View>
      </View>

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
        <SectionList
          sections={sections}
          keyExtractor={(row, index) => `${row[0]?.name ?? "row"}-${index}`}
          contentContainerStyle={styles.grid}
          onEndReached={() => loadMore(false, sortBy, groupBy)}
          onEndReachedThreshold={0.5}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) =>
            section.label ? (
              <Pressable
                style={styles.groupHeading}
                onPress={() => toggleGroup(section.key as CharacterCategory)}
                android_ripple={{ color: colors.secondaryContainer }}
              >
                <Text style={styles.groupHeadingText}>
                  {getCharacterCategoryLabel(section.key)}
                </Text>
                <Text style={styles.groupChevron}>
                  {expandedGroups.has(section.key as CharacterCategory) ? "︿" : "﹀"}
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item: row }) => (
            <View style={styles.row}>
              {row.map((item) => (
                <Pressable
                  key={item.name}
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
                    {displayCharacterName(item.name)}
                  </Text>
                </Pressable>
              ))}
              {/* Pad a short trailing row so its tiles keep the grid's column width. */}
              {row.length < COLUMNS &&
                Array.from({ length: COLUMNS - row.length }).map((_, i) => (
                  <View key={`pad-${i}`} style={styles.tile} />
                ))}
            </View>
          )}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footer} color={colors.primary} />
            ) : undefined
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
    controls: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 4,
      gap: 8,
    },
    sortRow: { flexDirection: "row", gap: 8 },
    sortChip: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outline,
      alignItems: "center",
    },
    sortChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    sortChipText: { fontSize: 12, fontWeight: "600", color: colors.text },
    sortChipTextActive: { color: colors.onPrimary },
    groupToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    groupToggleLabel: { color: colors.text, fontSize: 13, fontWeight: "500" },
    groupHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 6,
      backgroundColor: colors.surface,
      borderRadius: 10,
      marginHorizontal: 8,
    },
    groupHeadingText: { color: colors.text, fontSize: 14, fontWeight: "700", fontFamily: serif },
    groupChevron: { color: colors.textSecondary, fontSize: 14 },
    grid: { padding: 8 },
    row: { flexDirection: "row" },
    tile: { flex: 1 / COLUMNS, padding: 6, alignItems: "center" },
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
