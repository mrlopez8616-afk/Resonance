import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PARENTS } from "@/data/node-parents";
import { SYSTEM_NODES } from "@/data/system-map";
import { privateHomeNodeCount, publicHomeNodeCount } from "@/lib/home-faces";
import {
  SHELVED_NODES,
  navHrefShelved,
  nodeShelved,
  visibleById,
  visibleNavHrefs,
} from "@/lib/node-visibility";
import { phoneTabHidden } from "@/lib/phone-nav";
import { PUBLIC_BOOK } from "@/lib/public-mode";
import { buildLiveGraph } from "@/lib/system-live";

describe("shelved nodes", () => {
  it("hides fitness and puts it back when the list is empty", () => {
    assert.deepEqual([...SHELVED_NODES], ["fitness"]);
    assert.equal(nodeShelved("fitness"), true);
    assert.equal(nodeShelved("crypto"), false);
    assert.equal(nodeShelved("fitness", []), false);

    assert.equal(privateHomeNodeCount({ owner: true, health: true }), 12);
    assert.equal(privateHomeNodeCount({ owner: true, health: true, shelved: [] }), 13);
    assert.equal(publicHomeNodeCount({ fight: true, health: true }), 10);
    assert.equal(publicHomeNodeCount({ fight: true, health: true, shelved: [] }), 11);

    assert.equal(navHrefShelved("/n/fitness"), true);
    assert.equal(navHrefShelved("/n/fitness/steps"), true);
    assert.equal(navHrefShelved("/n/fitness?steps=w"), true);
    assert.equal(navHrefShelved("/n/build"), false);
    assert.equal(navHrefShelved("/n/build/fitness"), false);
    assert.equal(navHrefShelved("/"), false);
    assert.equal(navHrefShelved("/n/fitness", []), false);
    assert.deepEqual(
      visibleNavHrefs([{ href: "/n/fitness" }, { href: "/" }, { href: "/n/build" }]).map((item) => item.href),
      ["/", "/n/build"],
    );
    assert.deepEqual(
      visibleNavHrefs([{ href: "/n/fitness" }, { href: "/" }], []).map((item) => item.href),
      ["/n/fitness", "/"],
    );
    assert.equal(phoneTabHidden("/n/fitness", false), true);
    assert.equal(phoneTabHidden("/n/fitness/runs", false), true);
    assert.equal(phoneTabHidden("/n/fitness", false, []), false);
    assert.equal(phoneTabHidden("/n/build", false), false);
    assert.equal(phoneTabHidden("/", false), false);

    assert.equal(PARENTS.some((parent) => parent.id === "fitness"), true);
    assert.equal(SYSTEM_NODES.some((node) => node.id === "fitness" && node.href === "/n/fitness"), true);
    assert.equal(visibleById(SYSTEM_NODES).some((node) => node.id === "fitness"), false);
    assert.equal(visibleById(SYSTEM_NODES, []).some((node) => node.href === "/n/fitness"), true);

    const hidden = buildLiveGraph();
    assert.equal(hidden.points.some((point) => point.id === "node:fitness" || point.href === "/n/fitness"), false);
    assert.equal(
      hidden.edges.some((edge) => edge.from.includes("fitness") || edge.to.includes("fitness")),
      false,
    );
    const restored = buildLiveGraph([]);
    assert.equal(restored.points.find((point) => point.id === "node:fitness")?.href, "/n/fitness");
    assert.equal(restored.points.filter((point) => point.kind === "node").length, 9);
    assert.equal(restored.edges.some((edge) => edge.to === "node:fitness"), true);

    assert.equal(
      PUBLIC_BOOK.some((row) => row.id === "fitness" || row.parent === "fitness"),
      false,
    );
  });
});