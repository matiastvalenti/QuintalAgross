import React, { useState, useEffect, useRef } from 'react';
import { Printer, FileDown, X, Eye, EyeOff, Layout, DraftingCompass, Truck, Ghost, Save, RefreshCcw, Trash2, FileText } from 'lucide-react';
import { 
    generateSalesOrderPdfBlob, 
    generateDeliveryNotePdfBlob 
} from '../../services/SalesOrderPdf';
import { API_URL } from '../../config';
import s from './PdfViewer.module.css';

const labels = {
    date: "FECHA",
    clientName: "CLIENTE",
    clientAddress: "DOMICILIO",
    clientIva: "IVA",
    clientCuit: "CUIT CLIENTE",
    paymentCondition: "COND. PAGO",
    dueDate: "VTO",
    transport: "TRANSPORTE",
    transportCuit: "CHOFER / CUIT",
    noteNumber: "NRO REMITO",
    logo: "LOGO EMPRESA",
    observations: "OBSERVACIONES",
    totalsSummary: "RESUMEN (NETO/IVA/TC)",
    table: "INICIO PRODUCTOS",
    total: "TOTAL FINAL",
    driverName: "NOMBRE CHOFER",
    vehiclePlate: "PATENTE",
    vendedor: "VENDEDOR",
    origin_reference: "REF. ORIGEN",
    subtotal: "SUBTOTAL NETO",
    iva_amount: "MONTO IVA"
};

