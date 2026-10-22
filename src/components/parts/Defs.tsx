/** Shared SVG gradients and filters used by part renderers. */
export function Defs() {
  return (
    <defs>
      <linearGradient id="g-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f2f4f8" /><stop offset=".45" stopColor="#a9b0bd" /><stop offset="1" stopColor="#5d6472" />
      </linearGradient>
      <linearGradient id="g-black" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4a4e5c" /><stop offset="1" stopColor="#15161c" />
      </linearGradient>
      <linearGradient id="g-copper" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#b5651d" /><stop offset=".5" stopColor="#ffb36b" /><stop offset="1" stopColor="#8a4a12" />
      </linearGradient>
      <linearGradient id="g-uno" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#0d8a9e" /><stop offset="1" stopColor="#05606f" />
      </linearGradient>
      <linearGradient id="g-pico" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1f9a4c" /><stop offset="1" stopColor="#0c6630" />
      </linearGradient>
      <linearGradient id="g-esp" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2b2d38" /><stop offset="1" stopColor="#111219" />
      </linearGradient>
      <linearGradient id="g-blue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3f7cff" /><stop offset="1" stopColor="#1c3fa8" />
      </linearGradient>
      <linearGradient id="g-solar" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#24408f" /><stop offset=".5" stopColor="#3a63c9" /><stop offset="1" stopColor="#1a2c66" />
      </linearGradient>
      <linearGradient id="g-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".55" /><stop offset="1" stopColor="#cfe8ff" stopOpacity=".15" />
      </linearGradient>
      <radialGradient id="g-glow">
        <stop offset="0" stopColor="currentColor" stopOpacity=".95" /><stop offset=".35" stopColor="currentColor" stopOpacity=".45" /><stop offset="1" stopColor="currentColor" stopOpacity="0" />
      </radialGradient>
      <filter id="f-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      <filter id="f-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity=".45" /></filter>
      <filter id="f-burnt"><feColorMatrix type="matrix" values=".25 .2 .1 0 0  .2 .18 .1 0 0  .15 .12 .08 0 0  0 0 0 1 0" /></filter>
      <pattern id="p-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r=".9" fill="var(--grid)" />
      </pattern>
    </defs>
  );
}
