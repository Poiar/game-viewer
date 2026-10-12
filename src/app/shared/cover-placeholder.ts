// Deterministic, tasteful gradient for games without cover art, so a missing
// cover looks like an intentional placeholder instead of a bare emoji on grey.
// The color is derived from the game title/id so it is stable across reloads.

const PALETTE: Array<[string, string]> = [
  ["#7c6af7", "#4638b8"], // violet
  ["#06d6a0", "#0b7a5f"], // green
  ["#f76e6e", "#b03f3f"], // red
  ["#fbbf24", "#c2800a"], // amber
  ["#4fc3f7", "#1e6f9e"], // blue
  ["#f472b6", "#ab3f79"], // pink
  ["#a78bfa", "#6149c4"], // purple
  ["#34d399", "#1a7d5e"], // emerald
];

export function coverGradient(seed: string | number): string {
  const s = String(seed);
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  const [from, to] = PALETTE[Math.abs(hash) % PALETTE.length];
  return `linear-gradient(145deg, ${from} 0%, ${to} 100%)`;
}
