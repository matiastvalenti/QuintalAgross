// Medidas comunes al escritorio interno: el dock ocupa los últimos 40 px.
// Ningún documento debe abrirse con la barra inferior por debajo del dock.
export const DOCK_HEIGHT = 40;
export const WINDOW_MARGIN = 10;

export function clampWindowBounds(win, viewportWidth, viewportHeight) {
  const usableWidth = Math.max(280, viewportWidth - WINDOW_MARGIN * 2);
  const usableHeight = Math.max(240, viewportHeight - DOCK_HEIGHT - WINDOW_MARGIN * 2);
  const width = Math.min(Math.max(280, Number(win.width) || 600), usableWidth);
  const height = Math.min(Math.max(240, Number(win.height) || 500), usableHeight);
  const maxX = Math.max(WINDOW_MARGIN, viewportWidth - WINDOW_MARGIN - width);
  const maxY = Math.max(WINDOW_MARGIN, viewportHeight - DOCK_HEIGHT - WINDOW_MARGIN - height);
  const x = Math.max(WINDOW_MARGIN, Math.min(Number(win.x) || WINDOW_MARGIN, maxX));
  const y = Math.max(WINDOW_MARGIN, Math.min(Number(win.y) || WINDOW_MARGIN, maxY));
  return { x, y, width, height };
}
