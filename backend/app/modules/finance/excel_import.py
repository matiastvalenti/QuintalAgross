from __future__ import annotations
import pandas as pd
import asyncio
from datetime import datetime, date, timedelta
from typing import Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from app.db.models.finance_models import Cheque


COLS = {
    "banco": "Banco",
    "nro_cheque": "Nro. Cheque",
    "tipo": "Tipo",
    "importe": "Importe",
    "f_pago": "F. Pago",
    "f_movimiento": "F. Movimiento",
    "movimiento": "Movimiento",
    "cliente_dador": "Cliente/Dador",
    "cuit_emisor": "CUIT Emisor",
    "beneficiario": "Beneficiario",
    "rechazado": "Rechazado",
}

def _to_date(x) -> date | None:
    if pd.isna(x):
        return None
    if isinstance(x, date) and not isinstance(x, datetime):
        return x
    try:
        return pd.to_datetime(x).date()
    except Exception:
        return None

def _to_str(x) -> str:
    if pd.isna(x):
        return ""
    return str(x).strip()

def _to_bool_rechazado(x) -> bool:
    if pd.isna(x):
        return False
    s = str(x).strip().lower()
    return s in {"si", "sí", "yes", "true", "1", "rechazado"}

def import_excel_to_db(db: Session, file_path: str) -> Dict[str, Any]:
    print(f"\n[IMPORT] INICIANDO carga de: {file_path}")
    print(f"[IMPORT] Hora: {datetime.now()}")

    # Try to auto-detect header row by looking for expected columns
    header_row = None
    header_in_row_data = False
    
    for skip_rows in range(0, 15):  # Check first 15 rows
        try:
            # First check if headers are the actual columns
            test_df = pd.read_excel(file_path, dtype=str, skiprows=skip_rows, nrows=1)
            
            # 1. Check columns
            for expected_col in COLS.values():
                for col in test_df.columns:
                    if isinstance(col, str) and expected_col.lower() in col.lower():
                        header_row = skip_rows
                        break
                if header_row is not None: break
            
            if header_row is not None: break
            
            # 2. Check first row data (in case pandas took a title as column name)
            if not test_df.empty:
                first_row = test_df.iloc[0].tolist()
                for expected_col in COLS.values():
                    for val in first_row:
                        if isinstance(val, str) and expected_col.lower() in val.lower():
                            header_row = skip_rows + 1 # Actual headers are in this row data, so skip one more
                            header_in_row_data = True
                            break
                    if header_row is not None: break
            
            if header_row is not None: break
            
        except Exception as e:
            print(f"[IMPORT] Warning: Error leyendo fila {skip_rows} para headers: {e}")
            continue
    
    # If we couldn't find headers, default to row 0
    if header_row is None:
        header_row = 0
        print("[IMPORT] No se encontraron encabezados reconocidos, usando fila 0")
    else:
        print(f"[IMPORT] Encabezados encontrados en skip_rows={header_row} (DataRow={header_in_row_data})")
    
    # Read with the correct header row
    try:
        df = pd.read_excel(file_path, dtype=str, skiprows=header_row)
        df_raw = pd.read_excel(file_path, skiprows=header_row)
        print(f"[IMPORT] Excel leído correctamente. Filas: {len(df)}")
        print(f"[IMPORT] Columnas detectadas: {list(df.columns)}")
    except Exception as e:
        print(f"[IMPORT] ERROR FATAL leyendo Excel: {e}")
        return {"message": f"Error leyendo Excel: {str(e)}", "details": {"errors": 1}}
    
    # Create a case-insensitive column mapping
    col_map = {}
    for key, expected_name in COLS.items():
        # Try to find column by exact match first
        if expected_name in df.columns:
            col_map[key] = expected_name
        else:
            # Try case-insensitive substring match
            for col in df.columns:
                if isinstance(col, str) and expected_name.lower() in col.lower():
                    col_map[key] = col
                    break
    
    print(f"[IMPORT] Mapeo de columnas resultante: {col_map}")

    added = 0
    updated = 0
    ignored = 0
    errors: List[Dict[str, Any]] = []

    raw_cols = {c: c for c in df_raw.columns}
    
    print("[IMPORT] Comenzando procesamiento de filas...")

    processed_keys = set()
    for idx, row in df.iterrows():
        try:
            banco = _to_str(row.get(col_map.get("banco", COLS["banco"]), "")).strip()
            nro = _to_str(row.get(col_map.get("nro_cheque", COLS["nro_cheque"]), "")).strip()
            cuit = _to_str(row.get(col_map.get("cuit_emisor", COLS["cuit_emisor"]), "")).strip()
            
            if not banco or not nro:
                ignored += 1
                continue
            
            # Evitar procesar el mismo cheque dos veces en el mismo archivo (intra-file duplicates)
            cheque_key = (banco, nro, cuit)
            if cheque_key in processed_keys:
                ignored += 1
                continue
            processed_keys.add(cheque_key)

            raw = df_raw.iloc[idx] if idx < len(df_raw) else None

            tipo = _to_str(row.get(col_map.get("tipo", COLS["tipo"]), ""))
            cliente = _to_str(row.get(col_map.get("cliente_dador", COLS["cliente_dador"]), ""))
            beneficiario = _to_str(row.get(col_map.get("beneficiario", COLS["beneficiario"]), ""))
            movimiento = _to_str(row.get(col_map.get("movimiento", COLS["movimiento"]), ""))
            moneda = _to_str(row.get("Moneda", "")) 

            importe_val = None
            importe_col = col_map.get("importe", COLS["importe"])
            if raw is not None and importe_col in raw_cols:
                try:
                    importe_val = float(raw[importe_col]) if not pd.isna(raw[importe_col]) else None
                except Exception:
                    importe_val = None

            f_pago = None
            f_pago_col = col_map.get("f_pago", COLS["f_pago"])
            if raw is not None and f_pago_col in raw_cols:
                f_pago = _to_date(raw[f_pago_col])
            if f_pago is None:
                f_pago = _to_date(row.get(f_pago_col, None))

            f_mov = None
            f_mov_col = col_map.get("f_movimiento", COLS["f_movimiento"])
            if raw is not None and f_mov_col in raw_cols:
                f_mov = _to_date(raw[f_mov_col])
            if f_mov is None:
                f_mov = _to_date(row.get(f_mov_col, None))

            rechazado = _to_bool_rechazado(row.get(col_map.get("rechazado", COLS["rechazado"]), ""))

            entregado_a = None
            fecha_entrega = None
            nro_orden_pago = None
            
            if movimiento and movimiento.upper().startswith("DP-"):
                fecha_entrega = f_mov
                nro_orden_pago = movimiento
            elif beneficiario and beneficiario.lower() not in ['', 'nan', 'none']:
                entregado_a = beneficiario
                fecha_entrega = f_mov 
                nro_orden_pago = movimiento 

            f_venc = (f_pago + timedelta(days=30)) if f_pago else None

            # First check DB
            existing = db.query(Cheque).filter(
                Cheque.banco == banco,
                Cheque.nro_cheque == nro,
                Cheque.cuit_emisor == cuit
            ).one_or_none()

            if existing:
                changed = False
                
                def check_diff(val1, val2): return val2 is not None and val1 != val2

                if check_diff(existing.tipo, tipo): existing.tipo = tipo; changed = True
                if check_diff(existing.cliente_dador, cliente): existing.cliente_dador = cliente; changed = True
                if check_diff(existing.beneficiario, beneficiario): existing.beneficiario = beneficiario; changed = True
                if check_diff(existing.movimiento, movimiento): existing.movimiento = movimiento; changed = True
                if moneda and existing.moneda != moneda: existing.moneda = moneda; changed = True

                if importe_val is not None and (existing.importe is None or abs(float(existing.importe) - float(importe_val)) > 0.01):
                    existing.importe = importe_val
                    changed = True

                if f_pago and existing.f_pago != f_pago:
                    existing.f_pago = f_pago
                    existing.f_vencimiento = f_venc
                    changed = True

                if f_mov and existing.f_movimiento != f_mov:
                    existing.f_movimiento = f_mov
                    changed = True

                if check_diff(existing.entregado_a, entregado_a): existing.entregado_a = entregado_a; changed = True
                if check_diff(existing.fecha_entrega, fecha_entrega): existing.fecha_entrega = fecha_entrega; changed = True
                if check_diff(existing.nro_orden_pago, nro_orden_pago): existing.nro_orden_pago = nro_orden_pago; changed = True

                if existing.rechazado != rechazado:
                    existing.rechazado = rechazado
                    changed = True
                
                new_estado = None
                today = date.today()
                
                if rechazado:
                    new_estado = "RECHAZADO"
                elif movimiento and movimiento.upper().startswith("DP-"):
                    new_estado = "DEPOSITADO"
                elif entregado_a:
                    new_estado = "ENDOSADO"
                elif f_venc and f_venc < today:
                    new_estado = "VENCIDO"
                else:
                    new_estado = "EN_CARTERA"
                
                if existing.estado != new_estado:
                    existing.estado = new_estado
                    changed = True

                if changed:
                    updated += 1
                else:
                    ignored += 1
            else:
                today = date.today()
                if rechazado:
                    estado_inicial = "RECHAZADO"
                elif movimiento and movimiento.upper().startswith("DP-"):
                    estado_inicial = "DEPOSITADO"
                elif entregado_a:
                    estado_inicial = "ENDOSADO"
                elif f_venc and f_venc < today:
                    estado_inicial = "VENCIDO"
                else:
                    estado_inicial = "EN_CARTERA"
                
                new_cheque = Cheque(
                    banco=banco,
                    nro_cheque=nro,
                    cuit_emisor=cuit,
                    tipo=tipo or None,
                    importe=importe_val,
                    moneda=moneda or None,
                    f_pago=f_pago,
                    f_movimiento=f_mov,
                    movimiento=movimiento or None,
                    cliente_dador=cliente or None,
                    beneficiario=beneficiario or None,
                    rechazado=rechazado,
                    f_vencimiento=f_venc,
                    entregado_a=entregado_a,
                    fecha_entrega=fecha_entrega,
                    nro_orden_pago=nro_orden_pago,
                    estado=estado_inicial,
                )
                db.add(new_cheque)
                added += 1
            

        except Exception as e:
            ignored += 1
            print(f"[IMPORT] Error procesando fila {idx}: {str(e)}")

    print(f"[IMPORT] Procesamiento finalizado. Added: {added}, Updated: {updated}, Ignored: {ignored}")
    
    try:
        print("[IMPORT] Iniciando COMMIT masivo...")
        db.commit()
        print("[IMPORT] COMMIT EXITOSO.")
    except Exception as commit_error:
        db.rollback()
        print(f"[IMPORT] ERROR CRITICO COMMIT: {str(commit_error)}")
        errors.append({"error": str(commit_error)})
    
    return {
        "message": "La importación se completó correctamente.",
        "details": {
            "inserted": added,
            "updated": updated,
            "ignored": ignored,
            "errors": len(errors)
        }
    }
