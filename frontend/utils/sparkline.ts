// Deterministic synthetic price history so sparklines/charts look alive on the
// initial round (before any live stream fills priceHistory). Seeded by symbol
// so a given asset always renders the same shape across renders.

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build an n-point price history that drifts from the 24h-ago price to the
 * current price with mild noise, ending exactly at `price`.
 */
export function seedPriceHistory(
  symbol: string,
  price: number,
  change24h = 0,
  n = 32
): number[] {
  if (!isFinite(price) || price <= 0) return [price || 0];
  const rnd = mulberry32(hashStr(symbol));
  const start = price / (1 + change24h / 100);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = start + (price - start) * t;
    const noise = (rnd() - 0.5) * price * 0.012; // ~1.2% jitter
    out.push(Math.max(0, base + noise));
  }
  out[n - 1] = price; // land exactly on the current price
  return out;
}
