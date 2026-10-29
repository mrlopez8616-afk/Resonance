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
  it("keeps fitness on the floor and hides it only when listed", () => {
    assert.deepEqual([...SHELVED_NODES], []);
    assert.equal(nodeShelved("fitness"), false);
    assert.equal(nodeShelved("crypto"), false);
    assert.equal(nodeShelved("fitness", ["fitness"]), true);

    assert.equal(privateHomeNodeCount({ owner: true, health: true }), 13);
    assert.equal(privateHomeNodeCount({ owner: true, health: true, shelved: ["fitness"] }), 12);
    assert.equal(publicHomeNodeCount({ fight: true, health: true }), 14);
    assert.equal(publicHomeNodeCount({ fight: true, health: true, shelved: ["fitness"] }), 13);

    assert.equal(navHrefShelved("/n/fitness"), false);
    assert.equal(navHrefShelved("/n/fitness/steps"), false);
    assert.equal(navHrefShelved("/n/fitness?steps=w"), false);
    assert.equal(navHrefShelved("/n/fitness", ["fitness"]), true);
    assert.equal(navHrefShelved("/n/fitness/steps", ["fitness"]), true);
    assert.equal(navHrefShelved("/n/build"), false);
    assert.equal(navHrefShelved("/n/build/fitness"), false);
    assert.equal(navHrefShelved("/"), false);
    assert.deepEqual(
      visibleNavHrefs([{ href: "/n/fitness" }, { href: "/" }, { href: "/n/build" }]).map((item) => item.href),
      ["/n/fitness", "/", "/n/build"],
    );
    assert.deepEqual(
      visibleNavHrefs([{ href: "/n/fitness" }, { href: "/" }], ["fitness"]).map((item) => item.href),
      ["/"],
    );
    assert.equal(phoneTabHidden("/n/fitness", false), false);
    assert.equal(phoneTabHidden("/n/fitness/runs", false), false);
    assert.equal(phoneTabHidden("/n/fitness", false, ["fitness"]), true);
    assert.equal(phoneTabHidden("/n/build", false), false);
    assert.equal(phoneTabHidden("/", false), false);

    assert.equal(PARENTS.some((parent) => parent.id === "fitness"), true);
    assert.equal(SYSTEM_NODES.some((node) => node.id === "fitness" && node.href === "/n/fitness"), true);
    assert.equal(
      SYSTEM_NODES.some(
        (node) => node.id === "fitness" && node.children.some((child) => child.href === "/n/fitness/steps"),
      ),
      true,
    );
    assert.equal(visibleById(SYSTEM_NODES).some((node) => node.id === "fitness"), true);
    assert.equal(visibleById(SYSTEM_NODES, ["fitness"]).some((node) => node.href === "/n/fitness"), false);

    const shown = buildLiveGraph();
    assert.equal(shown.points.find((point) => point.id === "node:fitness")?.href, "/n/fitness");
    assert.equal(shown.points.filter((point) => point.kind === "node").length, 9);
    assert.equal(shown.edges.some((edge) => edge.to === "node:fitness"), true);
    const hidden = buildLiveGraph(["fitness"]);
    assert.equal(hidden.points.some((point) => point.id === "node:fitness" || point.href === "/n/fitness"), false);
    assert.equal(
      hidden.edges.some((edge) => edge.from.includes("fitness") || edge.to.includes("fitness")),
      false,
    );

    const book = PUBLIC_BOOK.map((row) => `${row.parent}:${row.id}`).join(",");
    assert.equal(book.includes("fitness"), false);
  });
});