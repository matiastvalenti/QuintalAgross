from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.session import get_db
from app.db.models.models import Entity, EntityType
from app.db.models.commercial_models import Product, Warehouse, SaleCondition
from pydantic import BaseModel
import re
from typing import List, Optional, Tuple

router = APIRouter(prefix="/ai", tags=["AI Assistant"])

class AIPromptRequest(BaseModel):
    prompt: str

class AIParsedResult(BaseModel):
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    product_raw: Optional[str] = None
    quantity_per_container: float = 1.0
    warehouse_id: Optional[str] = None
    warehouse_name: Optional[str] = None
    salesperson_id: Optional[str] = None
    salesperson_name: Optional[str] = None
    condition_id: Optional[str] = None
    condition_name: Optional[str] = None
    quantity: float = 1.0
    unit_price: float = 1.0
    raw_text: str
    confidence: float = 0.0

def levenshtein_lite(s1: str, s2: str) -> float:
    s1, s2 = s1.lower(), s2.lower()
    if s1 in s2: return 0.9
    chars1 = set(s1)
    chars2 = set(s2)
    overlap = chars1 & chars2
    return len(overlap) / max(len(chars1), len(chars2), 1)

def super_fuzzy(query: str, candidates: List[Tuple], threshold=0.3) -> Optional[Tuple]:
    if not query: return None
    q = query.lower().strip()
    q_words = q.split()
    best = None
    best_score = -1
    for row in candidates:
        cid, cname = row[0], row[1]
        if not cname: continue # Skip null names
        n_lower = cname.lower()
        n_words = n_lower.split()
        total_word_score = 0
        for qw in q_words:
            word_best = 0
            for nw in n_words:
                ws = levenshtein_lite(qw, nw)
                if ws > word_best: word_best = ws
            total_word_score += word_best
        final_score = total_word_score / max(len(q_words), 1)
        if q in n_lower: final_score += 0.2
        if final_score > best_score:
            best_score = final_score
            best = row
    if best_score >= threshold: return best
    return None

@router.post("/parse-prompt", response_model=AIParsedResult)
async def parse_prompt(request: AIPromptRequest, db: Session = Depends(get_db)):
    prompt = request.prompt
    p = prompt.strip()
    
    # Identify Blocks
    entity_text = ""
    e_match = re.search(r'(?:orden\s+de\s+venta|pedido|remito|factura)\s+([^,]+)', p, re.I)
    if e_match:
        entity_text = re.split(r'con\s+vendedor|vendedor|condicion', e_match.group(1), flags=re.I)[0].strip()

    vendedor_text = ""
    v_match = re.search(r'vendedor\s+([^,]+)', p, re.I)
    if v_match:
        vendedor_text = re.split(r'condicion|venta|pedido', v_match.group(1), flags=re.I)[0].strip()

    condition_text = ""
    c_match = re.search(r'condicion\s+(?:a\s+)?([^,]+)', p, re.I)
    if c_match:
        condition_text = c_match.group(1).strip()
        condition_text = re.split(r'\s+\d', condition_text)[0].strip()

    # Price - Iterate to find the correct one
    unit_price = 1.0
    price_matches = re.finditer(r'(?:a\s+|@\s+|precio\s+)\$?\s*(\d+(?:[.,]\d+)?)', p, re.I)
    for pm in price_matches:
        val = float(pm.group(1).replace(',', '.'))
        context = p[pm.end(): pm.end()+15].lower()
        # If it's not followed by 'dias', it's our price
        if 'dia' not in context and val != 1.0: # avoid defaults
            unit_price = val
            # Don't break yet, in case there's another one later that's even better

    UNITS = r'(?:litros?|lts?|lt|l\b|kgs?|kilos?|bidones?|unidades?|u\b|bolsas?|tn|uds?|kg|lit)'
    quantity = 1.0
    product_text = ""
    qty_matches = list(re.finditer(rf'(\d+(?:[.,]\d+)?)\s*({UNITS})', p, re.I))
    if qty_matches:
        # Avoid picking the price if it has a unit next to it (rare but possible)
        for qm in qty_matches:
            val = float(qm.group(1).replace(',', '.'))
            if val != unit_price:
                quantity = val
                before_qty = p[:qm.start()].strip()
                parts = re.split(r'[,]|condicion|vendedor|dias|días', before_qty, flags=re.I)
                product_text = parts[-1].strip()
                break

    # DB Lookups
    entities = db.execute(select(Entity.id, Entity.name).where(Entity.type == EntityType.CLIENT)).all()
    products = db.execute(select(Product.id, Product.name, Product.quantity_per_container)).all()
    sellers = db.execute(select(Entity.id, Entity.name).where(Entity.is_salesperson == True)).all()
    conditions = db.execute(select(SaleCondition.id, SaleCondition.description)).all()

    e_res = super_fuzzy(entity_text, entities, threshold=0.4)
    p_res = super_fuzzy(product_text, products, threshold=0.4)
    s_res = super_fuzzy(vendedor_text, sellers, threshold=0.4)
    c_res = super_fuzzy(condition_text, conditions, threshold=0.4)

    return AIParsedResult(
        entity_id=e_res[0] if e_res else None,
        entity_name=e_res[1] if e_res else None,
        product_id=p_res[0] if p_res else None,
        product_name=p_res[1] if p_res else None,
        product_raw=product_text if product_text else "Producto no detectado",
        quantity_per_container=p_res[2] if p_res else 1.0,
        salesperson_id=s_res[0] if s_res else None,
        salesperson_name=s_res[1] if s_res else None,
        condition_id=c_res[0] if c_res else None,
        condition_name=c_res[1] if c_res else None,
        quantity=quantity,
        unit_price=unit_price,
        raw_text=prompt,
        confidence=1.0
    )
