
import os
import json
import base64
from fastapi import HTTPException

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import requests

# Tip: The user should provide this key or set it in .env
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

def process_invoice_with_gemini(file_path: str):
    if not GEMINI_API_KEY:
        return None

    # Read file
    with open(file_path, "rb") as f:
        file_data = f.read()

    file_ext = os.path.splitext(file_path)[1].lower()
    mime_type = "application/pdf" if file_ext in [".pdf"] else "image/jpeg"

    # Encode to base64 for JSON payload
    import base64
    b64_data = base64.b64encode(file_data).decode("utf-8")

    prompt = """
    Extract all data from this purchase invoice (factura de compra).
    CRITICAL: Look for the INVOICE DATE (fecha de comprobante/factura), NOT the company start date (fecha de inicio de actividad).
    The invoice date should be near the words "Fecha de factura" or "Fecha de comprobante" or just "Fecha:".
    
    Return ONLY a JSON object with this structure:
    {
      "supplier": { "name": "...", "cuit": "...", "iva_condition": "..." },
      "invoice": {
        "invoice_type": "A|B|C|M",
        "point_of_sale": "string (4 digits - e.g., 0001)",
        "invoice_number": "string (8 digits - the full invoice number after the dash, e.g., 00012698)",
        "invoice_date": "YYYY-MM-DD format (THIS IS THE INVOICE DATE, NOT company start date)",
        "currency": "ARS|USD",
        "exchange_rate": number,
        "totals": { "net": number, "vat_21": number, "total": number }
      },
      "items": [
        {
          "line_no": number,
          "raw_description": "...",
          "quantity": number,
          "unit": "...",
          "unit_price": number,
          "line_subtotal": number,
          "vat_rate": number (e.g. 0.21)
        }
      ]
    }
    If a CUIT is present, extract it as XX-XXXXXXXX-X.
    If multiple entities are present, the supplier is the EMISOR (issuer) and the client is QUINTAL AGROSS.
    
    IMPORTANT: The invoice number format is typically "0001-00012698" where:
    - First 4 digits (0001) = point of sale (Punto de Venta)
    - Last 8 digits (00012698) = invoice number
    Make sure to extract both correctly.
    """

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_data
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json"
        }
    }

    # Intentamos varias combinaciones de URL y Modelos para evitar el 404
    endpoints = [
        ("v1", "gemini-1.5-flash"),
        ("v1beta", "gemini-1.5-flash"),
        ("v1", "gemini-1.5-flash-latest"),
        ("v1beta", "gemini-pro")
    ]
    
    data = None
    last_error = ""
    
    for version, model_name in endpoints:
        url = f"https://generativelanguage.googleapis.com/{version}/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        try:
            res = requests.post(url, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                break
            else:
                last_error = f"{res.status_code}: {res.text}"
        except Exception as e:
            last_error = str(e)
            continue

    if not data:
        print(f"Gemini API Error (all attempts failed): {last_error}")
        return None
    
    try:
        # Get text from Gemini response
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        # Clean potential markdown backticks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        return json.loads(text)
    except Exception as e:
        print(f"Gemini Error: {e}")
        return None
