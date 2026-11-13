// AI-generated original art (gpt-image via the Neon AI Gateway). See docs/ART_BIBLE.md and tools/art/.
// Plants world ("forest-plants"): glossy chibi toy-diorama style. Curiosity Craft: blocky voxel toy style.

export interface ArtCharacter {
  full: string;
  fullBack?: string;
  portrait: string;
  portraitThink?: string;
  /** suggested in-world px height at 1x */
  height: number;
}

const P = '/art/plants';
const ch = (id: string, height: number, back = false): ArtCharacter => ({
  full: `${P}/char/${id}-full.webp`,
  ...(back ? { fullBack: `${P}/char/${id}-back.webp` } : {}),
  portrait: `${P}/char/${id}-portrait.webp`,
  height,
});

export const ART = {
  characters: {
    player: ch('player', 64, true),
    companion: ch('companion', 34),
    goat: ch('goat', 60),
    'npc-sunny': ch('sunny', 76),
    'npc-chloro': ch('chloro', 64),
    'npc-rootie': ch('rootie', 58),
    'npc-misty': ch('misty', 62),
    'npc-oakley': ch('oakley', 84),
    'npc-cloud': ch('cloudmother', 88),
  } as Record<string, ArtCharacter>,
  zones: {
    hub: `${P}/zones/seedling-square.webp`,
    'z-meadow': `${P}/zones/sunflower-meadow.webp`,
    'z-leaflab': `${P}/zones/leaf-lab.webp`,
    'z-roots': `${P}/zones/rootdeep-caverns.webp`,
    'z-canopy': `${P}/zones/misty-canopy.webp`,
    'z-pond': `${P}/zones/stream-pond.webp`,
    goal: `${P}/zones/cloud-peak.webp`,
  } as Record<string, string>,
  landmarks: {
    hub: `${P}/landmarks/seedling-square.webp`, // wilted Great Bloom
    'hub-bloom': `${P}/landmarks/great-bloom-open.webp`,
    'z-meadow': `${P}/landmarks/sunflower-meadow.webp`,
    'z-leaflab': `${P}/landmarks/leaf-lab.webp`,
    'z-roots': `${P}/landmarks/rootdeep-caverns.webp`,
    'z-canopy': `${P}/landmarks/misty-canopy.webp`,
    'z-pond': `${P}/landmarks/stream-pond.webp`,
    goal: `${P}/landmarks/cloud-peak.webp`,
  } as Record<string, string>,
  science: {
    'leaf-kitchen': `${P}/science/leaf-kitchen.webp`,
    stomata: `${P}/science/stomata.webp`,
    'roots-xylem': `${P}/science/roots-xylem.webp`,
    transpiration: `${P}/science/transpiration.webp`,
    evapotranspiration: `${P}/science/evapotranspiration.webp`,
    'water-cycle': `${P}/science/water-cycle.webp`,
  } as Record<string, string>,
  title: `${P}/title.webp`,
};

const C = '/art/cc';

/** Curiosity Craft (blocky voxel beach / surf world). */
export const ART_CC = {
  sam: {
    full: `${C}/sam-full.webp`,
    happy: `${C}/sam-happy.webp`,
    thinking: `${C}/sam-think.webp`,
    laughing: `${C}/sam-laugh.webp`,
    /** action cutout: riding a wave on the board */
    surfing: `${C}/sam-surf.webp`,
    height: 72,
  },
  /** "CURIOSITY CRAFT" wordmark, transparent, trimmed, about 1139x463 (also logo.png) */
  logo: `${C}/logo.webp`,
  /** glowing voxel '?' cube app mark, 512x512 transparent (favicons derive from it) */
  logoMark: `${C}/logo-mark.webp`,
  /** 1536x1024, beach + surfers + glowing 'WHY?' in the sky (site hero + title screen) */
  keyart: `${C}/keyart.webp`,
  icons: {
    wave: `${C}/icons/wave.webp`,
    surfboard: `${C}/icons/surfboard.webp`,
    sun: `${C}/icons/sun.webp`,
    fish: `${C}/icons/fish.webp`,
    sand: `${C}/icons/sand.webp`,
    wind: `${C}/icons/wind.webp`,
  } as Record<string, string>,
  lab: {
    stone: `${C}/lab/stone.webp`,
    wood: `${C}/lab/wood.webp`,
    foam: `${C}/lab/foam.webp`,
  } as Record<'stone' | 'wood' | 'foam', string>,
  /** 1024x1536 transparent: 5 coloured rungs bottom to top */
  whyLadder: `${C}/why-ladder.webp`,
  /** 1024x1536 transparent frame, centre is empty/transparent */
  journalFrame: `${C}/journal-frame.webp`,
};
