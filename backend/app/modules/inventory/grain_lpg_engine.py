from decimal import Decimal
from typing import List, Dict, Any, Optional
from datetime import datetime

class LpgEngine:
    """
    Engine para el cálculo automático de Liquidaciones Primarias de Granos (LPG).
    Basado en normativas vigentes en Argentina (AFIP / SISA) y usos del mercado.
    """
    
    @staticmethod
    def calculate(
        total_kilos: Decimal,
        price_per_ton: Decimal,
        vat_rate: Decimal = Decimal('10.5'), # Estándar granos
        sisa_status: str = "1", # 1, 2, 3 o INACTIVO
        has_broker: bool = False,
        include_paritaria: bool = True
    ) -> Dict[str, Any]:
        """
        Realiza el cálculo completo de una LPG.
        """
        gross_amount = (total_kilos / Decimal('1000')) * price_per_ton
        vat_amount = (gross_amount * vat_rate) / Decimal('100')
        
        # 1. Ítems de la liquidación
        items = [
            {
                "line_type": "DEBIT",
                "activity": "CEREAL",
                "movement": "Fisico",
                "description": "VALOR BRUTO PRODUCTO",
                "quantity": total_kilos / Decimal('1000'),
                "unit_price": price_per_ton,
                "subtotal": gross_amount,
                "vat_rate": vat_rate,
                "vat_amount": vat_amount,
                "total_amount": gross_amount + vat_amount
            }
        ]
        
        # 2. Impuestos / Retenciones (AFIP RG 4310 - SISA)
        # Notas: SISA 1 = 5% ret IVA, SISA 2 = 8% ret IVA, SISA 3 = 10.5% ret IVA
        # Retención Ganancias: SISA 1 = 0%, SISA 2 = 2%, SISA 3 = 2%
        ret_iva_rate = Decimal('8.0')
        ret_gan_rate = Decimal('2.0')
        
        if sisa_status == "1":
            ret_iva_rate = Decimal('5.0')
            ret_gan_rate = Decimal('0.0')
        elif sisa_status == "2":
            ret_iva_rate = Decimal('8.0')
            ret_gan_rate = Decimal('2.0')
        elif sisa_status == "3" or sisa_status == "INACTIVO":
            ret_iva_rate = Decimal('10.5')
            ret_gan_rate = Decimal('2.0')
            
        ret_iva_amount = (gross_amount * ret_iva_rate) / Decimal('100')
        ret_gan_amount = (gross_amount * ret_gan_rate) / Decimal('100')
        
        taxes = []
        if ret_iva_amount > 0:
            taxes.append({
                "tax_type": "RETENTION",
                "category": f"RET.IVA SISA {sisa_status}",
                "base_amount": gross_amount,
                "rate": ret_iva_rate,
                "amount": ret_iva_amount
            })
            
        if ret_gan_amount > 0:
            taxes.append({
                "tax_type": "RETENTION",
                "category": "RET.GANANCIAS",
                "base_amount": gross_amount,
                "rate": ret_gan_rate,
                "amount": ret_gan_amount
            })
            
        # 3. Gastos / Deducciones sugeridas
        expenses = []
        
        # Comisión Corredor (si hay)
        if has_broker:
            comm_rate = Decimal('2.0') # 2% estándar
            comm_amount = (gross_amount * comm_rate) / Decimal('100')
            expenses.append({
                "tax_type": "EXPENSE",
                "category": "COMISION CORREDOR",
                "base_amount": gross_amount,
                "rate": comm_rate,
                "amount": comm_amount
            })
            
        # Paritaria / Otros gastos
        if include_paritaria:
            par_rate = Decimal('0.5')
            par_amount = (gross_amount * par_rate) / Decimal('100')
            expenses.append({
                "tax_type": "EXPENSE",
                "category": "GASTOS COMERC. / PARIT.",
                "base_amount": gross_amount,
                "rate": par_rate,
                "amount": par_amount
            })
            
        # 4. Totales
        total_perceptions = Decimal('0') # Podrían agregarse sellos etc
        total_retentions = ret_iva_amount + ret_gan_amount
        total_expenses = sum(e["amount"] for e in expenses)
        
        net_amount = (gross_amount + vat_amount + total_perceptions) - total_retentions - total_expenses
        
        return {
            "gross_amount": gross_amount,
            "vat_amount": vat_amount,
            "perceptions_amount": total_perceptions,
            "retentions_amount": total_retentions,
            "expenses_amount": total_expenses,
            "net_amount": net_amount,
            "items": items,
            "taxes": taxes + expenses # Combinamos para el schema actual que espera taxes como lista única disciplinada
        }
