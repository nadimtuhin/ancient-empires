/** A random source returning integers in [0, bound). Injected so combat and AI stay deterministic in tests. */
export type Rng = (bound: number) => number;

/** Mulberry32: small, fast, seedable. Same seed, same sequence. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return (bound) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * bound);
  };
}
