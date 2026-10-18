"use client";

import React from "react";
import Link from "next/link";
import BackHomeLink from "./BackHomeLink";
import { useGoBack } from "./useGoBack";
import styles from "./styles/LegalPage.module.css";

/** Header "Back" pill for pages reachable from several places; see `useGoBack`. */
export const BackLink: React.FC = () => (
  <BackHomeLink label="Back" icon="back" onClick={useGoBack()} />
);

/** The text "Back" link at the top of the legal pages; see `useGoBack`. */
export const LegalBackLink: React.FC = () => (
  <Link href="/" className={styles.back} onClick={useGoBack()}>
    &larr; Back
  </Link>
);
