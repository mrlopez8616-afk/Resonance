import type { ReactNode } from "react";

type IconProps = {
  size?: number;
  className?: string;
};

function Svg({
  size = 20,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.8V20h11V9.8" />
    </Svg>
  );
}

export function LogIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4h7l6 6v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M14 4v6h6" />
    </Svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </Svg>
  );
}

export function ApprovalsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="m8.2 12.2 2.6 2.6 5-5.2" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="11" width="12" height="8.5" rx="1.5" />
      <path d="M8.5 11V8.2a3.5 3.5 0 0 1 7 0V11" />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" />
    </Svg>
  );
}
