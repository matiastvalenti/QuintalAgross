import requests
import json

payload = {
  "entity_id": "a95392b4-cf90-4d06-9aa7-fdd59e61cb10",
  "date": "2026-06-25",
  "currency": "ARS",
  "exchange_rate": 1000.0,
  "notes": "Cobro de factura 0001-00000001",
  "doc_type": "RECEIPT",
  "payments": [
    {
      "type": "CASH",
      "amount": 1000.50,
      "description": "Cobro de factura",
      "bank_name": None,
      "reference_number": None,
      "issue_date": None,
      "due_date": None,
      "check_type": None,
      "drawer_name": None,
      "drawer_cuit": None
    }
  ],
  "applications": [
    {
      "from_document_id": "NEW",
      "to_document_id": "a95392b4-cf90-4d06-9aa7-fdd59e61cb10",
      "amount_applied": 1000.50,
      "exchange_rate": 1000.0
    }
  ]
}

res = requests.post("http://127.0.0.1:8000/accounting/documents/", json=payload)
print(res.status_code)
print(res.text)
