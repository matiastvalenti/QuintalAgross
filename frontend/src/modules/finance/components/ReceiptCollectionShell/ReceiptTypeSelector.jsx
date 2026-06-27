import React from 'react';
import { DollarSign, ArrowRight, UserPlus, FileText } from 'lucide-react';
import s from './ReceiptTypeSelector.module.css';

export default function ReceiptTypeSelector({ onSelectType }) {
  return (
    <div className={s.container}>
      <div className={s.header}>
        <h2>¿Qué tipo de cobro querés registrar?</h2>
        <p>Seleccioná el flujo de ingresos que vas a procesar en la cuenta corriente y caja.</p>
      </div>

      <div className={s.grid}>
        {/* Caso 1: Cobrar comprobantes */}
        <div className={s.card} onClick={() => onSelectType('INVOICES')}>
          <div className={s.iconWrapper} style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
            <FileText size={24} />
          </div>
          <div className={s.cardContent}>
            <h3>Cobrar comprobantes de cliente</h3>
            <p>Seleccionar facturas, notas de débito y aplicar cobros específicos.</p>
          </div>
          <ArrowRight className={s.arrow} size={20} />
        </div>

        {/* Caso 2: Anticipo */}
        <div className={s.card} onClick={() => onSelectType('ADVANCE')}>
          <div className={s.iconWrapper} style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
            <UserPlus size={24} />
          </div>
          <div className={s.cardContent}>
            <h3>Anticipo de cliente</h3>
            <p>Registrar un ingreso a cuenta sin afectar comprobantes pendientes.</p>
          </div>
          <ArrowRight className={s.arrow} size={20} />
        </div>

        {/* Caso 3: Ingreso Financiero (Deshabilitado) */}
        <div className={`${s.card} ${s.disabled}`}>
          <div className={s.iconWrapper} style={{ backgroundColor: '#f1f5f9', color: '#94a3b8' }}>
            <DollarSign size={24} />
          </div>
          <div className={s.cardContent}>
            <h3>Ingreso financiero</h3>
            <p>Próximamente: registro de movimientos de caja y bancos sin cliente.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
