import styles from "./components/styles/NotFound.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <h1>404 - Page Not Found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist.</p>
    </div>
  );
}