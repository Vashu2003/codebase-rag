import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function BrandMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="6" r="3" fill="#5EEAD4" />
      <circle cx="5" cy="17" r="2.4" fill="#5CA8F8" />
      <circle cx="19" cy="17" r="2.4" fill="#5CA8F8" />
      <path
        d="M12 9 L5 15 M12 9 L19 15"
        stroke="#5CA8F8"
        strokeWidth="1.4"
        opacity=".7"
      />
    </svg>
  );
}

export function CaretIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 4.5 6 7.5 9 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
      <path
        d="M7 3v8M3 7h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 10 17 3l-4 14-3-6-7-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6 4 2 8l4 4M10 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GraphIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <circle cx="8" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="3.5" cy="12" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.5" cy="12" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 6 4 10.5M8 6l4 4.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="7"
        rx="1.3"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M9.5 4.5V3.2A1.2 1.2 0 0 0 8.3 2H3.2A1.2 1.2 0 0 0 2 3.2v5.1A1.2 1.2 0 0 0 3.2 9.5h1.3"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 3l8 8M11 3l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GithubIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1 0-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3-1.8 3.7-3.6 3.9.3.3.6.8.6 1.6v2.4c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" />
    </svg>
  );
}
