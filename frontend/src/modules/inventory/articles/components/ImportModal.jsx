import React, { useState } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import Button from '../../../../components/ui/Button';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function ImportModal({ open, onClose, onImportSuccess }) {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [resetDb, setResetDb] = useState(false);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'))) {
            setFile(selectedFile);
            setError(null);
        } else {
            setFile(null);
            setError('Por favor selecciona un archivo Excel (.xlsx o .xls)');
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setLoading(true);
        setError(null);
        setResult(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_URL}/inventory/products/import/?reset=${resetDb}`, {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                setResult(data.stats);
                if (onImportSuccess) onImportSuccess();
            } else {
                const errData = await res.json();
                setError(errData.detail || 'Error al importar archivo');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión con el servidor');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setFile(null);
        setResult(null);
        setError(null);
        setLoading(false);
        setResetDb(false);
    };

    return (
        <Modal 
            open={open} 
            onClose={() => { onClose(); reset(); }}
            title="Importar Artículos desde Excel"
            size="md"
        >
            <div style={{ padding: '20px 0' }}>
                {!result ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div 
                            style={{
                                border: '2px dashed #e2e8f0',
                                borderRadius: 12,
                                padding: '40px 20px',
                                textAlign: 'center',
                                background: '#f8fafc',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative'
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const droppedFile = e.dataTransfer.files[0];
                                if (droppedFile) {
                                    handleFileChange({ target: { files: [droppedFile] } });
                                }
                            }}
                        >
                            <input 
                                type="file" 
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                style={{
                                    position: 'absolute',
                                    top: 0, left: 0, width: '100%', height: '100%',
                                    opacity: 0, cursor: 'pointer'
                                }}
                            />
                            
                            {file ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                    <FileText size={48} color="#3b82f6" />
                                    <div>
                                        <p style={{ fontWeight: 600, color: '#1e293b' }}>{file.name}</p>
                                        <p style={{ fontSize: 12, color: '#64748b' }}>{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>Cambiar archivo</Button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                                        <Upload size={32} color="#3b82f6" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 600, color: '#1e293b' }}>Selecciona tu Excel aquí</p>
                                        <p style={{ fontSize: 13, color: '#64748b' }}>Soporta .xlsx y .xls</p>
                                    </div>
                                    <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Columnas recomendadas: Rubro, Subrubro, Nombre, IVA</p>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 13 }}>
                                <AlertCircle size={18} />
                                <span>{error}</span>
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
                            <input 
                                type="checkbox" 
                                id="resetDb" 
                                checked={resetDb} 
                                onChange={(e) => setResetDb(e.target.checked)}
                                style={{ width: 18, height: 18, cursor: 'pointer' }}
                            />
                            <label htmlFor="resetDb" style={{ fontSize: 13, color: '#475569', cursor: 'pointer', fontWeight: 500 }}>
                                Eliminar artículos existentes y empezar de cero (Recomendado)
                            </label>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                            <Button 
                                variant="primary" 
                                onClick={handleUpload}
                                disabled={!file || loading}
                                style={{ minWidth: 120 }}
                            >
                                {loading ? (
                                    <><Loader2 size={16} className="animate-spin" style={{marginRight: 8}} /> Importando...</>
                                ) : 'Iniciar Importación'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <CheckCircle size={64} color="#10b981" style={{ marginBottom: 16 }} />
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Importación Completada</h3>
                        <p style={{ color: '#64748b', marginBottom: 24 }}>Se han procesado todos los registros del archivo.</p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
                            <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 12 }}>
                                <p style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>{result.created}</p>
                                <p style={{ fontSize: 12, color: '#059669', textTransform: 'uppercase' }}>Creados</p>
                            </div>
                            <div style={{ padding: 16, background: result.errors.length > 0 ? '#fef2f2' : '#f8fafc', borderRadius: 12 }}>
                                <p style={{ fontSize: 24, fontWeight: 700, color: result.errors.length > 0 ? '#dc2626' : '#94a3b8' }}>{result.errors.length}</p>
                                <p style={{ fontSize: 12, color: result.errors.length > 0 ? '#dc2626' : '#94a3b8', textTransform: 'uppercase' }}>Errores</p>
                            </div>
                        </div>

                        {result.errors.length > 0 && (
                            <div style={{ textAlign: 'left', marginBottom: 24 }}>
                                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>Detalle de errores:</p>
                                <div style={{ maxHeight: 120, overflowY: 'auto', background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                                    {result.errors.map((err, i) => (
                                        <div key={i} style={{ marginBottom: 4 }}>• {err}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <Button variant="primary" onClick={() => { onClose(); reset(); }} style={{ width: '100%' }}>Finalizar</Button>
                    </div>
                )}
            </div>
            
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </Modal>
    );
}
