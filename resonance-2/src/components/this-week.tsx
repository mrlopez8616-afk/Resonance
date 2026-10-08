import Link from "next/link";
import type { ThisWeekItem } from "@/lib/this-week";

/** Thin upcoming strip. Renders nothing when the next seven days are empty. */
export function ThisWeek({ items }: { items: readonly ThisWeekItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="this-week" aria-label="This week">
      <h2>This Week</h2>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <Link href={item.href} title={item.title}>
              <span className="this-week-when">{item.when}</span>
              <span className="this-week-title">{item.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
