import { describe, expect, it } from "vitest";
import {
  packageFactor, unitsToPackages, packagesToUnits,
  selectedRemitoUnits, formatRemitoQuantity,
} from "./remitoPackages";

describe("Remitos de Venta y Entrada: envases y unidades base", () => {
  it("convierte frascos fraccionarios de 0,35 kg sin redondear a cero", () => {
    const frasco = { _unit_content: 0.35, _unit_label: "kg" };
    expect(packageFactor(frasco)).toBe(0.35);
    expect(packagesToUnits(3, frasco)).toBe(1.05);
    expect(unitsToPackages(1.05, frasco)).toBe(3);
    expect(formatRemitoQuantity(1.05)).toBe("1,05");
  });

  it("conserva equivalencia para bidones de 20 L", () => {
    const bidon = { _unit_content: 20 };
    expect(packagesToUnits(2.5, bidon)).toBe(50);
    expect(unitsToPackages(40, bidon)).toBe(2);
  });

  it("nunca confunde qty_packages con kg al recibir remitos", () => {
    const x = { _unit_content: 0.35, qty_packages: 3 };
    expect(selectedRemitoUnits(x)).toBe(1.05);
    expect(selectedRemitoUnits({ ...x, qty_to_receive: 0.7 })).toBe(0.7);
    expect(selectedRemitoUnits({ ...x, qty: 0 })).toBe(0);
    expect(selectedRemitoUnits({ ...x, qty_to_receive: 0 })).toBe(0);
  });

  it("prioriza cantidades base del circuito de compras y no duplica el factor", () => {
    const x = { _unit_content: 5, qty: 15, qty_packages: 3, qty_to_receive: 10 };
    expect(selectedRemitoUnits(x)).toBe(10);
    expect(unitsToPackages(selectedRemitoUnits(x), x)).toBe(2);
  });

  it("evita valores no numéricos y limita la representación a seis decimales", () => {
    expect(packagesToUnits(1, { _unit_content: "desconocido" })).toBe(1);
    expect(unitsToPackages("no numérico", { _unit_content: 0.35 })).toBe(0);
    expect(unitsToPackages(1, { _unit_content: 0.3 })).toBe(3.333333);
  });
});
