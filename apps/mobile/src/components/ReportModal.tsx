import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  REPORT_COPY,
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  useReportForm,
  type ReportRequest,
  type ThemeColors,
} from "character-chatbot-shared";
import { submitReport } from "../api";
import { useTheme } from "../ThemeContext";
import Button from "./Button";
import ModalCard from "./ModalCard";

/** What is being reported: the request minus the user's reason and details. */
export type ReportTarget = Pick<ReportRequest, "targetType" | "characterName" | "messageText">;

type Props = {
  /** The thing being reported; the modal is visible while this is set. */
  target: ReportTarget | null;
  onClose: () => void;
};

/** "Report a problem" form for a character or one of its replies; web's ReportDialog counterpart. */
export default function ReportModal({ target, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { reason, setReason, details, setDetails, status, send, reset } =
    useReportForm(submitReport);

  // A fresh form each time the modal opens, not the last report's leftovers.
  useEffect(() => {
    if (target) reset();
  }, [target, reset]);

  return (
    <ModalCard visible={!!target} onClose={onClose} title={REPORT_COPY.title}>
      {status === "sent" ? (
        <>
          <Text style={styles.text}>{REPORT_COPY.success}</Text>
          <View style={styles.actions}>
            <Button label="Close" onPress={onClose} />
          </View>
        </>
      ) : (
        <>
          {REPORT_REASONS.map(({ value, label }) => (
            <Pressable
              key={value}
              onPress={() => setReason(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === value }}
              style={styles.reason}
            >
              <View style={[styles.radio, reason === value && styles.radioOn]} />
              <Text style={styles.text}>{label}</Text>
            </Pressable>
          ))}
          <Text style={styles.label}>{REPORT_COPY.detailsLabel}</Text>
          <TextInput
            style={styles.input}
            value={details}
            onChangeText={setDetails}
            maxLength={REPORT_DETAILS_MAX}
            multiline
            accessibilityLabel={REPORT_COPY.detailsLabel}
          />
          {status === "error" ? <Text style={styles.error}>{REPORT_COPY.error}</Text> : null}
          <View style={styles.actions}>
            <Button label={REPORT_COPY.cancel} variant="secondary" onPress={onClose} />
            <Button
              label={status === "sending" ? REPORT_COPY.sending : REPORT_COPY.submit}
              disabled={!reason || status === "sending"}
              onPress={() => target && void send(target)}
            />
          </View>
        </>
      )}
    </ModalCard>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    text: { color: colors.text, fontSize: 15 },
    label: { color: colors.textSecondary, fontSize: 14, marginTop: 12, marginBottom: 6 },
    reason: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.outline,
    },
    radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    input: {
      minHeight: 72,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: 8,
      color: colors.text,
      textAlignVertical: "top",
    },
    error: { color: colors.error, marginTop: 8, fontSize: 14 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  });
}
