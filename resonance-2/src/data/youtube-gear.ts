/**
 * YouTube gear. Source: YouTube Studio's launch plan v2, section 10 "Gear map"
 * (/workspace/youtube/launch-plan-v2.md, Oct 7, 2026).
 *
 * The plan names each device and its role, and marks two as new. It does not record when
 * a device was acquired, what it cost, or how much it is used, so those stay null and the
 * page says "not recorded". Never fill them in by guess.
 */

export type YouTubeGear = {
  id: string;
  name: string;
  role: string;
  /** Marked "(new)" in the gear map. */
  isNew: boolean;
  /** ISO date (YYYY-MM-DD) once recorded. */
  acquired: string | null;
  /** Whole USD once recorded. Owner view only; never shown in Public mode. */
  costUsd: number | null;
  /** Free text once recorded, e.g. "every build episode". */
  usage: string | null;
};

export const YOUTUBE_GEAR_SOURCE = "YouTube Studio launch plan v2, gear map (Oct 7)";

export const YOUTUBE_GEAR: readonly YouTubeGear[] = [
  {
    id: "mevo-start",
    name: "Logitech Mevo Start",
    role: "A-cam for whiteboard and walk-and-talk. Possible webcam for lives.",
    isNew: false,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "rode-wireless-go-3",
    name: "Rode Wireless GO Gen 3",
    role: "Clip-on mic. The receiver goes into the Mevo Start's 3.5mm input so audio records in sync, with onboard recording as a backup.",
    isNew: true,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "whiteboard",
    name: "Whiteboard",
    role: "Home of whiteboard mode. Chest-to-head height, angled away from the window. Black plus one accent marker.",
    isNew: true,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "blue-yeti",
    name: "Blue Yeti on Shure boom arm",
    role: "Story sit-downs, voiceovers, live Q&A, and Spanish dub tracks.",
    isNew: false,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "ulanzi-stand",
    name: "ULANZI stand + dual-mount bar",
    role: "Mevo (horizontal) and phone (vertical Shorts) in the same take.",
    isNew: false,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "ulanzi-vl49",
    name: "ULANZI VL49 light",
    role: "Light on the face. Never aimed at the board (glare).",
    isNew: false,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "logitech-c922",
    name: "Logitech C922",
    role: "Face-cam in OBS screen recordings. Backup live cam.",
    isNew: false,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "obs-windows",
    name: "OBS on the Windows desktop",
    role: "Screen recordings of the Resonance site and hub, plus live streams.",
    isNew: false,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "macbook",
    name: "MacBook",
    role: "Mevo app monitoring, notes on set, editing, and uploads.",
    isNew: false,
    acquired: null,
    costUsd: null,
    usage: null,
  },
  {
    id: "phone",
    name: "Phone",
    role: "The control room itself (screen captures) and the vertical B-cam.",
    isNew: false,
    acquired: null,
    costUsd: null,
    usage: null,
  },
];
