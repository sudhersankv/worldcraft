/** Big dialogue portraits rendered from the same 3D character model (cached per archetype). */
import * as THREE from 'three';
import { spawnCharacter } from './chars';

let R: THREE.WebGLRenderer | null = null;
const cache = new Map<string, string>();

export function portrait(archetype: string, size = 190): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = out.height = size * 2;
  out.style.width = out.style.height = `${size}px`;
  const g = out.getContext('2d')!;
  const draw = (url: string) => { const img = new Image(); img.onload = () => g.drawImage(img, 0, 0, out.width, out.height); img.src = url; };
  const hit = cache.get(archetype);
  if (hit) { draw(hit); return out; }
  try {
    if (!R) { R = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); R.setSize(384, 384); R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace; }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7060, 1.6));
    const d = new THREE.DirectionalLight(0xfff0d8, 2.4); d.position.set(-2, 3, 4); scene.add(d);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.6); rim.position.set(3, 2, -3); scene.add(rim);
    const rig = spawnCharacter(archetype);
    rig.root.rotation.y = -0.35;
    scene.add(rig.root);
    const box = new THREE.Box3().setFromObject(rig.root);
    const hgt = box.max.y - box.min.y;
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    const focusY = box.min.y + hgt * 0.62;
    cam.position.set(0, focusY + 0.15, hgt * 2.6 + 0.6); cam.lookAt(0, focusY, 0);
    R.render(scene, cam);
    const url = R.domElement.toDataURL('image/png');
    cache.set(archetype, url); draw(url);
  } catch (e) { console.warn('portrait failed', e); }
  return out;
}
