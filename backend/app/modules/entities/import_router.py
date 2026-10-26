"""Importación revisable de clientes/proveedores desde Excel.

Nunca borra datos existentes, no inventa condición fiscal y consolida por CUIT
solo cuando coincide exactamente el identificador normalizado.
"""
from collections import defaultdict
from io import BytesIO
from typing import Literal

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.models import Entity, EntityType, generate_uuid
from app.modules.auth.auth_router import check_permission
from .import_utils import clean_cell, format_cuit, normalize_label, parse_tax_category


router = APIRouter(prefix="/entities/import", tags=["Import Entities"])
ALIASES = {
    "name": ["razon social", "nombre", "cliente", "proveedor", "name", "nombre razon social", "entidad", "descripcion", "detalle"],
    "tax_id": ["cuit", "tax id", "identificacion", "doc", "documento", "cuit cuil", "nro doc", "c u i t", "nro doc"],
    "tax_category": ["iva", "condicion iva", "iva rate", "tax category", "categoria", "sit iva", "situacion iva"],
    "email": ["email", "correo", "e mail", "mail", "casilla"],
    "phone": ["telefono", "celular", "phone", "cel", "tel", "movil"],
    "address": ["direccion", "address", "calle", "domicilio"],
    "city": ["localidad", "ciudad", "city", "pueblo", "loc"],
    "state": ["provincia", "estado", "state", "prov"],
    "zip_code": ["cp", "c p", "zip code", "codigo postal"],
    "notes": ["notas", "observaciones", "comentarios", "notes", "obs"],
}
NORMAL_ALIASES = {field: set(map(normalize_label, aliases)) for field, aliases in ALIASES.items()}
MAX_IMPORT_BYTES = 8 * 1024 * 1024
MAX_IMPORT_ROWS = 25000


def sheet_type(value, sheet, filename):
    if value in ("client", "provider"):
        return EntityType.CLIENT if value == "client" else EntityType.PROVIDER
    hint = normalize_label(f"{sheet} {filename}")
    if any(word in hint for word in ("proveedor", "supplier", "vendor", "compra")):
        return EntityType.PROVIDER
    return EntityType.CLIENT


def columns_for_sheet(frame):
    """Detecta encabezados con al menos un campo de nombre explícito."""
    best = None
    for i in range(min(len(frame), 30)):
        names = [normalize_label(clean_cell(v)) for v in frame.iloc[i].tolist()]
        matched = {
            field: idx for field, aliases in NORMAL_ALIASES.items()
            for idx, heading in enumerate(names) if heading in aliases
        }
        if "name" in matched and (best is None or len(matched) > len(best[1])):
            best = (i, matched)
    return best


def next_codes(entities):
    current = {"C": 0, "P": 0}
    for entity in entities:
        code = str(entity.code or "")
        prefix, separator, serial = code.partition("-")
        if separator and prefix in current and serial.isdigit():
            current[prefix] = max(current[prefix], int(serial))

    def make_code(entity_type):
        prefix = "P" if entity_type == EntityType.PROVIDER else "C"
        current[prefix] += 1
        return f"{prefix}-{current[prefix]:04d}"

    return make_code


