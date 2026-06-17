import sys

with open(r"c:\Users\matia\Cosas\Escritorio\Cosas\Programacion\Otro\QuintalAgross_Back\frontend\src\modules\sales\SalesOrderForm.jsx", "r", encoding="utf-8") as f:
    content = f.read()

start_idx = content.find("const handleSave = async () => {")
end_idx = content.find("setLinkManagerDoc({", start_idx)

if start_idx != -1 and end_idx != -1:
    correct_code = """const handleSave = async () => {
    if (!entity) return showToast("Seleccione un cliente", "warning");
    if (items.length === 0) return showToast("Agregue productos", "warning");

    const payload = {
      entity_id: entity.id,
      number: joinFullNumber(pv, number),
      date,
      due_date: dueDate,
      warehouse_id: warehouseId,
      currency,
      exchange_rate: Number(exchangeRate),
      salesperson_id: salespersonId || null,
      sale_condition_id: selectedConditionId || null,
      notes: observations,
      cost_center: parseInt(ctroCosto),
      lines: items.map((item, idx) => {
        const { _unit_content, _unit_label, id: _localId, ...rest } = item;
        const linePayload = { 
          ...rest, 
          line_order: idx,
          unit_cost: item.cost_price || item.unit_cost || 0 
        };
        // Preserve DB IDs, discard frontend-generated random numbers
        if (_localId && !String(_localId).startsWith("0.")) {
            linePayload.id = String(_localId);
        }
        return linePayload;
      }),
    };

    try {
      const token = localStorage.getItem("token");
      const url = mode === "new" ? `${API_URL}/sales/sales-orders/` : `${API_URL}/sales/sales-orders/${id}`;
      const method = mode === "new" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const savedId = data.id || id;
        showToast("Orden de Venta guardada", "success");
        window.dispatchEvent(new CustomEvent("sales-order-changed"));
        if (window.opener) window.opener.dispatchEvent(new CustomEvent("sales-order-changed"));
        setMode("edit");
        setId(savedId);
        setIsReadOnly(true); // Switch to read-only after save
        fetchSalesOrder(savedId);
      } else {
        const err = await res.json();
        showToast(err.detail || "Error al guardar", "error");
      }
    } catch (e) {
      showToast("Error de conexión", "error");
    }
  };

  const handleOpenLinkManager = async (docId, type, docNumber) => {
    setLoadingLinkManager(true);
    try {
      const token = localStorage.getItem("token");
      const url = type === 'REMITO' 
        ? `${API_URL}/sales/delivery-notes/${docId}` 
        : `${API_URL}/accounting/documents/${docId}`;
      
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
      if (!res.ok) throw new Error("Error loading doc");
      
      const data = await res.json();
      // Filter lines that belong to THIS Sales Order
      const linkedLines = (data.lines || []).filter(l => {
        const matches = l.source_sales_line_id && items.some(item => item.id === l.source_sales_line_id);
        return matches;
      });

      if (linkedLines.length === 0) {
        showToast("No se encontraron vínculos directos con este pedido en este documento", "info");
      }

      """

    new_content = content[:start_idx] + correct_code + content[end_idx:]
    with open(r"c:\Users\matia\Cosas\Escritorio\Cosas\Programacion\Otro\QuintalAgross_Back\frontend\src\modules\sales\SalesOrderForm.jsx", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("FIXED")
else:
    print("NOT FOUND")
