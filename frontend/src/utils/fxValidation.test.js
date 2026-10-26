import { describe, it, expect } from "vitest";
import { isValidUsdRate } from "./fxValidation";

describe("Validación del TC divisas", () => {
  it.each([null, undefined, "", " ", 0, 1, "1", -5, "abc", NaN, Infinity, -Infinity])(
    "no acepta TC faltante o ficticio: %s", value => {
      expect(isValidUsdRate(value)).toBe(false);
    }
  );

  it.each([1400, 1508.5, "1530.25", 2])(
    "permite cotización ingresada y verificada: %s", value => {
      expect(isValidUsdRate(value)).toBe(true);
    }
  );
});
