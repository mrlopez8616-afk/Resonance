import { Fragment, type ReactNode } from "react";

const INGEST_URL = "https://resonance3.vercel.app/api/fitness/ingest";

export const NIGHTLY_STEPS = [
  "Open the **Shortcuts** app.",
  "Tap **+** (top right) to make a new shortcut.",
  "Tap the shortcut name at the top and rename it **Resonance Nightly**.",
  "Tap **Add Action**, search **Find Health Samples**, and tap it.",
  "Tap the sample type and choose **Steps**.",
  "Tap **Add Filter**. Tap **Start Date**. Tap **is in the last**. Set the number to **2** and the unit to **days**. This 48-hour window has to cover the workouts, because distance and energy are taken from these samples.",
  "Tap the action, then **Set Variable**, and name it **Step Samples**.",
  "Tap **Add Action**, search **Get Details of Health Samples**, and tap it. (If you only see **Get Details of Health Sample**, use that.)",
  "Tap the detail and choose **Value**. Make sure the samples it reads are **Step Samples** (the same variable from step 7, not a new Find).",
  "Tap **Set Variable** and name it **Step Values**.",
  "Add another **Get Details of Health Samples**. Choose **Start Date**. Point it at **Step Samples** again (the samples, not Step Values).",
  "Tap **Set Variable** and name it **Step Starts**.",
  "Do not add Format Date, Sort, or Filter between Value and Start Date. The two lists must stay in the same order.",
  "Repeat steps 4–13 for **Walking + Running Distance**. Name the variables **Distance Samples**, **Distance Values**, and **Distance Starts**. If **Get Details** offers **End Date** or **Source**, get those too, in the same order, and name them **Distance Ends** and **Distance Sources**. Do not sort or filter.",
  "Repeat steps 4–13 for **Active Energy**. Name the variables **Energy Samples**, **Energy Values**, and **Energy Starts**. If **Get Details** offers **End Date** or **Source**, get those too, in the same order, and name them **Energy Ends** and **Energy Sources**. Do not sort or filter.",
  "Tap **Add Action**, search **Dictionary**, and tap it. Add these keys:",
  "Tap **Set Variable** and name it **Steps Metric**.",
  "Add a second Dictionary:",
  "Add a third Dictionary:",
  "Tap **Add Action**, search **List**, and tap it. Add **Steps Metric**, **Distance Metric**, and **Energy Metric** as the three items. Tap **Set Variable** and name it **Metrics**.",
  "Add one more Dictionary:",
  "Add an empty **List**. Tap **Set Variable** and name it **Workout Rows**.",
  "Tap **Add Action**, search **Find Workout**, and tap the action from the free **Actions** app (Sindre Sorhus). It is not in the built-in Health list.",
  "Add a filter: **Start Date**, **is in the last**, **2**, **days**.",
  "If **Find Workout** offers a **Type** filter, set it to **Running**. If it has no type filter, one Find is enough. The server keeps Running and Walking and ignores every other type.",
  "Tap **Set Variable** and name it **Run Workouts**.",
  "Add **Repeat with Each**. Set the list to **Run Workouts**.",
  "Inside the repeat, add a **Dictionary**. For each value, tap **Repeat Item** and pick the property. Add these keys:",
  "Still inside the repeat, tap **Add to Variable**, choose **Workout Rows**, and add that dictionary.",
  "After **End Repeat**, if the first Find was limited to **Running**, repeat the Find, the Repeat, and **Add to Variable** for **Walking** into the same **Workout Rows** list. When the item has no type property, set `type` to `Walking` in that second dictionary.",
  "If Source is not on the repeated item, leave that key out. Leave distance and energy off this dictionary. The server fills distance from the Walking + Running Distance samples in this POST, and energy from the Active Energy samples. Do not type 0.",
  "Tap **Add Action**, search **Get Contents of URL**, and tap it.",
  `Set the URL to \`${INGEST_URL}\`.`,
  "Tap **Show More**.",
  "Set **Method** to **POST**.",
  "Under Headers, tap **Add new header**. Key: `X-Fitness-Token`. Value: paste the token you copied above.",
  "Set **Request Body** to **JSON**.",
  "Add a field named `source`. Type Text. Value `shortcuts`.",
  "Add a field named `metrics`. Tap the type (it starts as Text) and change it to **Array**. Insert the **Metrics** variable. If Shortcuts wraps that list inside one extra list, the server still accepts it.",
  "Add a field named `workouts`. Change the type to **Array**. Insert **Workout Rows**.",
  "Tap **Done**.",
] as const;

const STEPS_KEYS = [
  ["Key `metric`, type Text, value `steps`", "Key `values`, tap the value and insert the **Step Values** variable", "Key `starts`, insert the **Step Starts** variable"],
] as const;

const DISTANCE_KEYS = [
  "`metric` = `distance`",
  "`values` = **Distance Values**",
  "`starts` = **Distance Starts**",
  "`ends` = **Distance Ends** when you collected End Date. Skip the key when you did not.",
  "`sources` = **Distance Sources** when you collected Source. Skip the key when you did not.",
  "Set Variable **Distance Metric**",
];

const ENERGY_KEYS = [
  "`metric` = `active_energy`",
  "`values` = **Energy Values**",
  "`starts` = **Energy Starts**",
  "`ends` = **Energy Ends** when you collected End Date. Skip the key when you did not.",
  "`sources` = **Energy Sources** when you collected Source. Skip the key when you did not.",
  "Set Variable **Energy Metric**",
];

