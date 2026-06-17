import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config';
import { Plus, Trash2, Edit2, Search } from 'lucide-react';
import t from '../../components/ui/Table.module.css';

export default function LedgerPage() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [formData, setFormData] = useState({ code: "", name: "", active: true });

    const { showToast } = useToast();

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/accounting/accounts-ledger/`);
            if (res.ok) {
                const data = await res.json();
                setAccounts(data);
            }
        } catch (e) {
            showToast("Error al cargar el plan de cuentas", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.code || !formData.name) {
            showToast("Código y nombre son obligatorios", "warning");
            return;
        }

        try {
            const method = editingAccount ? 'PUT' : 'POST';
            const url = editingAccount
                ? `${API_URL}/accounting/accounts-ledger/${editingAccount.id}`
                : `${API_URL}/accounting/accounts-ledger/`;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                showToast("Cuenta guardada correctamente", "success");
                setIsModalOpen(false);
                fetchAccounts();
            } else {
                const error = await res.json();
                showToast(error.detail || "Error al guardar", "error");
            }
        } catch (e) {
            showToast("Error de conexión", "error");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Está seguro de eliminar esta cuenta?")) return;

        try {
            const res = await fetch(`${API_URL}/accounting/accounts-ledger/${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast("Cuenta eliminada", "success");
                fetchAccounts();
            }
        } catch (e) {
            showToast("Error al eliminar", "error");
        }
    };

    const filtered = accounts.filter(a =>
        a.code.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
            <div style={{ padding: '16px 20px 8px 20px' }}>
                <ContentHeader
                    title="Plan de Cuentas (ARCA)"
                    breadcrumbs={[{ label: 'Contabilidad' }, { label: 'Plan de Cuentas' }]}
                    actions={
                        <Button
                            onClick={() => {
                                setEditingAccount(null);
                                setFormData({ code: "", name: "", active: true });
                                setIsModalOpen(true);
                            }}
                        >
                            <Plus size={16} style={{ marginRight: 6 }} /> Nueva Cuenta
                        </Button>
                    }
                />
            </div>

            <div style={{ flex: 1, padding: '0 20px 20px 20px', overflowY: 'auto' }}>
                <div style={{ marginBottom: 16, maxWidth: 400 }}>
                    <Input
                        placeholder="Buscar por código o nombre..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div style={{ background: 'white', borderRadius: 'var(--r-md)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                    <table className={t.table}>
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Nombre</th>
                                <th>Estado</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Cargando cuentas...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                                    {search ? 'No se encontraron cuentas con ese criterio.' : 'No hay cuentas configuradas. Agregue la primera cuenta.'}
                                </td></tr>
                            ) : filtered.map(a => (
                                <tr key={a.id}>
                                    <td>
                                        <code style={{ fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 6 }}>
                                            {a.code}
                                        </code>
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                                    <td>
                                        <span style={{
                                            padding: '2px 10px',
                                            borderRadius: 100,
                                            fontSize: 'var(--text-xs)',
                                            fontWeight: 600,
                                            background: a.active ? 'var(--primary-light)' : 'var(--bg-page)',
                                            color: a.active ? 'var(--primary)' : 'var(--text-secondary)',
                                            textTransform: 'uppercase'
                                        }}>
                                            {a.active ? 'Activa' : 'Inactiva'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                setEditingAccount(a);
                                                setFormData({ code: a.code, name: a.name, active: a.active });
                                                setIsModalOpen(true);
                                            }} title="Editar">
                                                <Edit2 size={15} />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} style={{ color: 'var(--danger)' }} title="Eliminar">
                                                <Trash2 size={15} />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingAccount ? "Editar Cuenta Contable" : "Nueva Cuenta Contable"}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Input
                        label="Código de Cuenta"
                        value={formData.code}
                        onChange={e => setFormData({ ...formData, code: e.target.value })}
                        placeholder="Ej: 4.1.1.001"
                    />
                    <Input
                        label="Nombre"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Ventas de Herbicidas"
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={formData.active}
                            onChange={e => setFormData({ ...formData, active: e.target.checked })}
                        />
                        Cuenta Activa
                    </label>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSave}>Guardar Cuenta</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