export default function PdfViewer({ order, entities, products, docType = 'sales-order' }) {
    const isRemito = docType === 'delivery-note';
    const isInvoice = docType === 'invoice';

    const [pdfUrl, setPdfUrl] = useState(null);
    const [template, setTemplate] = useState('full'); // 'full' or 'no-prices' or 'pre-printed'
    const [saleConditions, setSaleConditions] = useState([]);
    const [showBackground, setShowBackground] = useState(true);
    const [designMode, setDesignMode] = useState(false);
    const [selectedField, setSelectedField] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    
    // Cargar posiciones iniciales desde localStorage o usar las de defecto
    const [fieldPositions, setFieldPositions] = useState(() => {
        const fallbackKey = isInvoice ? 'invoice_field_positions' : 'remito_field_positions';
        const defaults = {
            logo: { x: 15, y: 10, size: 0 },
            noteNumber: { x: 160, y: 25, size: 11 },
            date: { x: 160, y: 32, size: 10 },
            clientName: { x: 28, y: 52, size: 10 },
            clientAddress: { x: 28, y: 58, size: 9 },
            clientIva: { x: 28, y: 64, size: 9 },
            clientCuit: { x: 160, y: 64, size: 9 },
            paymentCondition: { x: 28, y: 70, size: 9 },
            dueDate: { x: 160, y: 70, size: 9 },
            transport: { x: 28, y: 76, size: 9 },
            transportCuit: { x: 28, y: 82, size: 9 },
            table: { x: 22, y: 104, size: 9 },
            totalsSummary: { x: 150, y: 240, size: 9 },
            total: { x: 198, y: 262, size: 12 },
            observations: { x: 28, y: 240, size: 9 },
            driverName: { x: 28, y: 88, size: 9 },
            vehiclePlate: { x: 160, y: 88, size: 9 }
        };
        const saved = localStorage.getItem(fallbackKey);
        if (!saved) return defaults;
        
        const parsed = JSON.parse(saved);
        // Ensure all defaults have a size
        const merged = { ...defaults };
        Object.keys(parsed).forEach(k => {
            merged[k] = { ...defaults[k], ...parsed[k] };
        });
        
        return merged;
    });

    // Guardar posiciones cada vez que cambien (localStorage fallback)
    useEffect(() => {
        const fallbackKey = isInvoice ? 'invoice_field_positions' : 'remito_field_positions';
        localStorage.setItem(fallbackKey, JSON.stringify(fieldPositions));
    }, [fieldPositions, isInvoice]);

    // Cargar desde API al iniciar o cambiar tipo
    useEffect(() => {
        if (template === 'pre-printed') {
            const configKey = `${docType}-${template}`;
            fetch(`${API_URL}/config/pdf/${configKey}`)
                .then(res => {
                    if (!res.ok) throw new Error("No config");
                    return res.json();
                })
                .then(data => {
                    if (data && data.positions) {
                        setFieldPositions(prev => ({...prev, ...data.positions}));
                    }
                })
                .catch(err => console.log("Using local/default config:", err));
        }
    }, [docType, template]);

    const handleSaveConfig = async () => {
        const configKey = `${docType}-${template}`;
        try {
            const res = await fetch(`${API_URL}/config/pdf/${configKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions: fieldPositions })
            });
            if (res.ok) {
                alert("Diseño guardado correctamente en el servidor.");
            } else {
                throw new Error("Error al guardar");
            }
        } catch (err) {
            console.error(err);
            alert("Error al guardar el diseño en el servidor.");
        }
    };

    const handleReset = () => {
        if (window.confirm("¿Estás seguro de que deseas restablecer todas las posiciones? Perderás los cambios actuales.")) {
            // we will just clear localStorage and fetch again
            const fallbackKey = isInvoice ? 'invoice_field_positions' : 'remito_field_positions';
            localStorage.removeItem(fallbackKey);
            window.location.reload();
        }
    };

    const iframeRef = useRef(null);

    useEffect(() => {
        if (!isRemito) {
            fetch(`${API_URL}/sales/sale-conditions/`)
                .then(res => res.json())
                .then(data => setSaleConditions(data))
                .catch(err => console.error(err));
        }
    }, [isRemito]);

    useEffect(() => {
        // No regenerar el PDF mientras se arrastra para evitar parpadeos
        if (isDragging) return;

        const generatePdf = async () => {
            if (order) {
                const options = { 
                    hidePrices: template === 'no-prices', 
                    showBackground,
                    fieldPositions,
                    hideData: designMode
                };
                let blob;
                try {
                    if (isInvoice) {
                        options.templateUrl = `${API_URL}/templates/Factura_Nro_100012698%20(1)%20(1).pdf`;
                    }
                    if (isRemito || (isInvoice && template === 'pre-printed')) {
                        blob = await generateDeliveryNotePdfBlob(order, entities || [], products || [], { ...options, template });
                    } else if (isInvoice) {
                        // TODO: Full Standard Invoice generation logic when template === 'full'
                        // For now we will just use the same as SalesOrder if they pick full, but invoice needs different handling
                        blob = await generateSalesOrderPdfBlob(order, entities || [], products || [], options, saleConditions);
                    } else {
                        blob = await generateSalesOrderPdfBlob(order, entities || [], products || [], options, saleConditions);
                    }
                    
                    const url = URL.createObjectURL(blob);
                    setPdfUrl(url);
                    
                    return url;
                } catch (err) {
                    console.error("Error generating PDF:", err);
                }
            }
        };

        const timer = setTimeout(() => {
            generatePdf();
        }, designMode ? 300 : 0); // Un pequeño delay en modo diseño

        return () => {
            clearTimeout(timer);
        };
    }, [order, entities, products, template, docType, saleConditions, showBackground, fieldPositions, isDragging, designMode]);

    const handlePrint = () => {
        if (iframeRef.current) {
            iframeRef.current.contentWindow.print();
        }
    };

    const handleSaveAs = async () => {
        let fileName = isRemito ? `Remito_${order.number}.pdf` : `OrdenVenta_${order.number}.pdf`;
        if (isInvoice) fileName = `Factura_${order.number}.pdf`;
        try {
            if (!window.showSaveFilePicker) {
                const link = document.createElement('a');
                link.href = pdfUrl;
                link.download = fileName;
                link.click();
                return;
            }

            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'Documento PDF',
                    accept: { 'application/pdf': ['.pdf'] },
                }],
            });

            const writable = await handle.createWritable();
            const options = { hidePrices: template === 'no-prices', showBackground: false }; // Never save with reference bg
            if (isInvoice) {
                options.templateUrl = `${API_URL}/templates/Factura_Nro_100012698%20(1)%20(1).pdf`;
            }
            let blob;
            if (isRemito || (isInvoice && template === 'pre-printed')) {
                blob = await generateDeliveryNotePdfBlob(order, entities || [], products || [], { ...options, template });
            } else {
                blob = await generateSalesOrderPdfBlob(order, entities || [], products || [], options, saleConditions);
            }
            await writable.write(blob);
            await writable.close();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Save error:", err);
            }
        }
    };

    if (!order) return <div className={s.error}>Sin datos de orden</div>;

    let docLabel = isRemito ? 'Remito' : 'Orden de Venta';
    if (isInvoice) docLabel = 'Factura';

    return (
        <div className={s.viewerContainer}>
            <div className={s.sidebar}>
                <div className={s.sidebarHeader}>
                    <div className={s.brand}>
                        <FileText size={24} color="#6366f1" style={{ marginRight: 10 }} />
                        <span className={s.brandText}>VISOR</span>
                        <span className={s.brandDot}>.</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginTop: 4, letterSpacing: 1 }}>
                        QUINTAL AGROSS ERP
                    </div>
                </div>

                <div className={s.sidebarSection}>
                    <label className={s.sectionLabel}>Tipo de Documento</label>
                    <div className={s.templateSelector}>
                        <button 
                            className={`${s.templateBtn} ${template === 'full' ? s.templateBtnActive : ''}`}
                            onClick={() => setTemplate('full')}
                        >
                            <Layout size={16} />
                            {isRemito ? 'Remito Estándar' : (isInvoice ? 'Factura Estándar' : 'Comprobante Estándar')}
                        </button>
                        {(isRemito || isInvoice) && (
                            <button 
                                className={`${s.templateBtn} ${template === 'pre-printed' ? s.templateBtnActive : ''}`}
                                onClick={() => setTemplate('pre-printed')}
                            >
                                <DraftingCompass size={16} />
                                {isInvoice ? 'Factura Pre-impresa' : 'Remito Pre-impreso'}
                            </button>
                        )}
                        {!isRemito && !isInvoice && (
                            <button 
                                className={`${s.templateBtn} ${template === 'no-prices' ? s.templateBtnActive : ''}`}
                                onClick={() => setTemplate('no-prices')}
                            >
                                <Truck size={16} />
                                Sin Precios (Logística)
                            </button>
                        )}
                    </div>
                </div>

                {template === 'pre-printed' && (
                    <div className={s.sidebarSection}>
                        <label className={s.sectionLabel}>Herramientas de Diseño</label>
                        <button 
                            className={`${s.actionBtn} ${designMode ? s.templateBtnActive : ''}`} 
                            onClick={() => setDesignMode(!designMode)}
                        >
                            {designMode ? <EyeOff size={16} /> : <Eye size={16} />}
                            <span>{designMode ? 'Ocultar Canvass' : 'Modo Diseño (Arrastrar)'}</span>
                        </button>

                        {designMode && (
                            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <button 
                                    className={`${s.actionBtn} ${s.actionBtnSecondary}`} 
                                    onClick={() => setShowBackground(!showBackground)}
                                >
                                    {showBackground ? <Ghost size={16} /> : <FileText size={16} />}
                                    <span>{showBackground ? 'Ocultar Fondo' : 'Ver PDF de Fondo'}</span>
                                </button>

                                <button 
                                    className={`${s.actionBtn}`} 
                                    onClick={handleSaveConfig}
                                    style={{ backgroundColor: '#10b981', color: 'white' }}
                                >
                                    <Save size={16} />
                                    <span>Guardar en Servidor</span>
                                </button>

                                <button 
                                    className={`${s.actionBtn} ${s.actionBtnSecondary}`} 
                                    onClick={handleReset}
                                    style={{ color: '#f87171' }}
                                >
                                    <RefreshCcw size={16} />
                                    <span>Resetear Posiciones</span>
                                </button>
                                
                                <div style={{ fontSize: 10, color: '#94a3b8', padding: '0 4px', lineHeight: 1.4 }}>
                                    💡 Click para seleccionar campo y arrastrar para reubicar.
                                </div>

                                {selectedField && (
                                    <div className={s.fieldControls}>
                                        <div className={s.controlRow}>
                                            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Campo Seleccionado</span>
                                            <div style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>{labels[selectedField]}</div>
                                        </div>
                                        <div className={s.controlRow}>
                                            <span>Tamaño Fuente: {fieldPositions[selectedField]?.size || 9}pt</span>
                                            <input 
                                                type="range" 
                                                min="5" 
                                                max="24" 
                                                step="0.5"
                                                value={fieldPositions[selectedField]?.size || 9}
                                                onChange={(e) => {
                                                    const size = parseFloat(e.target.value);
                                                    setFieldPositions(prev => ({
                                                        ...prev,
                                                        [selectedField]: { ...prev[selectedField], size }
                                                    }));
                                                }}
                                            />
                                        </div>
                                        <button 
                                            className={s.removeFieldBtn}
                                            onClick={() => {
                                                const next = { ...fieldPositions };
                                                delete next[selectedField];
                                                setFieldPositions(next);
                                                setSelectedField(null);
                                            }}
                                        >
                                            <Trash2 size={12} style={{ marginRight: 6 }} />
                                            Eliminar de la plantilla
                                        </button>
                                    </div>
                                )}

                                <div className={s.addFieldSection}>
                                    <label className={s.sectionLabel}>Agregar más datos</label>
                                    <select 
                                        className={s.addFieldSelect}
                                        onChange={(e) => {
                                            const key = e.target.value;
                                            if (!key) return;
                                            setFieldPositions(prev => ({
                                                ...prev,
                                                [key]: { x: 50, y: 50, size: 9 }
                                            }));
                                            setSelectedField(key);
                                            e.target.value = "";
                                        }}
                                    >
                                        <option value="">Seleccionar campo...</option>
                                        {Object.entries(labels)
                                            .filter(([key]) => !fieldPositions[key])
                                            .map(([key, label]) => (
                                                <option key={key} value={key}>{label}</option>
                                            ))
                                        }
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className={s.sidebarSection}>
                    <label className={s.sectionLabel}>Acciones Finales</label>
                    <div className={s.actions}>
                        <button className={s.actionBtn} onClick={handlePrint}>
                            <Printer size={18} />
                            <span>Imprimir Ahora</span>
                        </button>
                        
                        <button className={s.actionBtn} onClick={handleSaveAs}>
                            <FileDown size={18} />
                            <span>Bajar PDF</span>
                        </button>
                    </div>
                </div>

                <div className={s.info}>
                    <div className={s.infoItem}>
                        <label>Comprobante</label>
                        <p>{order.number || "RE-0000"}</p>
                    </div>
                    <div className={s.infoItem}>
                        <label>Titular</label>
                        <p>{order.entity_name || (entities && entities.find(e => e.id === order.entity_id)?.name) || "S/D"}</p>
                    </div>
                    {!isRemito && (
                        <div className={s.infoItem}>
                            <label>Importe Bruto</label>
                            <p>{order.currency} {Number(order.total_amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                        </div>
                    )}
                </div>
            </div>

            <div className={s.content}>
                <div className={s.viewerWrapper}>
                    {pdfUrl && (
                        <iframe 
                            ref={iframeRef}
                            src={`${pdfUrl}#toolbar=0&navpanes=0`} 
                            className={s.pdfIframe}
                            title="PDF Preview"
                            style={{ 
                                pointerEvents: designMode ? 'none' : 'auto',
                                opacity: designMode ? 0.8 : 1
                            }}
                        />
                    )}
                    
                    {designMode && template === 'pre-printed' && (
                        <div className={s.overlayEditor}>
                            <DesignCanvas 
                                fieldPositions={fieldPositions} 
                                setFieldPositions={setFieldPositions}
                                order={order}
                                entities={entities}
                                selectedField={selectedField}
                                setSelectedField={setSelectedField}
                                setIsDragging={setIsDragging}
                            />
                        </div>
                    )}

                    {!pdfUrl && <div className={s.loading}>Generando Vista SaaS 2026...</div>}
                </div>
            </div>
        </div>
    );
}

