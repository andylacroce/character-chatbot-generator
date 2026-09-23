import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { GAME_INSTRUCTIONS, type ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";
import ModalCard from "./ModalCard";
import Button from "./Button";

type Props = { visible: boolean; onClose: () => void };

/** "How to play" for the guessing game — the same shared copy as the web app's modal. */
export default function GameInstructionsModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ModalCard visible={visible} onClose={onClose} title={GAME_INSTRUCTIONS.title}>
      {GAME_INSTRUCTIONS.paragraphs.map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>
          {paragraph}
        </Text>
      ))}
      <Button label={GAME_INSTRUCTIONS.closeLabel} onPress={onClose} />
    </ModalCard>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    paragraph: { color: colors.text, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  });
}
