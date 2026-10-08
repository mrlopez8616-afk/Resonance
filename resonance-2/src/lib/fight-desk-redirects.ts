/**
 * Permanent routes off the old Predictions parent.
 * `permanent: true` is a 308. Query strings are kept by Next.js.
 */
export const FIGHT_DESK_REDIRECTS = [
  {
    source: "/n/predictions",
    destination: "/n/fight-desk",
    permanent: true,
  },
  {
    source: "/n/predictions/:path*",
    destination: "/n/fight-desk/:path*",
    permanent: true,
  },
] as const;
