/**
 * the_ville building locations reused as market venues (extracted once from the
 * reverie maze address_tiles; tile coordinates, 32px tiles).
 *   board    = Hobbs Cafe (cafe)            -> agents post here (SNS)
 *   exchange = The Willows Market (store)   -> agents trade here
 * Pixel position = tile * TILE_SIZE.
 */
export const TILE_SIZE = 32;

export const MAP_ZONES = {
  board: { tileX: 77, tileY: 22, label: "게시판 (Hobbs Cafe)" },
  exchange: { tileX: 84, tileY: 47, label: "거래소 (Willows Market)" },
} as const;

export type MapZone = keyof typeof MAP_ZONES;

export function zonePixel(zone: MapZone): { x: number; y: number } {
  const z = MAP_ZONES[zone];
  return { x: z.tileX * TILE_SIZE, y: z.tileY * TILE_SIZE };
}
