import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { API_URL } from '../../../config';
import { useToast } from '../../../context/ToastContext';

const palette = {
    panel: { background: 'var(--bg-page)', border: '1px solid var(--border-color)', borderRadius: 10, padding: 14 },
    muted: { color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 },
};

export default function EntityImporter({ initialType = 'client', onImportSuccess, onCancel }) {
    const [file, setFile] = useState(null);
    const [entityType, setEntityType] = useState(initialType === 'provider' ? 'provider' : 'client');
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const fileInputRef = useRef(null);
    const { showToast } = useToast();

    const changeFile = event => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        if (!/\.(xlsx|xls)$/i.test(selected.name)) {
            showToast('Seleccioná un archivo Excel .xlsx o .xls.', 'error');
            return;
        }
        setFile(selected);
        setPreview(null);
        setResult(null);
    };

    const changeType = event => {
        setEntityType(event.target.value);
        setPreview(null);
        setResult(null);
    };

    const upload = async dryRun => {
        if (!file || uploading) return;
        setUploading(true);
        try {
            const body = new FormData();
            body.append('file', file);
            const token = localStorage.getItem('token');
            const response = await fetch(
                `${API_URL}/entities/import/?type=${entityType}&dry_run=${dryRun}`,
                { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }
            );
            const data = await response.json();
            if (!response.ok) {
                const detail = data.detail;
                throw new Error(typeof detail === 'string' ? detail : detail?.message || 'No se pudo procesar el Excel.');
            }
            if (dryRun) {
                setPreview(data);
                showToast('Vista previa lista. Revisá los registros antes de confirmar.', 'info');
            } else {
                setResult(data);
                setPreview(null);
                showToast('Importación confirmada.', 'success');
                onImportSuccess?.();
            }
        } catch (error) {
            showToast(error.message || 'No se pudo importar.', 'error');
        } finally {
            setUploading(false);
        }
    };

    const info = result || preview;
    const stats = info?.stats;
    const warnings = [...(stats?.errors || []), ...(stats?.warnings || [])];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: 20, gap: 12, color: 'var(--text)', overflowY: 'auto', background: 'var(--bg-surface, var(--bg-page))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750 }}>Importar clientes o proveedores</h2>
                    <p style={palette.muted}>Cargá tu listado histórico. Se revisa antes de guardar y nunca borra registros.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={onCancel} icon={<X size={18} />} />
            </div>
            {!result && (
                <>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700 }}>
                        Tipo de datos que estás importando
                        <select value={entityType} onChange={changeType}
                            style={{ padding: 9, background: 'var(--bg-page)', color: 'var(--text)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                            <option value="client">Clientes</option>
                            <option value="provider">Proveedores</option>
                        </select>
                    </label>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                        style={{ ...palette.panel, minHeight: 110, display: 'grid', placeItems: 'center', gap: 4, width: '100%', cursor: 'pointer', color: 'var(--text)' }}>
                        <input type="file" ref={fileInputRef} onChange={changeFile} accept=".xlsx,.xls" style={{ display: 'none' }} aria-label="Archivo Excel" />
                        <FileSpreadsheet size={28} />
                        <strong>{file?.name || 'Elegir archivo Excel'}</strong>
                        <span style={palette.muted}>{file ? `${(file.size / 1024).toFixed(1)} KB` : 'Admite .xls y .xlsx · máximo 8 MB'}</span>
                    </button>
                    <div style={{ ...palette.panel, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <AlertCircle size={18} style={{ flexShrink: 0, color: '#f59e0b' }} />
                        <div style={palette.muted}>
                            Las coincidencias por CUIT se actualizan sin sobrescribir datos cargados. Nunca deducimos la condición de IVA solo por el CUIT; verificála antes de facturar.
                        </div>
                    </div>
                </>
            )}
            {stats && (
                <div style={palette.panel}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 750, marginBottom: 12 }}>
                        {result ? <CheckCircle2 size={18} color="#22c55e" /> : <FileSpreadsheet size={18} />}
                        {result ? 'Importación finalizada' : 'Vista previa: todavía no se guardó nada'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13 }}>
                        <span>Nuevos: <strong>{stats.created}</strong></span>
                        <span>Actualizados: <strong>{stats.updated}</strong></span>
                        <span>Mixtos: <strong>{stats.merged}</strong></span>
                        <span>Omitidos: <strong>{stats.skipped}</strong></span>
                    </div>
                    {(info.preview || []).length > 0 && (
                        <div style={{ marginTop: 10, maxHeight: 164, overflowY: 'auto', fontSize: 12 }}>
                            {(info.preview || []).map((row, index) => (
                                <div key={index} style={{ padding: '5px 0', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <span style={{ overflowWrap: 'anywhere' }}>{row.name} {row.tax_id ? `· ${row.tax_id}` : ''}</span>
                                    <span style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>{row.action === 'create' ? 'Nuevo' : row.action === 'merge' ? 'Mixto' : 'Actualiza'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {warnings.length > 0 && (
                        <div style={{ marginTop: 12, fontSize: 12, color: '#f59e0b' }}>
                            <strong>{warnings.length} observaciones para revisar</strong>
                            <div style={{ maxHeight: 94, overflowY: 'auto', marginTop: 4 }}>
                                {warnings.slice(0, 30).map((warning, index) => <div key={index}>• {warning}</div>)}
                            </div>
                        </div>
                    )}
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'auto' }}>
                <Button variant="secondary" onClick={onCancel}>{result ? 'Cerrar' : 'Cancelar'}</Button>
                {!result && (
                    preview
                        ? <Button onClick={() => upload(false)} disabled={uploading || !(stats?.created + stats?.updated)} icon={<Upload size={16} />}>
                            {uploading ? 'Importando...' : 'Confirmar importación'}
                          </Button>
                        : <Button onClick={() => upload(true)} disabled={!file || uploading} icon={<FileSpreadsheet size={16} />}>
                            {uploading ? 'Analizando...' : 'Ver vista previa'}
                          </Button>
                )}
            </div>
        </div>
    );
}
