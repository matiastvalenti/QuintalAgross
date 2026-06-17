from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.db.session import get_db
from app.db.models.auth_models import CashPosition, CashMovement, ExchangeRate

router = APIRouter(prefix="/cash", tags=["Cash Management"])

class CashOpening(BaseModel):
    date: str
    balances: dict # { "ARS": 100, "USD": 50 }
    opened_by: str

class CashClosing(BaseModel):
    date: str
    balances: dict
    closed_by: str

class MovementCreate(BaseModel):
    currency: str
    amount: float
    source: str
    description: str
    created_by: Optional[str] = None

@router.post("/open")
def open_day(opening: CashOpening, db: Session = Depends(get_db)):
    # Check if already open
    existing = db.query(CashPosition).filter(
        CashPosition.date == opening.date,
        CashPosition.status == "OPEN"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="La jornada ya est\u00e1 abierta")
    
    pos = CashPosition(
        date=opening.date,
        opening_balances=opening.balances,
        opened_by=opening.opened_by,
        opened_at=datetime.utcnow(),
        status="OPEN"
    )
    db.add(pos)
    db.commit()
    db.refresh(pos)
    return pos

@router.post("/close")
def close_day(closing: CashClosing, db: Session = Depends(get_db)):
    pos = db.query(CashPosition).filter(
        CashPosition.date == closing.date,
        CashPosition.status == "OPEN"
    ).first()
    if not pos:
        raise HTTPException(status_code=404, detail="Jornada abierta no encontrada para esta fecha")
    
    pos.closing_balances = closing.balances
    pos.closed_by = closing.closed_by
    pos.closed_at = datetime.utcnow()
    pos.status = "CLOSED"
    db.commit()
    db.refresh(pos)
    return pos

@router.get("/status/{date}")
def get_status(date: str, db: Session = Depends(get_db)):
    pos = db.query(CashPosition).filter(CashPosition.date == date).first()
    if not pos:
        return {"status": "NOT_STARTED", "date": date}
    
    # Calculate current balances
    balances = pos.opening_balances.copy()
    movements = db.query(CashMovement).filter(CashMovement.cash_position_id == pos.id).all()
    
    for m in movements:
        balances[m.currency] = balances.get(m.currency, 0) + m.amount
        
    return {
        "id": pos.id,
        "status": pos.status,
        "date": pos.date,
        "opening_balances": pos.opening_balances,
        "current_balances": balances,
        "movements": movements,
        "opened_by": pos.opened_by,
        "opened_at": pos.opened_at,
        "closed_by": pos.closed_by,
        "closed_at": pos.closed_at
    }

@router.post("/movement")
def add_movement(m_in: MovementCreate, db: Session = Depends(get_db)):
    # Find current open position
    today = datetime.now().strftime("%Y-%m-%d")
    pos = db.query(CashPosition).filter(
        CashPosition.date == today,
        CashPosition.status == "OPEN"
    ).first()
    
    if not pos:
        raise HTTPException(status_code=400, detail="Debe abrir la jornada para registrar movimientos de caja")
    
    m = CashMovement(
        cash_position_id=pos.id,
        currency=m_in.currency,
        amount=m_in.amount,
        source=m_in.source,
        description=m_in.description,
        created_by=m_in.created_by,
        created_at=datetime.utcnow()
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m

# --- Exchange Rates Router (Inline or separate) ---
rates_router = APIRouter(prefix="/rates", tags=["Exchange Rates"])

class RateUpdate(BaseModel):
    currency: str
    buy: float
    sell: float
    wholesale: Optional[float] = None
    changed_by: str

@rates_router.post("/")
def update_rate(rate_in: RateUpdate, db: Session = Depends(get_db)):
    rate = ExchangeRate(
        currency=rate_in.currency,
        buy=rate_in.buy,
        sell=rate_in.sell,
        wholesale=rate_in.wholesale,
        changed_by=rate_in.changed_by,
        timestamp=datetime.utcnow()
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate

@rates_router.get("/latest")
def get_latest_rates(db: Session = Depends(get_db)):
    # Auto-sync BCRA rates if needed
    try:
        import urllib.request
        import json
        import ssl
        from datetime import timezone
        
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        sources = [
            {"currency": "USD Oficial", "url": "https://dolarapi.com/v1/dolares/oficial"},
            {"currency": "USD Divisa", "url": "https://dolarapi.com/v1/dolares/mayorista"}
        ]
        
        for src in sources:
            last = db.query(ExchangeRate).filter(ExchangeRate.currency == src["currency"]).order_by(ExchangeRate.timestamp.desc()).first()
            # Si no existe o tiene más de 1 hora
            if not last or (datetime.utcnow() - last.timestamp).total_seconds() > 3600:
                req = urllib.request.Request(src["url"], headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, context=ctx, timeout=5) as res:
                    data = json.loads(res.read().decode('utf-8'))
                    new_rate = ExchangeRate(
                        currency=src["currency"],
                        buy=float(data["compra"]),
                        sell=float(data["venta"]),
                        wholesale=float(data.get("compra", 0)),
                        changed_by="SYSTEM",
                        timestamp=datetime.utcnow()
                    )
                    db.add(new_rate)
                    db.commit()
    except Exception as e:
        print(f"Error auto-syncing BCRA rates: {e}")

    currencies = ["USD Oficial", "USD Divisa", "EUR", "BRL", "USDT"]
    results = []
    for cur in currencies:
        rate = db.query(ExchangeRate).filter(ExchangeRate.currency == cur).order_by(ExchangeRate.timestamp.desc()).first()
        if rate:
            results.append(rate)
    return results

@rates_router.get("/history/{currency}")
def get_rate_history(currency: str, db: Session = Depends(get_db), limit: int = 20):
    return db.query(ExchangeRate).filter(ExchangeRate.currency == currency).order_by(ExchangeRate.timestamp.desc()).limit(limit).all()
