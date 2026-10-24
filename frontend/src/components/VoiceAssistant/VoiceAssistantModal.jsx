import React, { useEffect, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowRight, CheckCircle2, Eraser, Loader2, Mic, MicOff,
    Send, ShieldAlert, Sparkles, X
} from 'lucide-react';
import s from './VoiceAssistantModal.module.css';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useWindow } from '../../context/WindowContext';

const OPERATIONS = {
    sales_order: { label: 'Orden de venta', open: 'Abrir orden de venta' },
    purchase_order: { label: 'Orden de compra', open: 'Abrir orden de compra' },
    sales_invoice: { label: 'Factura de venta', open: 'Preparar orden de venta previa' },
    purchase_invoice: { label: 'Factura de compra', open: 'Preparar orden de compra previa' },
    sales_delivery_note: { label: 'Remito de venta', open: 'Preparar orden de venta previa' },
    receipt: { label: 'Recibo de cliente', open: 'Abrir recibo' },
    payment: { label: 'Orden de pago', open: 'Abrir orden de pago' },
    unknown: { label: 'Operación no identificada', open: 'Revisá el texto' },
};
const SALES_DOCUMENTS = ['sales_order', 'sales_invoice', 'sales_delivery_note'];
const PURCHASE_DOCUMENTS = ['purchase_order', 'purchase_invoice'];
const NEEDS_PREVIOUS_ORDER = ['sales_invoice', 'purchase_invoice', 'sales_delivery_note'];
const formatNumber = value => value == null ? 'Sin indicar' : Number(value).toLocaleString('es-AR', { maximumFractionDigits: 3 });

const normalizeUnit = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const isPackageUnit = unit => /\b(bidones?|bolsas?|frascos?|tambores?|envases?|cajas?|packs?|paquetes?)\b/i.test(normalizeUnit(unit));
const requestedKind = unit => {
    const normalized = normalizeUnit(unit);
    if (/\b(l|lt|lts|litros?)\b/.test(normalized)) return 'L';
    if (/\b(kg|kgs|kilos?|kilogramos?)\b/.test(normalized)) return 'KG';
    return null;
};
const catalogKind = unit => {
    const normalized = normalizeUnit(unit);
    if (/^(l|lt|lts|litros?)$/.test(normalized)) return 'L';
    if (/^(kg|kgs|kilos?|kilogramos?)$/.test(normalized)) return 'KG';
    return null;
};
const incompatibleUnit = line => {
    const asked = requestedKind(line.unit);
    const configured = catalogKind(line.unit_of_measure);
    return Boolean(asked && configured && asked !== configured);
};
const packageCount = line => {
    const factor = Number(line.quantity_per_container);
    const qty = Number(line.quantity);
    if (!(factor > 0) || !(qty > 0)) return null;
    return isPackageUnit(line.unit) ? qty : qty / factor;
};

function toDraftLine(line) {
    const factor = Number(line.quantity_per_container);
    const requestedQty = Number(line.quantity);
    const qty = isPackageUnit(line.unit) ? requestedQty * factor : requestedQty;
    return {
        product_id: line.product_id,
        name: line.product_name,
        description: line.product_name,
        qty,
        qty_packages: packageCount(line),
        _unit_content: factor,
        _unit_label: line.unit_of_measure || 'u',
        vat_rate: line.vat_rate ?? 0.21,
        unit_price: Number(line.unit_price || 0),
    };
}

