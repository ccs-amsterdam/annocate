import Menu from "@/components/Menu/Menu";
import styles from "./layout.module.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Menu />
        {children}
      </div>
    </div>
  );
}
