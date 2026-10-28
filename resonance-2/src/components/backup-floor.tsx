import styles from "@/components/backup-floor.module.css";

export function BackupFloor({ lines }: { lines: readonly { label: string; value: string }[] }) {
  return (
    <section className={styles.floor} aria-label="Backup">
      <h2 className={styles.heading}>Backup</h2>
      <dl className={styles.rows}>
        {lines.map((line) => (
          <div className={styles.row} key={line.label}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