export default function VoiceAssistantModal({ isOpen, onClose }) {
    const { showToast } = useToast();
    const { openWindow } = useWindow();
    const [productQueries, setProductQueries] = useState({});
    const [productResults, setProductResults] = useState({});
    const [searchingProducts, setSearchingProducts] = useState({});
    const [editingProducts, setEditingProducts] = useState({});
    const [isListening, setIsListening] = useState(false);
    const [promptText, setPromptText] = useState('');
    const [status, setStatus] = useState('LISTO PARA INTERPRETAR');
    const [isParsing, setIsParsing] = useState(false);
    const [parsed, setParsed] = useState(null);
    const [error, setError] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'es-AR';
        recognition.onstart = () => {
            setIsListening(true);
            setStatus('ESCUCHANDO...');
        };
        recognition.onresult = event => {
            const words = Array.from(event.results)
                .slice(event.resultIndex)
                .filter(result => result.isFinal)
                .map(result => result[0].transcript)
                .join(' ');
            if (words) {
                setPromptText(prev => [prev.trim(), words.trim()].filter(Boolean).join(' '));
                setParsed(null);
                setError('');
            }
        };
        recognition.onerror = () => {
            setIsListening(false);
            setStatus('ERROR DE AUDIO');
        };
        recognition.onend = () => {
            setIsListening(false);
            setStatus(prev => prev === 'ERROR DE AUDIO' ? prev : 'LISTO PARA INTERPRETAR');
        };
        recognitionRef.current = recognition;
        return () => {
            recognition.onstart = null;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.abort();
            recognitionRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!isOpen && isListening) recognitionRef.current?.stop();
    }, [isOpen, isListening]);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            setError('Este navegador no permite dictar. Podés escribir el pedido.');
            return;
        }
        try {
            if (isListening) recognitionRef.current.stop();
            else recognitionRef.current.start();
        } catch {
            setError('No se pudo iniciar el micrófono. Revisá sus permisos.');
        }
    };

    const handleInterpret = async () => {
        const prompt = promptText.trim();
        if (prompt.length < 3 || isParsing) return;
        setIsParsing(true);
        setParsed(null);
        setError('');
        setStatus('GEMINI INTERPRETANDO...');
        try {
            const result = await api.post('/ai/parse-prompt', { prompt });
            setParsed(result);
            setProductQueries(Object.fromEntries((result.lines || []).map((line, index) => [index, line.product_query || ''])));
            setProductResults(Object.fromEntries((result.lines || []).map((line, index) => [index, line.product_candidates || []])));
            setEditingProducts({});
            setStatus('INTERPRETACIÓN LISTA · REVISÁ LOS DATOS');
        } catch (err) {
            setError(err?.message || 'No se pudo interpretar el pedido.');
            setStatus('NO SE PUDO INTERPRETAR');
        } finally {
            setIsParsing(false);
        }
    };

    const searchCatalog = async index => {
        const q = String(productQueries[index] || '').trim();
        if (q.length < 2) {
            setError('Escribí al menos dos letras del producto que buscás.');
            return;
        }
        setSearchingProducts(prev => ({ ...prev, [index]: true }));
        setError('');
        try {
            const matches = await api.get('/ai/catalog-products', { params: { q } });
            setProductResults(prev => ({ ...prev, [index]: matches }));
        } catch (err) {
            setError(err?.message || 'No se pudo buscar en el catálogo.');
        } finally {
            setSearchingProducts(prev => ({ ...prev, [index]: false }));
        }
    };

    const chooseProduct = (index, product) => {
        setParsed(prev => ({
            ...prev,
            lines: (prev.lines || []).map((line, position) => position !== index ? line : ({
                ...line,
                product_id: product.id,
                product_name: product.name,
                quantity_per_container: product.quantity_per_container,
                unit_of_measure: product.unit_of_measure,
                container_name: product.container_name,
                vat_rate: product.vat_rate,
                packaging_needs_review: product.packaging_needs_review,
                warnings: [
                    ...(line.warnings || []).filter(item => !/producto sin coincidencia|envase tienen capacidades/i.test(item)),
                    ...(product.packaging_needs_review ? ['El producto y su envase tienen capacidades distintas: corregilo en Productos.'] : []),
                ],
            })),
        }));
        setProductResults(prev => ({ ...prev, [index]: [] }));
        setEditingProducts(prev => ({ ...prev, [index]: false }));
        setError('');
    };

    const handleOpen = () => {
        if (!parsed || parsed.operation_type === 'unknown') return;
        const operation = parsed.operation_type;
        const entityId = parsed.entity_id || null;
        const isPurchase = PURCHASE_DOCUMENTS.includes(operation);
        const isOrder = SALES_DOCUMENTS.includes(operation) || isPurchase;
        if (isOrder) {
            const lines = parsed.lines || [];
            if (!lines.length) {
                setError('No hay renglones para crear la orden. Volvé a interpretar el pedido.');
                return;
            }
            if (lines.some(line => !line.product_id || !(Number(line.quantity) > 0) ||
                !(Number(line.quantity_per_container) > 0) || line.packaging_needs_review || incompatibleUnit(line))) {
                setError('Vinculá todos los productos reales, verificá sus cantidades y envases antes de abrir la orden. No se crearán conceptos ni unidades ficticias.');
                return;
            }
            const currencies = [...new Set(lines.map(line => line.currency).filter(Boolean))];
            if (currencies.length > 1) {
                setError('El documento tiene distintas monedas. Separá las órdenes o corregí los precios.');
                return;
            }
            const draft = {
                entity_id: entityId,
                currency: currencies.length === 1 ? currencies[0] : undefined,
                salesperson_id: parsed.salesperson_id || null,
                sale_condition_id: parsed.condition_id || null,
                lines: lines.map(toDraftLine),
                source: 'gemini-assistant',
            };
            openWindow(isPurchase ? 'purchase-order' : 'sales-order',
                { mode: 'new', initialData: draft },
                {
                    title: isPurchase ? 'Nueva orden de compra · Asistente' : 'Nueva orden de venta · Asistente',
                    width: 1280, height: 690, minWidth: 720, minHeight: 470,
                    allowMultiple: true, singletonKey: `ai-order-${crypto.randomUUID()}`,
                }
            );
        } else if (operation === 'receipt' || operation === 'payment') {
            openWindow('receipt-form',
                { mode: 'new', initialEntityId: entityId, isPayment: operation === 'payment' },
                {
                    title: operation === 'payment' ? 'Nueva orden de pago · Asistente' : 'Nuevo recibo · Asistente',
                    width: 1280, height: 690, minWidth: 720, minHeight: 470,
                    allowMultiple: true, singletonKey: `ai-receipt-${crypto.randomUUID()}`,
                }
            );
        } else {
            setError('No se pudo identificar el formulario que corresponde.');
            return;
        }
        showToast(NEEDS_PREVIOUS_ORDER.includes(operation)
            ? 'Orden previa abierta dentro del sistema: completá y guardá antes del siguiente documento.'
            : 'Formulario abierto dentro del sistema. Revisá los datos antes de guardar.', 'info');
        setPromptText('');
        setParsed(null);
        setError('');
        setStatus('LISTO PARA INTERPRETAR');
        onClose();
    };

    if (!isOpen) return null;
    const operation = parsed?.operation_type || 'unknown';
    const operationInfo = OPERATIONS[operation] || OPERATIONS.unknown;
    const isOrder = SALES_DOCUMENTS.includes(operation) || PURCHASE_DOCUMENTS.includes(operation);
    const hasMissingMatches = parsed && (
        (isOrder && !parsed.entity_id) ||
        (parsed.lines || []).some(line => !line.product_id || !line.quantity ||
            line.unit_price == null || line.packaging_needs_review || incompatibleUnit(line))
    );
    const blockedProducts = isOrder && (
        !(parsed.lines || []).length ||
        (parsed.lines || []).some(line => !line.product_id || !(Number(line.quantity) > 0) ||
            line.packaging_needs_review || incompatibleUnit(line))
    );

    return (
        <div className={s.modalOverlay} onMouseDown={event => {
            if (event.target === event.currentTarget && !isParsing) onClose();
        }}>
            <div className={s.modalContent} role="dialog" aria-modal="true" aria-label="Asistente Gemini">
                <button className={s.closeBtn} onClick={onClose} title="Cerrar" aria-label="Cerrar asistente">
                    <X size={20} />
                </button>
                <div className={s.header}>
                    <div className={s.title}><Sparkles size={24} /> Asistente de Quintal</div>
                    <p className={s.subtitle}>Interpretá pedidos con Gemini y revisá el borrador antes de usarlo.</p>
                    <div className={s.modelBadge}><span className={s.onlineDot} /> Gemini · modo gratuito</div>
                </div>

                <div className={s.inputWrapper}>
                    <textarea
                        className={s.textArea}
                        aria-label="Descripción de la operación"
                        placeholder="Ej.: Orden de venta para Humboldt, 500 litros de Select a USD 12,5 y 40 kg de otro producto..."
                        value={promptText}
                        maxLength={1500}
                        onChange={event => {
                            setPromptText(event.target.value);
                            setParsed(null);
                            setError('');
                            setStatus('LISTO PARA INTERPRETAR');
                        }}
                        disabled={isParsing}
                        autoFocus
                    />
                    <button
                        className={s.micBtn + (isListening ? ' ' + s.active : '')}
                        onClick={toggleListening}
                        disabled={isParsing}
                        title={isListening ? 'Detener dictado' : 'Dictar pedido'}
                        aria-label={isListening ? 'Detener dictado' : 'Dictar pedido'}
                    >
                        {isListening ? <Mic size={21} /> : <MicOff size={21} />}
                    </button>
                    <span className={s.counter}>{promptText.length}/1500</span>
                </div>

                {isListening && <div className={s.statusActive}><Mic size={16} /> Escuchando el pedido...</div>}
                {error && <div className={s.error} role="alert"><AlertTriangle size={17} /> {error}</div>}

                {parsed && (
                    <div className={s.preview}>
                        <div className={s.previewHeader}>
                            <div>
                                <span className={s.eyebrow}>Vista previa de Gemini</span>
                                <h3>{operationInfo.label}</h3>
                            </div>
                            <CheckCircle2 size={21} className={s.successIcon} />
                        </div>
                        <div className={s.entityLine}>
                            <span>{PURCHASE_DOCUMENTS.includes(operation) || operation === 'payment' ? 'Proveedor' : 'Cliente'}</span>
                            <strong>{parsed.entity_name || parsed.entity_query || 'Sin identificar'}</strong>
                            {!parsed.entity_id && <small>Requiere selección manual</small>}
                        </div>
                        {isOrder && (
                            <div className={s.linesArea}>
                                <span className={s.eyebrow}>Productos · {(parsed.lines || []).length} renglones</span>
                                {(parsed.lines || []).length === 0 && <p className={s.empty}>Gemini no detectó productos.</p>}
                                {(parsed.lines || []).map((line, index) => (
                                    <div className={s.line} key={index}>
                                        <div className={s.lineTitle}>
                                            <strong>{line.product_name || line.product_query || 'Producto sin nombre'}</strong>
                                            {!line.product_id && <span className={s.unmatched}>Sin vincular</span>}
                                            <button type="button" className={s.changeProduct} onClick={() => setEditingProducts(prev => ({ ...prev, [index]: !prev[index] }))}>
                                                {editingProducts[index] ? 'Ocultar búsqueda' : line.product_id ? 'Cambiar producto' : 'Buscar en catálogo'}
                                            </button>
                                        </div>
                                        <span>
                                            {formatNumber(line.quantity)} {line.unit || 'unid.'} ·
                                            {' '}{line.currency || '$'} {formatNumber(line.unit_price)} c/u
                                        </span>
                                        {line.product_id && <span className={s.packageDetail}>
                                            Catálogo: {formatNumber(packageCount(line))} envase(s) × {formatNumber(line.quantity_per_container)} {line.unit_of_measure || 'u'} = {formatNumber(isPackageUnit(line.unit) ? Number(line.quantity) * Number(line.quantity_per_container) : line.quantity)} {line.unit_of_measure || 'u'}
                                        </span>}
                                        {incompatibleUnit(line) && <small>La unidad solicitada no coincide con la del producto. Revisá la selección.</small>}
                                        {line.warnings?.length > 0 && <small>{line.warnings.join(' · ')}</small>}
                                        {(!line.product_id || editingProducts[index]) && (
                                            <div className={s.catalogPicker}>
                                                <div className={s.catalogSearch}>
                                                    <input
                                                        aria-label={`Buscar producto del renglón ${index + 1}`}
                                                        placeholder="Nombre, marca o SKU del catálogo..."
                                                        value={productQueries[index] || ''}
                                                        onChange={event => setProductQueries(prev => ({ ...prev, [index]: event.target.value }))}
                                                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); searchCatalog(index); } }}
                                                    />
                                                    <button type="button" onClick={() => searchCatalog(index)} disabled={searchingProducts[index]}>
                                                        {searchingProducts[index] ? 'Buscando...' : 'Buscar'}
                                                    </button>
                                                </div>
                                                <div className={s.catalogResults}>
                                                    {(productResults[index] || []).map(product => (
                                                        <button key={product.id} type="button" className={s.catalogResult} onClick={() => chooseProduct(index, product)}>
                                                            <strong>{product.name}</strong>
                                                            <span>{product.container_name || 'Envase'} · {formatNumber(product.quantity_per_container)} {product.unit_of_measure || 'u'}{product.sku ? ` · SKU ${product.sku}` : ''}</span>
                                                        </button>
                                                    ))}
                                                    {(productResults[index] || []).length === 0 && <small>Buscá por nombre o SKU. Solo se pueden vincular productos existentes.</small>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {NEEDS_PREVIOUS_ORDER.includes(operation) && (
                            <div className={s.notice}>
                                <ArrowRight size={16} /> Para seguir el circuito de Quintal, primero se prepara la orden correspondiente.
                                La factura o el remito se genera luego desde esa orden.
                            </div>
                        )}
                        {hasMissingMatches && (
                            <div className={s.notice}>
                                <AlertTriangle size={16} /> Hay datos incompletos o sin vincular.
                                {blockedProducts
                                    ? 'Vinculá y verificá los productos antes de abrir. Así evitamos cantidades o envases incorrectos.'
                                    : 'El cliente o algún precio se completará manualmente dentro del formulario.'}
                            </div>
                        )}
                        {(parsed.warnings || []).map((warning, index) => (
                            <div className={s.mutedWarning} key={index}>{warning}</div>
                        ))}
                        {['receipt', 'payment'].includes(operation) && (
                            <div className={s.notice}>
                                Se abrirá el formulario con la entidad identificada. Importes, imputaciones y medios
                                de pago se completan manualmente.
                            </div>
                        )}
                    </div>
                )}

                <div className={s.statusArea}>
                    <span className={s.statusText}>{status}</span>
                </div>
                <div className={s.actions}>
                    <button
                        className={s.retryBtn}
                        onClick={() => {
                            setPromptText('');
                            setParsed(null);
                            setError('');
                            setStatus('LISTO PARA INTERPRETAR');
                        }}
                        disabled={isParsing || (!promptText && !parsed)}
                        title="Limpiar"
                        aria-label="Limpiar texto"
                    ><Eraser size={19} /></button>
                    {!parsed ? (
                        <button className={s.confirmBtn} onClick={handleInterpret} disabled={promptText.trim().length < 3 || isParsing}>
                            {isParsing ? <Loader2 className={s.spin} size={19} /> : <Send size={19} />}
                            {isParsing ? 'INTERPRETANDO...' : 'INTERPRETAR CON GEMINI'}
                        </button>
                    ) : (
                        <button className={s.confirmBtn} onClick={handleOpen} disabled={operation === 'unknown' || blockedProducts}>
                            <ArrowRight size={19} /> {operationInfo.open}
                        </button>
                    )}
                </div>
                <p className={s.privacy}><ShieldAlert size={14} /> El nivel gratuito de Gemini puede usar los textos
                    enviados para mejorar sus servicios. No incluyas datos confidenciales reales en las pruebas.
                </p>
            </div>
        </div>
    );
}
