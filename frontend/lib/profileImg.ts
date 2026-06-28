import { AGENT_PROFILES, CHARACTER_POOL } from "@/constants/agentProfiles";

/** Known agent id -> profile image path. */
const KNOWN: Record<string, string> = Object.fromEntries(
  AGENT_PROFILES.map((p) => [p.id, p.profile])
);

/** Profile images NOT already claimed by a known agent. */
const USED = new Set(AGENT_PROFILES.map((p) => p.profile));
const SPARE_POOL = CHARACTER_POOL
  .map((c) => `/assets/characters/profile/${c.name}.png`)
  .filter((p) => !USED.has(p));

/** Stable hash -> index so the same agentId always gets the same spare image. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const _cache: Record<string, string> = {};

/** Return a profile image path for any agentId (known or unknown). */
export function getProfileImg(agentId: string): string | undefined {
  if (KNOWN[agentId]) return KNOWN[agentId];
  if (_cache[agentId]) return _cache[agentId];
  if (SPARE_POOL.length === 0) return undefined;
  const img = SPARE_POOL[hash(agentId) % SPARE_POOL.length];
  _cache[agentId] = img;
  return img;
}
