import { describe, expect, it } from "vitest";
import { clampWindowBounds, DOCK_HEIGHT, WINDOW_MARGIN } from "./windowGeometry";

describe("límites reales de las ventanas internas del ERP", () => {
  it("mantiene una factura de 780px completa en una ventana de Chrome de 800px", () => {
    const win = clampWindowBounds({ x: 50, y: 50, width: 1270, height: 780 }, 1534, 800);
    expect(win.height).toBe(800 - DOCK_HEIGHT - WINDOW_MARGIN * 2);
    expect(win.y + win.height).toBeLessThanOrEqual(800 - DOCK_HEIGHT - WINDOW_MARGIN);
    expect(win.x + win.width).toBeLessThanOrEqual(1534 - WINDOW_MARGIN);
  });

  it("recupera una ventana guardada fuera de pantalla sin perder su pie", () => {
    const win = clampWindowBounds({ x: 1350, y: 900, width: 1200, height: 750 }, 1366, 768);
    expect(win.x).toBeGreaterThanOrEqual(WINDOW_MARGIN);
    expect(win.y).toBeGreaterThanOrEqual(WINDOW_MARGIN);
    expect(win.x + win.width).toBeLessThanOrEqual(1366 - WINDOW_MARGIN);
    expect(win.y + win.height).toBeLessThanOrEqual(768 - DOCK_HEIGHT - WINDOW_MARGIN);
  });

  it("conserva tamaño habitual en pantallas amplias sin desplazar una ventana válida", () => {
    const win = clampWindowBounds({ x: 130, y: 90, width: 1180, height: 690 }, 1920, 1080);
    expect(win).toEqual({ x: 130, y: 90, width: 1180, height: 690 });
  });

  it("limita tanto la altura como la anchura tras reducir la pantalla", () => {
    const win = clampWindowBounds({ x: 50, y: 50, width: 1600, height: 900 }, 1050, 680);
    expect(win.width).toBeLessThanOrEqual(1050 - WINDOW_MARGIN * 2);
    expect(win.height).toBeLessThanOrEqual(680 - DOCK_HEIGHT - WINDOW_MARGIN * 2);
  });
});
