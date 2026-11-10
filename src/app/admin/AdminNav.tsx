"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../components/styles/AdminNav.module.css";

const SECTIONS = [
  { href: "/admin", label: "Stats" },
  { href: "/admin/moderation", label: "Moderation" },
];

/** Stats / Moderation switcher shown at the top of both admin pages. */
export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Admin sections">
      {SECTIONS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={styles.link}
          aria-current={pathname === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
