import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Loader2, Sparkles, Send, Eraser } from 'lucide-react';
import s from './VoiceAssistantModal.module.css';
import api from '../../services/api';
import { useWindow } from '../../context/WindowContext';
import { useToast } from '../../context/ToastContext';
import { openNuevaFactura, openNuevoRemito, openNuevaOrdenVenta } from '../../utils/openStandaloneWindow';

export default function VoiceAssistantModal({ isOpen, onClose }) {
    const { openWindow } = useWindow();
    const { showToast } = useToast();
    const [isListening, setIsListening] = useState(false);
    const [promptText, setPromptText] = useState('');
    const [status, setStatus] = useState('ESPERANDO COMANDO');
    const [isParsing, setIsParsing] = useState(false);
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setStatus('NO COMPATIBLE');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'es-AR';

        recognitionRef.current.onstart = () => {
            setIsListening(true);
            setStatus('ESCUCHANDO...');
        };

        recognitionRef.current.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                setPromptText(prev => (prev ? prev + ' ' : '') + finalTranscript);
            }
        };

        recognitionRef.current.onerror = (event) => {
            console.error('Speech error:', event.error);
            setIsListening(false);
            setStatus('ERROR DE AUDIO');
        };

        recognitionRef.current.onend = () => {
            setIsListening(false);
            if (promptText) setStatus('LISTO');
            else setStatus('ESPERANDO COMANDO');
        };
    }, [promptText]);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    const handleConfirm = async () => {
        if (!promptText) return;
        
        setIsParsing(true);
        setStatus('IA PROCESANDO...');
        
        try {
            const result = await api.post('/ai/parse-prompt', { prompt: promptText });

            const lineDescription = result.product_name || result.product_raw || 'Producto sin identificar';

            const line = {
                product_id: result.product_id || null,
                description: lineDescription,
                qty: result.quantity,
                unit_price: result.unit_price,
            };

            const pLower = promptText.toLowerCase();
            const isInvoice = pLower.includes('factura') || pLower.includes('facturar');
            const isSalesOrder = pLower.includes('orden de venta') || pLower.includes('pedido') || pLower.includes('orden');

            const confidence = result.confidence || 0;
            const confPct = Math.round(confidence * 100);

            if (isInvoice) {
                const draftId = crypto.randomUUID();
                localStorage.setItem(`invoice_draft_${draftId}`, JSON.stringify({
                    entityId: result.entity_id,
                    lines: [line],
                    salespersonId: result.salesperson_id,
                    conditionId: result.condition_id,
                }));
                openNuevaFactura({ draft_id: draftId }, { title: 'Nueva Factura (IA)', width: 1100, height: 700 });
            } else if (isSalesOrder) {
                const draftId = crypto.randomUUID();
                localStorage.setItem(`sales_order_draft_${draftId}`, JSON.stringify({
                    entity_id: result.entity_id,
                    warehouse_id: result.warehouse_id,
                    salesperson_id: result.salesperson_id,
                    sale_condition_id: result.condition_id,
                    lines: [{
                        ...line,
                        _unit_content: result.quantity_per_container || 1
                    }]
                }));
                openNuevaOrdenVenta({ draft_id: draftId }, { title: 'Nueva Orden de Venta (IA)', width: 1100, height: 600 });
            } else {
                const draftId = crypto.randomUUID();
                localStorage.setItem(`delivery_note_draft_${draftId}`, JSON.stringify({
                    entity_id: result.entity_id,
                    warehouse_id: result.warehouse_id,
                    salesperson_id: result.salesperson_id,
                    lines: [line]
                }));
                openNuevoRemito(null, { draft_id: draftId, title: 'Nuevo Remito (IA)', width: 1100, height: 600 });
            }

            // Build informative toast message
            const parts = [];
            if (result.entity_name) parts.push(`Cliente: ${result.entity_name}`);
            if (lineDescription) parts.push(`Prod: ${lineDescription}`);
            const msg = parts.length > 0 ? parts.join(' | ') : 'Formulario abierto';

            showToast(`${msg} (${confPct}% confianza)`, confPct >= 50 ? 'success' : 'warning');
            onClose();
            setPromptText('');
            setStatus('ESPERANDO COMANDO');
        } catch (error) {
            console.error('Parsing error:', error);
            showToast('Error al interpretar el mensaje', 'error');
            setStatus('ERROR AL PROCESAR');
        } finally {
            setIsParsing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={s.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={s.modalContent}>
                <button className={s.closeBtn} onClick={onClose}>
                    <X size={20} />
                </button>

                <div className={s.header}>
                    <div className={s.title}>
                        <Sparkles size={32} />
                        Quintal AI
                    </div>
                    <p className={s.subtitle}>
                        Dicta tu orden con lenguaje natural
                    </p>
                </div>

                {isListening && (
                    <div className={s.waveContainer}>
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className={s.waveBar} />
                        ))}
                    </div>
                )}

                <div className={s.inputWrapper}>
                    <textarea 
                        className={s.textArea}
                        placeholder='Ej: Órden de venta para Humboldt de 500lt de Select a 12.5 usd...'
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        disabled={isParsing}
                        autoFocus
                    />
                    <button 
                        className={`${s.micBtn} ${isListening ? s.active : ''}`}
                        onClick={toggleListening}
                        disabled={isParsing}
                    >
                        {isListening ? <Mic size={28} /> : <MicOff size={28} />}
                    </button>
                </div>

                <div className={s.statusArea}>
                    <span className={s.statusText}>{status}</span>
                </div>

                <div className={s.actions}>
                    <button 
                        className={s.retryBtn} 
                        onClick={() => { setPromptText(''); setStatus('ESPERANDO COMANDO'); }}
                        disabled={isParsing || !promptText}
                    >
                        <Eraser size={24} />
                    </button>
                    <button 
                        className={s.confirmBtn}
                        onClick={handleConfirm}
                        disabled={!promptText || isParsing}
                    >
                        {isParsing ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
                        {isParsing ? 'PROCESANDO...' : 'PREPARAR SISTEMA'}
                    </button>
                </div>
            </div>
        </div>
    );
}