@router.post("/", dependencies=[Depends(check_permission("customers", "create"))])
async def import_entities(
    file: UploadFile = File(...),
    type: Literal["auto", "client", "provider"] = "auto",
    dry_run: bool = False,
    reset: bool = False,
    db: Session = Depends(get_db),
):
    if reset:
        raise HTTPException(400, "La importación no permite eliminar entidades existentes.")
    filename = file.filename or ""
    if not filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Seleccioná un Excel .xlsx o .xls.")

    contents = await file.read(MAX_IMPORT_BYTES + 1)
    if len(contents) > MAX_IMPORT_BYTES:
        raise HTTPException(413, "El Excel supera el límite de 8 MB.")
    try:
        sheets = pd.read_excel(BytesIO(contents), sheet_name=None, header=None, dtype=object)
    except Exception as exc:
        raise HTTPException(400, "No se pudo abrir el Excel. Revisá que sea un archivo válido.") from exc

    stats = {"created": 0, "updated": 0, "merged": 0, "skipped": 0, "errors": [], "warnings": []}
    preview = []
    existing_entities = db.query(Entity).all()
    by_cuit = {}
    by_name = defaultdict(list)
    for current in existing_entities:
        try:
            tax_id = format_cuit(current.tax_id)
        except ValueError:
            tax_id = None
        if tax_id:
            by_cuit.setdefault(tax_id, current)
        by_name[normalize_label(current.name)].append(current)
    get_code = next_codes(existing_entities)
    seen_rows = 0

    try:
        for sheet_name, frame in sheets.items():
            if frame.empty:
                continue
            parsed_headers = columns_for_sheet(frame)
            if not parsed_headers:
                stats["errors"].append(f"Hoja {sheet_name}: falta la columna de nombre o razón social.")
                continue
            header_index, mapping = parsed_headers
            target_type = sheet_type(type, sheet_name, filename)
            for row_index in range(header_index + 1, len(frame)):
                seen_rows += 1
                if seen_rows > MAX_IMPORT_ROWS:
                    raise HTTPException(413, "El Excel supera el límite de 25.000 filas.")
                row = frame.iloc[row_index]
                position = f"Hoja {sheet_name}, fila {row_index + 1}"
                name = clean_cell(row.iloc[mapping["name"]]).strip().upper()
                if not name or name in ("NAN", "NONE", "NOMBRE", "RAZÓN SOCIAL", "-"):
                    stats["skipped"] += 1
                    continue
                try:
                    tax_id = format_cuit(row.iloc[mapping["tax_id"]]) if "tax_id" in mapping else None
                except ValueError:
                    stats["errors"].append(f"{position}: CUIT inválido en {name}; fila omitida.")
                    stats["skipped"] += 1
                    continue

                fields = {}
                for field in ("email", "phone", "address", "city", "state", "zip_code", "notes"):
                    if field in mapping:
                        value = clean_cell(row.iloc[mapping[field]])
                        if value:
                            fields[field] = value
                if "tax_category" in mapping:
                    raw_iva = clean_cell(row.iloc[mapping["tax_category"]])
                    category = parse_tax_category(raw_iva)
                    if category:
                        fields["tax_category"] = category
                    elif raw_iva:
                        stats["warnings"].append(f"{position}: condición de IVA «{raw_iva}» sin reconocer; verificar manualmente.")

                existing = by_cuit.get(tax_id) if tax_id else None
                if not existing and not tax_id:
                    # Sin CUIT solo es seguro consolidar por nombre si ambos carecen de CUIT.
                    existing = next((item for item in by_name[normalize_label(name)] if not item.tax_id), None)
                if existing and existing.type == EntityType.EMPLOYEE:
                    stats["errors"].append(f"{position}: el CUIT pertenece a un empleado; revisá la entidad manualmente.")
                    stats["skipped"] += 1
                    continue

                action = "create"
                if existing:
                    action = "update"
                    if existing.type in (EntityType.CLIENT, EntityType.PROVIDER) and existing.type != target_type:
                        existing.type = EntityType.MIXED
                        stats["merged"] += 1
                        action = "merge"
                    if not existing.tax_id and tax_id:
                        existing.tax_id = tax_id
                    for key, value in fields.items():
                        if not getattr(existing, key, None):
                            setattr(existing, key, value)
                    stats["updated"] += 1
                else:
                    existing = Entity(
                        id=generate_uuid(),
                        name=name, type=target_type, code=get_code(target_type), tax_id=tax_id,
                        **fields,
                    )
                    db.add(existing)
                    by_name[normalize_label(name)].append(existing)
                    stats["created"] += 1
                if tax_id:
                    by_cuit[tax_id] = existing
                if len(preview) < 20:
                    preview.append({
                        "name": name, "tax_id": tax_id, "type": str(existing.type.value),
                        "action": action,
                    })

        if stats["created"] + stats["updated"] == 0:
            db.rollback()
            raise HTTPException(422, detail={"message": "No se encontraron clientes válidos para importar.", "stats": stats})
        if dry_run:
            db.rollback()
        else:
            db.commit()
        return {
            "message": "Vista previa generada" if dry_run else "Importación confirmada",
            "dry_run": dry_run,
            "stats": stats,
            "preview": preview,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, "No se pudo completar la importación; no se guardaron cambios.") from exc
