import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInternalCommercialDocuments } from "./useInternalCommercialDocuments";

const mocks = vi.hoisted(() => ({ openWindow: vi.fn() }));
vi.mock("../../context/WindowContext", () => ({
  useWindow: () => ({ openWindow: mocks.openWindow }),
}));

describe("apertura interna de documentos comerciales", () => {
  beforeEach(() => {
    mocks.openWindow.mockClear();
    localStorage.clear();
  });

  it("abre Nueva Factura dentro del escritorio sin llamar al navegador", () => {
    const external = vi.spyOn(window, "open").mockImplementation(() => null);
    const { result } = renderHook(() => useInternalCommercialDocuments());
    result.current.openNuevaFactura();
    expect(mocks.openWindow).toHaveBeenCalledWith(
      "invoice-form",
      expect.objectContaining({ mode: "new", initialSourceType: null }),
      expect.objectContaining({ singletonKey: "sales-invoice-new-manual" }),
    );
    expect(external).not.toHaveBeenCalled();
    external.mockRestore();
  });

  it("transfiere una factura de compra con el borrador y origen correcto", () => {
    localStorage.setItem("purchase_invoice_draft_test-oc", JSON.stringify({
      sourceType: "purchase-order",
      purchaseOrderId: "oc-101",
      lines: [{ product_id: "producto-1", qty: 0.35, qty_packages: 1 }],
    }));
    const { result } = renderHook(() => useInternalCommercialDocuments());
    result.current.openNuevaFacturaCompra({ draft_id: "test-oc" });
    expect(mocks.openWindow).toHaveBeenCalledWith(
      "purchase-invoice-form",
      expect.objectContaining({
        draftId: "test-oc", initialSourceType: "purchase-order", initialSourceId: "oc-101",
      }),
      expect.any(Object),
    );
  });

  it("abre remito de venta y compra con los ítems seleccionados", () => {
    localStorage.setItem("remito_draft_ov_13", JSON.stringify([{ product_id: "x", qty_to_remit: 20 }]));
    localStorage.setItem("remito_draft_oc_14", JSON.stringify([{ product_id: "y", qty_to_receive: 0.35 }]));
    const { result } = renderHook(() => useInternalCommercialDocuments());
    result.current.openNuevoRemito("ov-13", { draft_key: "remito_draft_ov_13" });
    result.current.openNuevoRemitoEntrada("oc-14", { draft_key: "remito_draft_oc_14" });
    expect(mocks.openWindow).toHaveBeenNthCalledWith(1, "delivery-note",
      expect.objectContaining({ ov_id: "ov-13", preselectedLines: [{ product_id: "x", qty_to_remit: 20 }] }),
      expect.any(Object));
    expect(mocks.openWindow).toHaveBeenNthCalledWith(2, "purchase-delivery-note",
      expect.objectContaining({ oc_id: "oc-14", preselectedLines: [{ product_id: "y", qty_to_receive: 0.35 }] }),
      expect.any(Object));
  });

  it("no confunde las notas de compra con los formularios de venta", () => {
    const { result } = renderHook(() => useInternalCommercialDocuments());
    result.current.openNuevaNotaCreditoCompra({ factura_id: "fc-9" });
    result.current.openEditNotaDebitoCompra("nd-3");
    expect(mocks.openWindow).toHaveBeenNthCalledWith(1, "purchase-invoice-form",
      expect.objectContaining({ initialDocType: "PURCHASE_CREDIT_NOTE", initialSourceId: "fc-9" }),
      expect.any(Object));
    expect(mocks.openWindow).toHaveBeenNthCalledWith(2, "purchase-invoice-form",
      expect.objectContaining({ initialDocType: "PURCHASE_DEBIT_NOTE", mode: "edit", id: "nd-3" }),
      expect.any(Object));
  });
});
