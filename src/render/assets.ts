import { type Tint, tintPixels } from './palette';

const BASE = './assets/ae1/';

export async function loadBytes(name: string): Promise<Uint8Array> {
  const response = await fetch(BASE + name);
  if (!response.ok) throw new Error(`asset ${name}: HTTP ${response.status}. Run "npm run assets".`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadImage(name: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = BASE + name;
  await image.decode();
  return image;
}

/** Bakes a tinted copy once at load, so drawing a red unit costs the same as a blue one. */
export function tinted(image: HTMLImageElement, tint: Tint): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  tintPixels(data.data, tint);
  context.putImageData(data, 0, 0);
  return canvas;
}