const PAYLOAD_KEYS = [
  "Key `source`, type Text, value `shortcuts`",
  "Key `metrics`, insert the **Metrics** variable",
  "Set Variable **Payload**",
];

const WORKOUT_KEYS = [
  "Key `type`, type Text. Property **Type** or **Workout Type**. If you filtered this Find to Running and there is no type property, value `Running`.",
  "Key `source`, type Text. Property **Source** or **Source Name**. Skip the key when Source is not listed. Nike Run Club is the usual value.",
  "Key `start`, type Text. Property **Start Date**, then **Format Date**. Choose **Custom** and enter `yyyy-MM-dd'T'HH:mm:ssxxx` (or **ISO 8601** if the result shows an offset). The text must include an offset such as `-05:00` or `Z`.",
  "Key `duration`, type Number. Property **Duration**.",
  "Key `durationUnit`, type Text. Value `s` when Duration is seconds, or `min` when it is minutes. If Duration is already text like `30 min`, put that whole text in `duration` and skip `durationUnit`.",
  "Do not add distance or energy here. **Find Workout** is only the workout list: type, start, duration, and source. Distance comes from the Walking + Running Distance samples already in this POST.",
];

export const BACKFILL_STEPS = [
  "In Shortcuts, long-press **Resonance Nightly** and tap **Duplicate**.",
  "Rename the copy **Resonance Backfill**.",
  "On each of the three **Find Health Samples** actions, and on each **Find Workout** action, tap the Start Date filter and change it from **is in the last 2 days** to **is between**. The Health sample window and the workout window have to be the same range, so each workout still has its distance samples in the POST.",
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
  "The first time you add **Find Health Samples**, the iPhone asks for Health access. Turn on **Steps**, **Walking + Running Distance**, and **Active Energy**, then tap **Allow**. When you add **Find Workout**, allow the **Actions** app to read **Workouts**. Nike Run Club runs are in Health only when Nike Run Club is allowed to write workouts. If the first run asks again, tap **Allow**. **Don't Allow** means nothing is sent and the days already stored stay as they are.";

export const LARGER_TOTAL_NOTE =
  '"Start Date is in the last 2 days" is a rolling 48 hours. At 9 PM the oldest day in that window only has samples from 9 PM to midnight. The server keeps the larger total for that day, so the nightly partial does not replace the full day already stored. Running the shortcut again with the same samples leaves the totals the same. A later post whose total is higher replaces the stored one.';

export const BACKFILL_CHUNK_NOTE =
  "If the shortcut stalls or the phone says the request is too large, run it in whole-day chunks that do not split a day: September 1 through September 14, September 15 through September 30, and October 1 through today. A chunk that covers a whole day lands that day's full total. Running a chunk again is safe: the same total stays, and a higher total replaces the stored one. A smaller slice does not shrink a day that is already larger.";

export const WORKOUTS_NOTE =
  "Built-in Shortcuts cannot read a workout. **Find Health Samples** only reads quantity and category samples (Steps, Walking + Running Distance, Active Energy, and the rest of that picker). There is no **Workouts** type, and Apple's Shortcuts app has no **Find Workouts** action on current iOS, including the iOS 26 Health action list. **Get Details of Health Sample** returns Type, Value, Unit, Start Date, End Date, Duration, Source, and Name for those samples, not for a Nike Run Club workout. **Log Workout** writes a workout. It does not read one. The free path is the **Actions** app (free, no ads, no subscription). Its iOS-only **Find Workout** action is only the workout list: type, start, duration, and source. Distance does not come from that action. The same POST already carries Walking + Running Distance samples, and the server adds the ones whose start, or end when `ends` is sent, falls inside the workout. Active Energy samples fill energy the same way. An explicit distance on the workout still wins, and a later post that includes one replaces a distance the server filled in. If no sample falls inside the workout, distance stays empty and is never stored as 0. When the samples include a source and one matches the workout, only that source is counted. Otherwise the server keeps the single source with the largest total inside the workout, so an iPhone sample and a Watch sample are not added together. When the samples have no source, the server sums every sample in the window. That sum can double-count if the iPhone and the Watch both wrote the same stretch, which is why Source is worth collecting. A missing source name on the workout still stores the row, and that line stays off the card. Other types, such as Cycling, are ignored. The same start time and type posted again updates that row instead of adding another. A post with no `workouts` array still updates daily totals the same way, and the larger shortcuts total still wins. The Find Health Samples window has to cover the workouts: the last 2 days on Resonance Nightly, and the full between-range on Resonance Backfill. Health Auto Export can also send workouts, but its free tier is widgets and charts only. Manual export is the $2.99 Basic purchase. Unattended REST export is Premium: $1.99 a month, $6.99 a year, or $24.99 lifetime. That paid tier is not required for this shortcut.";

export const AUTOMATION_NOTE =
  "Each nightly run should include every sample for the days it covers. The server keeps the larger total per day, so the partial oldest day cannot wipe a full day, and a higher later total still wins.";

const NESTED: Record<number, readonly string[]> = {
  15: STEPS_KEYS[0],
  17: DISTANCE_KEYS,
  18: ENERGY_KEYS,
  20: PAYLOAD_KEYS,
  27: WORKOUT_KEYS,
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
