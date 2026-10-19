import Link from "next/link";
import { personSlug } from "@/lib/ufc332";

/** Career page for a fighter name. The slug is the name, not a guessed record. */
export function FighterLink({ name }: { name: string }) {
  const slug = personSlug(name);
  if (!slug) return name;
  return (
    <Link href={`/fights/fighters/${slug}`} className="fighter-link">
      {name}
    </Link>
  );
}
