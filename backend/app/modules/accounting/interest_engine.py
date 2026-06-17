from datetime import datetime
from typing import List
from .document_schemas import CheckInterestPreviewRequest, CheckInterestPreviewResponse, CheckInterestItemResponse

def calculate_check_interest(data: CheckInterestPreviewRequest) -> CheckInterestPreviewResponse:
    """
    Calcula el interés para una lista de cheques basado en una tasa mensual.
    La fórmula es: Interés = Monto * (Tasa Mensual / 100) * (Días / 30)
    """
    items = []
    total_interest = 0.0
    
    receipt_date = data.receipt_date
    if hasattr(receipt_date, "date"):
        receipt_date = receipt_date.replace(hour=0, minute=0, second=0, microsecond=0)

    for chk in data.checks:
        due_date = chk.due_date
        if hasattr(due_date, "date"):
            due_date = due_date.replace(hour=0, minute=0, second=0, microsecond=0)
            
        # Solo calculamos si vence después del recibo
        days = (due_date - receipt_date).days
        if days < 0:
            days = 0
            
        # Cálculo: Tasa mensual prorrateada por días
        # Tasa diaria = (Tasa Mensual / 100) / 30
        interest = chk.amount * (data.monthly_rate / 100.0) * (days / 30.0)
        
        items.append(CheckInterestItemResponse(
            reference_number=chk.reference_number or "S/N",
            due_date=chk.due_date,
            amount=chk.amount,
            days=days,
            interest_amount=float(round(interest, 2))
        ))
        total_interest += interest
        
    return CheckInterestPreviewResponse(
        items=items,
        total_interest=float(round(total_interest, 2)),
        monthly_rate=data.monthly_rate
    )
