export default function AnimatedFlame({ className = 'h-10 w-10' }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Soft outer glow */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full flame-glow"
      />

      {/* Premium layered flame mark */}
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label="FireFed"
        className="relative z-10 flame-luxe"
      >
        <defs>
          <linearGradient id="flame_outer" x1="16" y1="6" x2="48" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffdd7a" />
            <stop offset="35%" stopColor="#ff8a2a" />
            <stop offset="70%" stopColor="#ff3d5a" />
            <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id="flame_inner" x1="22" y1="14" x2="44" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff2b5" />
            <stop offset="45%" stopColor="#ffd166" />
            <stop offset="100%" stopColor="#fb923c" />
          </linearGradient>

          <radialGradient id="flame_core" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#ffe9a8" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ff9a3c" stopOpacity="0" />
          </radialGradient>

          <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#f97316" floodOpacity="0.35" />
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#fb7185" floodOpacity="0.22" />
          </filter>
        </defs>

        {/* Outer flame */}
        <path
          className="flame-outer"
          filter="url(#softShadow)"
          fill="url(#flame_outer)"
          d="M33.9 6.3c.9 6.6-2 10.4-5.1 13.6-3.7 3.9-6.6 7-4.4 13 1.1 3 3.5 5.2 6.4 6.3-1.2-2.7.1-5.1 1.8-7.2 2.1-2.6 4.9-5.1 4.2-10 4.6 3.4 8.4 8.1 8.4 15.2 0 11-8 19-18 19S9 48 9 38.9c0-7.7 4.9-13.6 10.4-18.8 5.1-4.8 10-9.3 14.5-13.8z"
        />

        {/* Inner flame */}
        <path
          className="flame-inner"
          fill="url(#flame_inner)"
          d="M33.2 20.7c1.8 4.9-.8 7.7-2.6 10.2-1.8 2.5-2.7 5.1-.4 8.2 1.6 2.2 4.3 3.6 6.9 3.8 6.2.4 10.7-4.9 9.8-11-1-7-7.1-10.2-13.7-11.2z"
        />

        {/* Core shimmer highlight */}
        <circle className="flame-core" cx="33" cy="32" r="18" fill="url(#flame_core)" />
      </svg>
    </span>
  );
}


