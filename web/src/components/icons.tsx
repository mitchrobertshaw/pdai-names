// Small line icons, drawn for this site. Decorative: hidden from screen readers.
import type { ReactNode } from "react";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const CheckIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const CrossIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const StarIcon = () => (
  <Icon>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </Icon>
);

export const LockIcon = () => (
  <Icon>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Icon>
);

export const AlertIcon = () => (
  <Icon>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </Icon>
);

export const ArrowIcon = () => (
  <Icon>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Icon>
);

export const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const BoltIcon = () => (
  <Icon>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Icon>
);

export const CoinsIcon = () => (
  <Icon>
    <ellipse cx="12" cy="6.5" rx="7" ry="3" />
    <path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
    <path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
  </Icon>
);
