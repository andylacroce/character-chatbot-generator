"use client";

import React, { useState } from "react";
import { REPORT_COPY } from "character-chatbot-shared";
import ReportDialog from "../../components/common/ReportDialog";
import styles from "../../components/styles/CharacterPage.module.css";

/** Client island for the server-rendered character page: opens the report dialog for this character. */
export default function ReportCharacterButton({ characterName }: { characterName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.report} onClick={() => setOpen(true)}>
        {REPORT_COPY.trigger}
      </button>
      <ReportDialog
        show={open}
        onClose={() => setOpen(false)}
        target={{ targetType: "character", characterName }}
      />
    </>
  );
}
