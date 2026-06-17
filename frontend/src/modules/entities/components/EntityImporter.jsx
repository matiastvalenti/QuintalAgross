import React, { useState, useRef } from 'react'; 
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { API_URL } from '../../../config';
import { useToast } from '../../../context/ToastContext';

export default function EntityImporter({ onImportSuccess, onCancel }) {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [reset, setReset] = useState(false);
    const fileInputRef = useRef(null);
    const { showToast } = useToast();

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
                showToast("Por favor seleccione un archivo Excel (.xlsx o .xls)", "error");
                return;
            }
            setFile(selectedFile);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        setResult(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_URL}/entities/import/?reset=${reset}`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Error en la importación");
            }

            const data = await res.json();
            setResult(data);
            showToast("Importación completada con éxito", "success");
            if (onImportSuccess) onImportSuccess();
        } catch (err) {
            console.error(err);
            showToast(err.message, "error");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Importar Entidades</h2>
                    <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                        Arrastre o seleccione sus archivos de Clientes y Proveedores.
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={onCancel} icon={<X size={18} />} />
            </div>

            {!result ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            flex: 1,
                            border: '2px dashed #e2e8f0',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px',
                            cursor: 'pointer',
                            background: file ? '#f8fafc' : 'white',
                            transition: 'all 0.2s ease',
                            textAlign: 'center'
                        }}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept=".xlsx, .xls"
                            style={{ display: 'none' }}
                        />
                        {file ? (
                            <>
                                <FileSpreadsheet size={48} color="var(--primary)" style={{ marginBottom: '16px' }} />
                                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '15px' }}>{file.name}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                    {(file.size / 1024).toFixed(1)} KB - Listo para procesar
                                </div>
                            </>
                        ) : (
                            <>
                                <Upload size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
                                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '15px' }}>Haz clic o arrastra tu Excel aquí</div>
                                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', maxWidth: '300px' }}>
                                    El sistema detectará automáticamente si son clientes o proveedores y unirá los duplicados por CUIT o Razón Social.
                                </p>
                            </>
                        )}
                    </div>

                    <div style={{ 
                        padding: '16px', 
                        background: '#fff7ed', 
                        borderRadius: '10px', 
                        border: '1px solid #fed7aa',
                        display: 'flex',
                        gap: '12px'
                    }}>
                        <AlertCircle size={20} color="#f97316" style={{ flexShrink: 0 }} />
                        <div style={{ fontSize: '12px', color: '#9a3412', lineHeight: '1.5' }}>
                            <strong>Consejo:</strong> Si una entidad aparece en ambos archivos (Cliente y Proveedor), el sistema la marcará automáticamente como <strong>"Mixto"</strong> y combinará sus datos.
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px' }}>
                        <input 
                            type="checkbox" 
                            id="resetEntities" 
                            checked={reset} 
                            onChange={(e) => setReset(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label htmlFor="resetEntities" style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600, cursor: 'pointer' }}>
                            Eliminar todos los clientes y proveedores existentes antes de importar
                        </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
                        <Button 
                            onClick={handleUpload} 
                            disabled={!file || uploading}
                            icon={<Upload size={18} />}
                        >
                            {uploading ? 'Importando...' : 'Comenzar Importación'}
                        </Button>
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ 
                        width: '64px', 
                        height: '64px', 
                        borderRadius: '50%', 
                        background: '#dcfce7', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        marginBottom: '20px'
                    }}>
                        <CheckCircle2 size={32} color="#16a34a" />
                    </div>
                    <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: 0 }}>¡Proceso Finalizado!</h3>
                    <p style={{ color: '#64748b', marginTop: '8px', marginBottom: '32px' }}>Los datos se han procesado correctamente.</p>

                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(3, 1fr)', 
                        gap: '16px', 
                        width: '100%', 
                        maxWidth: '500px',
                        marginBottom: '40px'
                    }}>
                        <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary)' }}>{result.stats.created}</div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginTop: '4px' }}>Creados</div>
                        </div>
                        <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a' }}>{result.stats.updated}</div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginTop: '4px' }}>Actualizados</div>
                        </div>
                        <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: '#8b5cf6' }}>{result.stats.merged}</div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginTop: '4px' }}>Unificados</div>
                        </div>
                    </div>

                    {result.stats.errors.length > 0 && (
                        <div style={{ width: '100%', maxWidth: '500px', textAlign: 'left', marginBottom: '24px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertCircle size={14} /> Errores detectados ({result.stats.errors.length})
                            </div>
                            <div style={{ 
                                maxHeight: '120px', 
                                overflowY: 'auto', 
                                padding: '12px', 
                                background: '#fef2f2', 
                                borderRadius: '8px', 
                                border: '1px solid #fee2e2',
                                fontSize: '11px',
                                color: '#b91c1c'
                            }}>
                                {result.stats.errors.slice(0, 50).map((err, i) => <div key={i} style={{ marginBottom: '4px' }}>• {err}</div>)}
                            </div>
                        </div>
                    )}

                    <Button onClick={onCancel} variant="primary" size="lg">Entendido, Volver</Button>
                </div>
            )}
        </div>
    );
}
