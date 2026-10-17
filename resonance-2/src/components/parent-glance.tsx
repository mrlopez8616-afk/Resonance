import Link from "next/link";
import { AiChangeVisual } from "@/components/home-visual";
import type { ChangeBar } from "@/lib/home-lines";

/** Day-change bars and the next catalyst, moved off the home tile onto the parent page. */
export function ParentGlance({
  bars,
  catalyst,
  catalystHref,
}: {
  bars: readonly ChangeBar[] | null;
  catalyst: string | null;
  catalystHref?: string;
}) {
  if ((!bars || bars.length === 0) && !catalyst) return null;
  return (
    <div className="parent-glance">
      {catalyst ? (
        <p className="parent-retiring">
          {catalystHref ? (
            <Link href={catalystHref} className="parent-line-link">
              {catalyst}
            </Link>
          ) : (
            catalyst
          )}
        </p>
      ) : null}
      {bars && bars.length > 0 ? <AiChangeVisual bars={bars} /> : null}
    </div>
  );
}
