interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 9.5h5.2a3 3 0 0 1 3 3v7a3 3 0 0 0 3 3H24"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="7" cy="9.5" r="3.1" fill="currentColor" />
      <circle cx="25" cy="22.5" r="3.1" fill="currentColor" />
      <circle cx="16" cy="16" r="2.1" fill="currentColor" opacity=".6" />
    </svg>
  );
}