function DesignCanvas({ fieldPositions, setFieldPositions, order, entities, selectedField, setSelectedField, setIsDragging }) {
    const canvasRef = useRef(null);
    const [dragging, setDragging] = useState(null);

    // Escala del editor: 1mm = 3.779px (estándar de navegadores para 96dpi)
    const scale = 3.7795; 

    const handleMouseDown = (key) => (e) => {
        setDragging(key);
        setIsDragging(true);
        setSelectedField(key);
        e.preventDefault();
        e.stopPropagation();
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!dragging || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            
            // Coordenadas en mm
            const x = Math.max(0, Math.min(210, (e.clientX - rect.left) / scale));
            const y = Math.max(0, Math.min(297, (e.clientY - rect.top) / scale));
            
            setFieldPositions(prev => ({
                ...prev,
                [dragging]: { ...prev[dragging], x, y }
            }));
        };

        const handleMouseUp = () => {
            setDragging(null);
            setIsDragging(false);
        };

        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, scale, setFieldPositions, setIsDragging]);


    const getRealValue = (key) => {
        if (!order) return "";
        const entity = entities?.find((e) => e.id === order.entity_id) || {};
        
        // Calcular totales reales para evitar fallbacks erróneos
        const calculatedTotal = order.total_amount || order.lines?.reduce((sum, l) => sum + (l.total_amount || 0), 0) || 0;
        const calculatedNet = order.subtotal || order.lines?.reduce((sum, l) => sum + ((l.qty * l.unit_price) || 0), 0) || 0;
        const calculatedIva = order.iva_amount || order.lines?.reduce((sum, l) => sum + (l.tax_amount || 0), 0) || (calculatedTotal - calculatedNet);

        switch(key) {
            case 'date': return order.date ? new Date(order.date).toLocaleDateString("es-AR") : "-";
            case 'clientName': return entity.name || "-";
            case 'clientAddress': return entity.address ? `${entity.address || ""}${entity.city ? `, ${entity.city}` : ""}` : "-";
            case 'clientIva': return entity.tax_condition || "-";
            case 'clientCuit': return entity.tax_id || "-";
            case 'paymentCondition': return order.payment_condition || "-";
            case 'dueDate': {
                const rawDueDate = order.due_date || order.expiration_date || order.vto || null;
                if (!rawDueDate) return "-";
                const d = new Date(rawDueDate);
                return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("es-AR");
            }
            case 'transport': return order.transport || order.vehicle_id || "-";
            case 'transportCuit': return order.transport_cuit || order.vehicle_driver || "-";
            case 'noteNumber': return order.number || "-";
            case 'total': return Number(calculatedTotal).toLocaleString("es-AR", { minimumFractionDigits: 2 });
            case 'observations': return order.notes || order.observations || "-";
            case 'driverName': return order.vehicle_driver || "-";
            case 'vehiclePlate': return order.vehicle_id || "-";
            case 'vendedor': return order.vendedor || "-";
            case 'origin_reference': return order.origin_reference || "-";
            case 'subtotal': return Number(calculatedNet).toLocaleString("es-AR", { minimumFractionDigits: 2 });
            case 'iva_amount': return Number(calculatedIva).toLocaleString("es-AR", { minimumFractionDigits: 2 });
            default: return "";
        }
    };

    return (
        <div 
            ref={canvasRef}
            className={s.canvasA4}
            style={{ 
                width: 210 * scale, 
                height: 297 * scale
            }}
            onDragStart={(e) => e.preventDefault()}
        >
            {Object.keys(fieldPositions).map(key => (
                <div 
                    key={key}
                    onMouseDown={handleMouseDown(key)}
                    className={`${s.dragItem} ${dragging === key ? s.isDragging : ''} ${selectedField === key ? s.isSelected : ''}`}
                    style={{
                        left: fieldPositions[key].x * scale,
                        top: fieldPositions[key].y * scale,
                        zIndex: selectedField === key ? 30 : 20
                    }}
                >
                    <div className={s.itemAnchor}>
                        <div className={s.itemDot}></div>
                        <span className={s.itemLabel}>{labels[key]}</span>
                    </div>
                    {key !== 'logo' && key !== 'table' && (
                        <div 
                            className={s.itemValuePreview}
                            style={{ 
                                fontSize: (fieldPositions[key].size || 9) * 1.33,
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            {key === 'totalsSummary' ? (() => {
                                const total = order.total_amount || order.lines?.reduce((sum, l) => sum + (l.total_amount || 0), 0) || 0;
                                const net = order.subtotal || order.lines?.reduce((sum, l) => sum + ((l.qty * l.unit_price) || 0), 0) || 0;
                                const iva = order.iva_amount || order.lines?.reduce((sum, l) => sum + (l.tax_amount || 0), 0) || (total - net);
                                return (
                                    <>
                                        <span>Neto: {Number(net).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                        <span style={{ marginTop: '0.5mm' }}>IVA: {Number(iva).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                    </>
                                );
                            })() : getRealValue(key)}
                        </div>
                    )}
                </div>
            ))}
            
            {fieldPositions.table && (
                <div 
                    className={s.tableGuide}
                    style={{
                        left: fieldPositions.table.x * scale,
                        top: fieldPositions.table.y * scale,
                        width: 190 * scale,
                        height: 140 * scale,
                        borderTop: '2px solid #2563eb'
                    }}
                >
                    {/* Preview Rows */}
                    <div className={s.tableRowsPreview}>
                        {(order.lines && order.lines.length > 0 ? order.lines.slice(0, 15) : [
                            { qty: 40, description: "PRODUCTO DE EJEMPLO 1", unit_price: 2.00, total_amount: 80.00 },
                            { qty: 10, description: "PRODUCTO DE EJEMPLO 2", unit_price: 15.50, total_amount: 155.00 }
                        ]).map((line, i) => (
                            <div 
                                key={i} 
                                className={s.tableRowPreview} 
                                style={{ 
                                    top: (i * 6.45) * scale,
                                    fontSize: (fieldPositions.table.size || 9) * 1.33
                                }}
                            >
                                <span style={{ position: 'absolute', left: 0 }}>{Number(line.qty || 0).toLocaleString("es-AR", { minimumFractionDigits: 1 })}</span>
                                <span style={{ position: 'absolute', left: 16 * scale }}>{line.description}</span>
                                <span style={{ position: 'absolute', left: 145 * scale }}>
                                    {Number(line.unit_price || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </span>
                                <span style={{ position: 'absolute', left: 178 * scale }}>{Number(line.total_amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
