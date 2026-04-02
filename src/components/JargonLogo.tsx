// Inline SVG logo — renders with the page's Sora font, guaranteed to match

interface JargonLogoProps {
  size?: number;
  className?: string;
}

export function JargonLogo({ size = 64, className = '' }: JargonLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="jl-gold" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#e8bd62" />
          <stop offset="45%" stopColor="#d4a04a" />
          <stop offset="100%" stopColor="#9a7030" />
        </linearGradient>
        <linearGradient id="jl-hi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.25} />
          <stop offset="50%" stopColor="white" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="jl-sh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="70%" stopColor="black" stopOpacity={0} />
          <stop offset="100%" stopColor="black" stopOpacity={0.2} />
        </linearGradient>
        <clipPath id="jl-c">
          <rect x="6" y="6" width="148" height="148" rx="30" />
        </clipPath>
      </defs>
      {/* Gold base */}
      <rect x="6" y="6" width="148" height="148" rx="30" fill="url(#jl-gold)" />
      {/* Highlight */}
      <rect x="6" y="6" width="148" height="80" rx="30" fill="url(#jl-hi)" />
      {/* Shadow */}
      <rect x="6" y="6" width="148" height="148" rx="30" fill="url(#jl-sh)" />
      {/* Ghost bingo board 5x5 */}
      <g clipPath="url(#jl-c)" opacity={0.045}>
        {Array.from({ length: 25 }, (_, i) => (
          <rect
            key={i}
            x={12 + (i % 5) * 28}
            y={12 + Math.floor(i / 5) * 28}
            width="24"
            height="24"
            rx="4"
            fill="#0c0c0e"
          />
        ))}
      </g>
      {/* Grid lines */}
      <g clipPath="url(#jl-c)" stroke="#0c0c0e" strokeWidth="0.4" opacity={0.06}>
        {[39, 67, 95, 123].map(x => (
          <line key={`v${x}`} x1={x} y1="6" x2={x} y2="154" />
        ))}
        {[39, 67, 95, 123].map(y => (
          <line key={`h${y}`} x1="6" y1={y} x2="154" y2={y} />
        ))}
      </g>
      {/* J — uses page font (Sora 800) */}
      <text
        x="80"
        y="114"
        textAnchor="middle"
        fontFamily="Sora, system-ui, sans-serif"
        fontWeight="800"
        fontSize="100"
        fill="#0c0c0e"
        opacity={0.12}
      >
        J
      </text>
      <text
        x="80"
        y="112"
        textAnchor="middle"
        fontFamily="Sora, system-ui, sans-serif"
        fontWeight="800"
        fontSize="100"
        fill="#0c0c0e"
        opacity={0.85}
      >
        J
      </text>
      {/* Borders */}
      <rect x="6" y="6" width="148" height="148" rx="30" fill="none" stroke="white" strokeWidth="1" opacity={0.15} />
      <rect x="9" y="9" width="142" height="142" rx="28" fill="none" stroke="#0c0c0e" strokeWidth="0.5" opacity={0.15} />
    </svg>
  );
}
