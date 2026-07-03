import re

with open('C:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/sales/SalesOrderForm.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Structural changes
text = text.replace('SalesOrderForm', 'PurchaseOrderForm')
text = text.replace('Orden de Venta', 'Orden de Compra')
text = text.replace('OV', 'OC')
text = text.replace('CLIENTE', 'PROVEEDOR')
text = text.replace('Cliente', 'Proveedor')
text = text.replace('VENDEDOR', 'COMPRADOR')
text = text.replace('Vendedor', 'Comprador')
text = text.replace('CONDICIÓN', 'CONDICIÓN DE COMPRA')
text = text.replace('Condición de Venta', 'Condición de Compra')
text = text.replace('saleConditions', 'purchaseConditions')
text = text.replace('setSaleConditions', 'setPurchaseConditions')
text = text.replace('fetchSalesOrder', 'fetchPurchaseOrder')
text = text.replace('sales-orders', 'purchase-orders')
text = text.replace('sales-order-changed', 'purchase-order-changed')
text = text.replace('sales_order_id', 'purchase_order_id')
text = text.replace('source_sales_line_id', 'source_purchase_line_id')
text = text.replace('/sales/', '/purchases/')
text = text.replace('?type=client', '?type=supplier')
text = text.replace('salespersonId', 'buyerId')
text = text.replace('setSalespersonId', 'setBuyerId')
text = text.replace('TOTAL CARTERA', 'TOTAL COMPRA')
text = text.replace('COBRO', 'PAGO')
text = text.replace('Cobros Registrados', 'Pagos Registrados')
text = text.replace('Cobro a Fac', 'Pago a Fac')
text = text.replace('facturar Pedido', 'facturar Orden')

# Handle API endpoints: specific cases
text = text.replace('/purchases/delivery-notes/', '/purchases/purchase-delivery-notes/')

# Handle table header & logic (remove UTILIDAD)
text = text.replace('<div className={s.th} style={{ textAlign: \'right\' }}>UTILIDAD</div>', '')
text = text.replace('<div><span style={{ fontWeight: 800 }}>Comisión:</span> <span style={{ color: \'#059669\', fontWeight: 700 }}>{fmtValue(utilidad)}</span></div>', '')
text = text.replace('<div style={{ fontSize: 11, fontWeight: 700, color: \'#059669\', textAlign: \'right\' }}>\n                                                {fmtValue((item.cost_price > 0 && item.unit_price > 0) ? ( (item.unit_price * (1 - (item.discount_pct||0)/100)) - item.cost_price ) * (item.qty || 0) : 0)}\n                                            </div>', '')

# Remove Comision card in traceback completely
# We find COMISIÓN in the DOM
comision_regex = r'\{\/\* COMISIÓN \*\/\}.*?</div>\s*</div>'
text = re.sub(comision_regex, '</div>', text, flags=re.DOTALL)

# In the item summary, remove "COMISIÓN" and "VENDEDOR"
summary_com_regex = r'<div className=\{s\.summaryItem\}>\s*<div className=\{s\.summaryLabel\}>COMISIÓN</div>.*?</div>'
text = re.sub(summary_com_regex, '', text, flags=re.DOTALL)

with open('C:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/purchases/PurchaseOrderForm.jsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("done")
