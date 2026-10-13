import './style.css';
import { parseLang } from './core/formats';
import { seededRng } from './core/rng';
import { loadBytes } from './render/assets';
import { loadSprites } from './render/sprites';
import { showMainMenu } from './ui/menu';
import { FAST_TIMING, NORMAL_TIMING } from './ui/session';

const MAP_FILES = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 's0', 's1'];

async function boot(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed');
  root.textContent = 'Loading…';
  const [sprites, langBytes, maps] = await Promise.all([
    loadSprites(),
    loadBytes('lang.dat'),
    Promise.all(MAP_FILES.map(async (name) => [name, await loadBytes(name)] as const)),
  ]);
  showMainMenu({
    root,
    sprites,
    lang: parseLang(langBytes),
    maps: new Map(maps),
    rng: seededRng(seed === null ? Date.now() >>> 0 : Number(seed)),
    timing: params.has('fast') ? FAST_TIMING : NORMAL_TIMING,
  });
}

const root = document.getElementById('app')!;
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));
boot(root).catch((error: unknown) => {
  root.textContent = `Could not start the game: ${describe(error)}`;
});
// Menu and battle flows run as fire-and-forget promises; surface a crash instead of a frozen board.
window.addEventListener('unhandledrejection', (event) => {
  root.textContent = `Something went wrong: ${describe(event.reason)}. Reload to continue from the last autosave.`;
});
