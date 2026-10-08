import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FitnessShortcutSetup } from "@/components/fitness-shortcut-setup";
import { SecurityPanel } from "@/components/security-panel";

const token = process.env.FITNESS_INGEST_TOKEN ?? "";
const session = {
  label: "Safari on iOS",
  lastSeen: "Oct 8, 5:00 PM",
  created: "Oct 8, 4:00 PM",
  current: true,
};

const html = renderToStaticMarkup(
  createElement(SecurityPanel, {
    sessions: [session],
    passkeys: [],
    passkeysConfigured: false,
    fitnessTokenConfigured: Boolean(token.trim()),
    shortcut: createElement(FitnessShortcutSetup),
  }),
);
const bare = renderToStaticMarkup(
  createElement(SecurityPanel, {
    sessions: [],
    passkeys: [],
    passkeysConfigured: false,
    fitnessTokenConfigured: false,
    shortcut: createElement(FitnessShortcutSetup),
  }),
);

process.stdout.write(JSON.stringify({ html, bare }));
