/** Optional GLB decoration from the shared 3D asset manifest (web/src/shared/assets3d.ts), if it exists. */
import type * as THREE from 'three';
import type { TemplateId } from '../shared/contracts';

const mods = import.meta.glob('../shared/assets3d.ts');

export async function decorateWithKit(_island: THREE.Group, _t: TemplateId): Promise<void> {
  const load = mods['../shared/assets3d.ts'];
  if (!load) return; // manifest not written yet: the procedural island stands alone
  await load();
}
