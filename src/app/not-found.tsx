import Link from "next/link";
import styles from "./components/styles/NotFound.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <p className={styles.kicker}>Lost the thread</p>
      <h1 className={styles.headline}>404</h1>
      <p className={styles.subhead}>This page doesn&apos;t exist. Maybe it wandered off-script.</p>
      <Link href="/" className={styles.homeCta}>
        Back to Portrayal
      </Link>
    </div>
  );
}
