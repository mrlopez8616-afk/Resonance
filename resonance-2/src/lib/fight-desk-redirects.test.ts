import assert from "node:assert/strict";
import { describe, it } from "node:test";
import nextConfig from "../../next.config";
import { FIGHT_DESK_REDIRECTS } from "@/lib/fight-desk-redirects";
import { legacyParentHref } from "@/lib/node-parents";

describe("Fight Desk redirects", () => {
  it("permanently redirects /n/predictions and its subpaths", async () => {
    assert.equal(legacyParentHref("predictions"), "/n/fight-desk");
    assert.equal(legacyParentHref("predictions", "bankroll"), "/n/fight-desk/bankroll");
    const redirects = await nextConfig.redirects?.();
    assert.ok(redirects);
    for (const redirect of FIGHT_DESK_REDIRECTS) {
      assert.equal(redirect.permanent, true);
      assert.ok(
        redirects?.some(
          (row) =>
            row.source === redirect.source &&
            row.destination === redirect.destination &&
            row.permanent === true,
        ),
        redirect.source,
      );
    }
    assert.equal(FIGHT_DESK_REDIRECTS[0]?.destination, "/n/fight-desk");
    assert.equal(FIGHT_DESK_REDIRECTS[1]?.source, "/n/predictions/:path*");
    assert.equal(FIGHT_DESK_REDIRECTS[1]?.destination, "/n/fight-desk/:path*");
  });
});
