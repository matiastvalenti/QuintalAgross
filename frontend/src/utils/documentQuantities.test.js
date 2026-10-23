import { describe, it, expect } from "vitest";
import {
  getContainerSize,
  getPendingUnits,
  getPendingContainers,
  validateDocumentSelection,
} from "./documentQuantities";

describe("cantidades comunes de ventas y compras", () => {
  it("conserva una presentación fraccionaria de 0,35 kg", () => {
    const line = { id: "frasco", qty: 1.05, qty_received: 0.7, _unit_content: 0.35 };
    expect(getContainerSize(line)).toBe(0.35);
    expect(getPendingContainers(line, "qty_received")).toBe(1);
    expect(validateDocumentSelection([line], { frasco: 1 }, "qty_received").valid).toBe(true);
    expect(validateDocumentSelection([line], { frasco: 2 }, "qty_received").valid).toBe(false);
  });

  it("calcula pendientes en envases de 20 litros para venta", () => {
    const line = { id: "bidon", qty: 60, qty_delivered: 40, _unit_content: 20 };
    expect(getPendingUnits(line, "qty_delivered")).toBe(20);
    expect(getPendingContainers(line, "qty_delivered")).toBe(1);
    expect(validateDocumentSelection([line], { bidon: 1 }, "qty_delivered").valid).toBe(true);
    expect(validateDocumentSelection([line], { bidon: 1.5 }, "qty_delivered").valid).toBe(false);
  });

  it("no confunde facturado con recibido", () => {
    const line = { id: "a", qty: 40, qty_received: 30, qty_invoiced: 10, _unit_content: 10 };
    expect(getPendingContainers(line, "qty_received")).toBe(1);
    expect(getPendingContainers(line, "qty_invoiced")).toBe(3);
  });

  it("rechaza envases negativos, no numéricos y presentaciones inválidas", () => {
    const line = { id: "x", qty: 10, qty_invoiced: 0, _unit_content: 2 };
    expect(validateDocumentSelection([line], { x: -1 }, "qty_invoiced").valid).toBe(false);
    expect(validateDocumentSelection([line], { x: "invalido" }, "qty_invoiced").valid).toBe(false);
    expect(validateDocumentSelection([{ ...line, _unit_content: 0 }], { x: 1 }, "qty_invoiced").valid).toBe(false);
  });

  it("permite omitir líneas y evita duplicar la cantidad pendiente", () => {
    const lines = [
      { id: "a", qty: 10, qty_invoiced: 10, _unit_content: 5 },
      { id: "b", qty: 20, qty_invoiced: 0, _unit_content: 5 },
    ];
    expect(validateDocumentSelection(lines, { a: 0, b: 4 }, "qty_invoiced").valid).toBe(true);
    expect(validateDocumentSelection(lines, { a: 1, b: 4 }, "qty_invoiced").valid).toBe(false);
  });
});
