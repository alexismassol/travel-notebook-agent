import type { ReactNode, SVGProps } from "react";

/**
 * Icônes dessinées à la main pour "Carnet de terrain" : viewBox 24, trait 1.5, `currentColor`.
 * Jamais d'emoji ni de glyphe unicode comme icône. Chaque icône hérite
 * de la couleur du texte qui l'entoure via `currentColor`. Aucune couleur n'est codée en dur ici.
 * Toutes décoratives (`aria-hidden`) : le libellé qui les accompagne porte le sens.
 */

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 18c-1.6-4.8-.4-9.6 3-13 3.8-3.8 9-4 12-3.6.4 3-.2 8.2-4 12-3.4 3.4-8.2 4.6-11 4.6Z" />
      <path d="M6.5 17.5 17 7" />
    </IconBase>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" />
    </IconBase>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
      <path d="M3.5 9.5h17M8 3v3.6M16 3v3.6" />
      <path d="M7.6 13.3h2M11 13.3h2M14.4 13.3h2M7.6 16.6h2M11 16.6h2" />
    </IconBase>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12.5" r="8.2" />
      <path d="M12 8v4.7l3.3 2" />
    </IconBase>
  );
}

export function TravellersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="8.6" cy="8" r="2.6" />
      <path d="M3.3 19c.4-3.4 2.6-5.3 5.3-5.3s4.9 1.9 5.3 5.3" />
      <circle cx="16.4" cy="7" r="2.1" />
      <path d="M14.9 12.2c.6-.4 1.3-.6 2-.6 2.3 0 4.2 1.7 4.6 4.6" />
    </IconBase>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20.5 3.5 3 10.7c-.6.25-.55 1.1.08 1.3l5.6 1.7 1.7 5.6c.2.63 1.05.68 1.3.08L19 3.9" />
      <path d="M20.5 3.5 9.7 13.3" />
    </IconBase>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4.5 12.7 9 17.2 19.5 6.8" />
    </IconBase>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.8 21 19.3H3L12 3.8Z" />
      <path d="M12 10v3.6" />
      <circle cx="12" cy="16.5" r="0.15" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 21.2c4.4-4.8 7-8.8 7-12.2A7 7 0 0 0 5 9c0 3.4 2.6 7.4 7 12.2Z" />
      <circle cx="12" cy="8.8" r="2.3" />
    </IconBase>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 9.5 12 15.5 18 9.5" />
    </IconBase>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M19.5 19.5 15.6 15.6" />
    </IconBase>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 6.2c-1.6-1.2-4-1.7-8-1.7v14c4 0 6.4.5 8 1.7 1.6-1.2 4-1.7 8-1.7v-14c-4 0-6.4.5-8 1.7Z" />
      <path d="M12 6.2v14" />
    </IconBase>
  );
}

export function ChatsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 5.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5Z" />
      <path d="M16.5 9.5H20A1.5 1.5 0 0 1 21.5 11v5a1.5 1.5 0 0 1-1.5 1.5h-1V20l-3-2.5h-4.5" />
    </IconBase>
  );
}
