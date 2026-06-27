interface Props {
  className?: string;
}

export default function ParapheMark({ className }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* The period — the founding dot */}
      <circle cx="8" cy="8" r="4.5" fill="currentColor" />
      {/* The paraph — a single looping flourish from the dot */}
      <path
        d="M 8 12.5 C 7 20 15 27 25 23 C 30 21 30 13 25 9.5 C 21 7 18 9 19 12"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
