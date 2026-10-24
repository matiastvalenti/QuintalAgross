import React, { useEffect, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowRight, CheckCircle2, Eraser, Loader2, Mic, MicOff,
    Send, ShieldAlert, Sparkles, X
} from 'lucide-react';
import s from './VoiceAssistantModal.module.css';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
    openNuevaOrdenVenta, openNuevaOrdenCompra, openNuevoRecibo, openNuevoPago
} from '../../utils/openStandaloneWindow';

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

function toDraftLine(line) {
    const isContainer = /bid[oó]n|bolsa|frasco|tambor|envase|caja|pack/i.test(line.unit || '');
    const factor = Number(line.quantity_per_container) > 0 ? Number(line.quantity_per_container) : 1;
    const requestedQty = Number(line.quantity || 0);
    const qty = isContainer ? requestedQty * factor : requestedQty;
    return {
        product_id: line.product_id || null,
        name: line.product_name || line.product_query || '',
        description: line.product_name || line.product_query || '',
        qty,
        qty_packages: isContainer ? requestedQty : qty / factor,
        _unit_content: factor,
        unit_price: Number(line.unit_price || 0),
    };
}

export default function VoiceAssistantModal({ isOpen, onClose }) {
    const { showToast } = useToast();
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
            setStatus('INTERPRETACIÓN LISTA · REVISÁ LOS DATOS');
        } catch (err) {
            setError(err?.message || 'No se pudo interpretar el pedido.');
            setStatus('NO SE PUDO INTERPRETAR');
        } finally {
            setIsParsing(false);
        }
    };

    const handleOpen = () => {
        if (!parsed || parsed.operation_type === 'unknown') return;
        const operation = parsed.operation_type;
        const entityId = parsed.entity_id || null;
        let opened = null;
        let draftKey = null;

        if (SALES_DOCUMENTS.includes(operation) || PURCHASE_DOCUMENTS.includes(operation)) {
            const isPurchase = PURCHASE_DOCUMENTS.includes(operation);
            const draftId = crypto.randomUUID();
            draftKey = isPurchase ? 'purchase_order_draft_' + draftId : 'sales_order_draft_' + draftId;
            const currencies = [...new Set((parsed.lines || []).map(line => line.currency).filter(Boolean))];
            const draft = {
                entity_id: entityId,
                currency: currencies.length === 1 ? currencies[0] : undefined,
                salesperson_id: parsed.salesperson_id || null,
                sale_condition_id: parsed.condition_id || null,
                lines: (parsed.lines || []).map(toDraftLine),
                source: 'gemini-assistant',
            };
            try {
                localStorage.setItem(draftKey, JSON.stringify(draft));
                opened = isPurchase
                    ? openNuevaOrdenCompra({ draft_id: draftId })
                    : openNuevaOrdenVenta({ draft_id: draftId });
            } catch {
                setError('No se pudo preparar el borrador en este navegador.');
                return;
            }
        } else if (operation === 'receipt') {
            opened = openNuevoRecibo({ entityId });
        } else if (operation === 'payment') {
            opened = openNuevoPago({ entityId });
        }

        if (!opened) {
            if (draftKey) localStorage.removeItem(draftKey);
            setError('No se abrió el formulario. Permití las ventanas emergentes para este sitio.');
            return;
        }
        const message = NEEDS_PREVIOUS_ORDER.includes(operation)
            ? 'Abrimos la orden previa: el circuito comercial requiere esa orden antes del documento solicitado.'
            : 'Formulario abierto. Revisá y completá los datos antes de guardar.';
        showToast(message, 'info');
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
        (parsed.lines || []).some(line => !line.product_id || !line.quantity || line.unit_price == null)
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
                                        </div>
                                        <span>
                                            {formatNumber(line.quantity)} {line.unit || 'unid.'} ·
                                            {' '}{line.currency || '$'} {formatNumber(line.unit_price)} c/u
                                        </span>
                                        {line.warnings?.length > 0 && <small>{line.warnings.join(' · ')}</small>}
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
                                El formulario abrirá con estos campos para que los corrijas.
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
                        <button className={s.confirmBtn} onClick={handleOpen} disabled={operation === 'unknown'}>
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
