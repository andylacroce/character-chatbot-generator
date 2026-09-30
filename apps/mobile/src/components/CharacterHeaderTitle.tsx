import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { displayCharacterName, type ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";
import Avatar from "./Avatar";

type Props = {
  name: string;
  avatarUrl: string;
  /** Optional second line, e.g. the guessing game's streak. */
  subtitle?: string;
  /** Opens the portrait lightbox. */
  onPress: () => void;
};

/** Tappable avatar + name for a chat screen's header, shared by ChatScreen and GameScreen. */
export default function CharacterHeaderTitle({ name, avatarUrl, subtitle, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      android_ripple={{ color: colors.secondaryContainer, borderless: true }}
    >
      <Avatar name={displayCharacterName(name)} avatarUrl={avatarUrl} size={48} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {displayCharacterName(name)}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // flexShrink lets a long name (e.g. a curated "(Charles Dickens novel)" suffix)
    // ellipsize instead of running under the header's right-hand icons.
    row: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
    text: { flexShrink: 1 },
    name: { fontSize: 17, fontWeight: "600", color: colors.text },
    subtitle: { fontSize: 12, color: colors.textSecondary },
  });
}
