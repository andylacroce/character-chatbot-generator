import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "character-chatbot-shared";
import { useTheme } from "../ThemeContext";
import ModalCard from "./ModalCard";
import Button from "./Button";

/** The short, scannable instructions shape both games' copy constants share. */
interface GameInstructionsCopy {
  title: string;
  premise: string;
  bullets: readonly string[];
  goal: string;
  closeLabel: string;
}

type Props = { visible: boolean; onClose: () => void; copy: GameInstructionsCopy };

/** Generic "How to play" modal shared by both guessing games — same shared copy shape as web. */
export default function GameInstructionsModal({ visible, onClose, copy }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ModalCard visible={visible} onClose={onClose} title={copy.title}>
      <Text style={styles.paragraph}>{copy.premise}</Text>
      <View style={styles.bulletList}>
        {copy.bullets.map((bullet) => (
          <Text key={bullet} style={styles.bullet}>
            {"• "}
            {bullet}
          </Text>
        ))}
      </View>
      <Text style={styles.paragraph}>{copy.goal}</Text>
      <Button label={copy.closeLabel} onPress={onClose} />
    </ModalCard>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    paragraph: { color: colors.text, fontSize: 14, lineHeight: 21, marginBottom: 12 },
    bulletList: { marginBottom: 12 },
    bullet: { color: colors.text, fontSize: 14, lineHeight: 21 },
  });
}
