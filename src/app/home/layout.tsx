import Menu from "@/components/Menu/Menu";
import styles from "./layout.module.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Menu />
      </div>
      <div className={styles.body}>{children}</div>
      <div className={styles.footer}></div>
    </div>
  );
}
