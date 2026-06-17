import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import AccountSelector from '../../components/ui/AccountSelector';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config';
import { Save, ShieldCheck, HelpCircle } from 'lucide-react';

const SETTING_KEYS = [
    { key: "CLIENTS", label: "Deudores por Ventas (Clientes)", description: "Cuenta donde se registra la deuda de clientes en cuenta corriente." },
    { key: "PROVIDERS", label: "Acreedores por Compras (Proveedores)", description: "Cuenta donde se registra la deuda con proveedores." },
    { key: "SALES_GENERIC", label: "Ingresos por Ventas (Genérico)", description: "Cuenta de ingresos por defecto si el producto no tiene una cuenta asignada." },
    { key: "PURCHASES_GENERIC", label: "Gastos por Compras (Genérico)", description: "Cuenta de gastos/stock por defecto para compras." },
    { key: "VAT_DEBIT", label: "IVA Débito Fiscal", description: "Cuenta de pasivo para el IVA de las facturas de venta." },
    { key: "VAT_CREDIT", label: "IVA Crédito Fiscal", description: "Cuenta de activo para el IVA de las facturas de compra." },
    { key: "CASH", label: "Caja / Efectivo", description: "Cuenta para movimientos de dinero en efectivo." },
    { key: "BANK", label: "Banco / Transferencias", description: "Cuenta para movimientos bancarios por transferencia o depósito." },
    { key: "CHECKS_PORTFOLIO", label: "Cheques en Cartera", description: "Cuenta para registrar cheques recibidos de terceros." },
    { key: "RETENTIONS", label: "Retenciones / Percepciones", description: "Cuenta para retenciones impositivas sufridas." },
    { key: "OTHER_PAYMENT", label: "Otros Medios de Pago", description: "Cuenta de ajuste para medios de pago no especificados." },
];

export default function LedgerSettingsPage() {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/accounts-ledger/settings`);
            if (res.ok) {
                const data = await res.json();
                const mapped = {};
                data.forEach(s => { mapped[s.key] = s.value; });
                setSettings(mapped);
            }
        } catch (e) {
            showToast("Error al cargar configuraciones", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            for (const item of SETTING_KEYS) {
                const value = settings[item.key];
                if (value) {
                    await fetch(`${API_URL}/accounts-ledger/settings?key=${item.key}&value=${value}&description=${encodeURIComponent(item.label)}`, {
                        method: 'POST'
                    });
                }
            }
            showToast("Configuración guardada exitosamente", "success");
        } catch (e) {
            showToast("Error al guardar algunos parámetros", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
            <div style={{ padding: '16px 20px 8px 20px' }}>
                <ContentHeader
                    title="Configuración de Cuentas por Defecto"
                    breadcrumbs={[{ label: 'Contabilidad' }, { label: 'Configuración' }]}
                    actions={
                        <Button variant="primary" onClick={handleSave} disabled={saving}>
                            <Save size={16} style={{ marginRight: 6 }} /> Guardar Configuración
                        </Button>
                    }
                />
            </div>

            <div style={{ flex: 1, padding: '0 20px 20px 20px', overflowY: 'auto' }}>
                <div style={{ 
                    background: '#eef2ff', 
                    border: '1px solid #c7d2fe', 
                    borderRadius: 'var(--r-md)', 
                    padding: '16px 20px', 
                    marginBottom: 24,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: '#4338ca'
                }}>
                    <ShieldCheck size={24} />
                    <div style={{ fontSize: 'var(--text-sm)' }}>
                        Configure aquí las cuentas que el <strong>Motor Contable</strong> utilizará automáticamente al generar asientos de facturas, recibos y pagos.
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 20 }}>
                    {SETTING_KEYS.map(item => (
                        <div key={item.key} style={{ 
                            background: 'white', 
                            padding: 20, 
                            borderRadius: 'var(--r-md)', 
                            border: '1px solid var(--border-color)', 
                            boxShadow: 'var(--shadow-sm)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700 }}>{item.label}</h4>
                                    <p style={{ margin: '4px 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                        {item.description}
                                    </p>
                                </div>
                                <div title="Configurador Automático" style={{ color: 'var(--muted)' }}><HelpCircle size={16} /></div>
                            </div>

                            <AccountSelector 
                                value={settings[item.key] || ""}
                                onChange={(val) => setSettings({ ...settings, [item.key]: val })}
                            />
                        </div>
                    ))}
                </div>
                
                <div style={{ height: 40 }}></div>
            </div>
        </div>
    );
}
