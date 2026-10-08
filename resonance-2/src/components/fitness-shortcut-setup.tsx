import { Fragment, type ReactNode } from "react";

const INGEST_URL = "https://resonance3.vercel.app/api/fitness/ingest";

export const NIGHTLY_STEPS = [
  "Open the **Shortcuts** app.",
  "Tap **+** (top right) to make a new shortcut.",
  "Tap the shortcut name at the top and rename it **Resonance Nightly**.",
  "Tap **Add Action**, search **Find Health Samples**, and tap it.",
  "Tap the sample type and choose **Steps**.",
  "Tap **Add Filter**. Tap **Start Date**. Tap **is in the last**. Set the number to **2** and the unit to **days**.",
  "Tap the action, then **Set Variable**, and name it **Step Samples**.",
  "Tap **Add Action**, search **Get Details of Health Samples**, and tap it. (If you only see **Get Details of Health Sample**, use that.)",
  "Tap the detail and choose **Value**. Make sure the samples it reads are **Step Samples** (the same variable from step 7, not a new Find).",
  "Tap **Set Variable** and name it **Step Values**.",
  "Add another **Get Details of Health Samples**. Choose **Start Date**. Point it at **Step Samples** again (the samples, not Step Values).",
  "Tap **Set Variable** and name it **Step Starts**.",
  "Do not add Format Date, Sort, or Filter between Value and Start Date. The two lists must stay in the same order.",
  "Repeat steps 4–13 for **Walking + Running Distance**. Name the variables **Distance Samples**, **Distance Values**, and **Distance Starts**.",
  "Repeat steps 4–13 for **Active Energy**. Name the variables **Energy Samples**, **Energy Values**, and **Energy Starts**.",
  "Tap **Add Action**, search **Dictionary**, and tap it. Add these keys:",
  "Tap **Set Variable** and name it **Steps Metric**.",
  "Add a second Dictionary:",
  "Add a third Dictionary:",
  "Tap **Add Action**, search **List**, and tap it. Add **Steps Metric**, **Distance Metric**, and **Energy Metric** as the three items. Tap **Set Variable** and name it **Metrics**.",
  "Add one more Dictionary:",
  "Tap **Add Action**, search **Get Contents of URL**, and tap it.",
  `Set the URL to \`${INGEST_URL}\`.`,
  "Tap **Show More**.",
  "Set **Method** to **POST**.",
  "Under Headers, tap **Add new header**. Key: `X-Fitness-Token`. Value: paste the token you copied above.",
  "Set **Request Body** to **JSON**.",
  "Add a field named `source`. Type Text. Value `shortcuts`.",
  "Add a field named `metrics`. Tap the type (it starts as Text) and change it to **Array**. Insert the **Metrics** variable. If Shortcuts wraps that list inside one extra list, the server still accepts it.",
  "Tap **Done**.",
] as const;

const STEPS_KEYS = [
  ["Key `metric`, type Text, value `steps`", "Key `values`, tap the value and insert the **Step Values** variable", "Key `starts`, insert the **Step Starts** variable"],
] as const;

const DISTANCE_KEYS = [
  "`metric` = `distance`",
  "`values` = **Distance Values**",
  "`starts` = **Distance Starts**",
  "Set Variable **Distance Metric**",
];

const ENERGY_KEYS = [
  "`metric` = `active_energy`",
  "`values` = **Energy Values**",
  "`starts` = **Energy Starts**",
  "Set Variable **Energy Metric**",
];

const PAYLOAD_KEYS = [
  "Key `source`, type Text, value `shortcuts`",
  "Key `metrics`, insert the **Metrics** variable",
  "Set Variable **Payload**",
];

export const BACKFILL_STEPS = [
  "In Shortcuts, long-press **Resonance Nightly** and tap **Duplicate**.",
  "Rename the copy **Resonance Backfill**.",
  "On each of the three **Find Health Samples** actions, tap the Start Date filter and change it from **is in the last 2 days** to **is between**.",
  'Set the start to **September 1, 2026** and the end to **today**. (If "is between" is not offered, use **is after** **August 31, 2026**, so September 1 is included.)',
  "Leave the URL, header, and JSON body the same as Nightly.",
  "Tap the play button once.",
] as const;

export const AUTOMATION_STEPS = [
  "Open **Shortcuts**.",
  "Tap the **Automation** tab at the bottom.",
  "Tap **+** (or **New Automation**), then **Time of Day**.",
  "Set the time to **9:00 PM**. Set **Repeat** to **Daily**. Tap **Next**.",
  "Choose **Resonance Nightly**.",
  "Turn **Run Immediately** on. If you see **Ask Before Running**, turn that off.",
  "Turn **Notify When Run** off.",
  "Tap **Done**.",
] as const;

export const HEALTH_ACCESS_NOTE =
  "The first time you add **Find Health Samples**, the iPhone asks for Health access. Turn on **Steps**, **Walking + Running Distance**, and **Active Energy**, then tap **Allow**. If the first run asks again, tap **Allow**. **Don't Allow** means nothing is sent and the days already stored stay as they are.";

export const LARGER_TOTAL_NOTE =
  '"Start Date is in the last 2 days" is a rolling 48 hours. At 9 PM the oldest day in that window only has samples from 9 PM to midnight. The server keeps the larger total for that day, so the nightly partial does not replace the full day already stored. Running the shortcut again with the same samples leaves the totals the same. A later post whose total is higher replaces the stored one.';

export const BACKFILL_CHUNK_NOTE =
  "If the shortcut stalls or the phone says the request is too large, run it in whole-day chunks that do not split a day: September 1 through September 14, September 15 through September 30, and October 1 through today. A chunk that covers a whole day lands that day's full total. Running a chunk again is safe: the same total stays, and a higher total replaces the stored one. A smaller slice does not shrink a day that is already larger.";

export const WORKOUTS_NOTE =
  "Workouts are optional and are not part of Nightly. To send them, add a fourth Dictionary with `metric` set to `workouts`, `values` set to the duration or count list, `starts` set to the start dates, and `units` set to `min` or `count`. Put that dictionary in the Metrics list.";

export const AUTOMATION_NOTE =
  "Each nightly run should include every sample for the days it covers. The server keeps the larger total per day, so the partial oldest day cannot wipe a full day, and a higher later total still wins.";

const NESTED: Record<number, readonly string[]> = {
  15: STEPS_KEYS[0],
  17: DISTANCE_KEYS,
  18: ENERGY_KEYS,
  20: PAYLOAD_KEYS,
};

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol>
      {items.map((step, index) => (
        <li key={step}>
          <Rich text={step} />
          {NESTED[index] ? (
            <ul>
              {NESTED[index].map((line) => (
                <li key={line}>
                  <Rich text={line} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function FitnessShortcutSetup(): ReactNode {
  return (
    <details className="shortcut-setup" data-fitness-shortcut>
      <summary>Set up the iPhone Shortcut</summary>
      <div className="shortcut-setup-body">
        <h3>Resonance Nightly</h3>
        <Steps items={NIGHTLY_STEPS} />
        <p>
          <Rich text={HEALTH_ACCESS_NOTE} />
        </p>
        <p>
          <Rich text={LARGER_TOTAL_NOTE} />
        </p>
        <h3>Resonance Backfill</h3>
        <Steps items={BACKFILL_STEPS} />
        <p>{BACKFILL_CHUNK_NOTE}</p>
        <p>
          <Rich text={WORKOUTS_NOTE} />
        </p>
        <h3>Automation</h3>
        <Steps items={AUTOMATION_STEPS} />
        <p>{AUTOMATION_NOTE}</p>
      </div>
    </details>
  );
}
