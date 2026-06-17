from datetime import date, timedelta, datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.db.models.finance_models import Cheque, AlertLog
from app.db.models.task_models import Notification
from app.db.models.auth_models import User
from .mailer import send_email
from apscheduler.schedulers.background import BackgroundScheduler
from .config import settings
from app.db.session import SessionLocal

# Estados que cortan alertas normales:
CUT_STATES = {"ACREDITADO", "ENTREGADO", "VENCIDO", "ANULADO", "RECHAZADO"}

def init_scheduler():
    scheduler = BackgroundScheduler()
    def job():
        db = SessionLocal()
        try:
            import logging
            logging.getLogger(__name__).info(f"[SCHEDULER] Running daily alerts at {datetime.now()}")
            run_alerts(db)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"[SCHEDULER] Error: {e}", exc_info=True)
        finally:
            db.close()
            
    # Configurar tarea programada (ej: 08:00 AM)
    scheduler.add_job(job, 'cron', hour=settings.alerts_hour, minute=settings.alerts_minute)
    scheduler.start()
    import logging
    logging.getLogger(__name__).info(f"[SCHEDULER] Automated alerts initialized for {settings.alerts_hour:02d}:{settings.alerts_minute:02d}")
    return scheduler

def _already_sent(db: Session, cheque_id: int, alert_type: str, scheduled_for: date) -> bool:
    """Evita duplicidad de alertas para el mismo cheque y mismo evento."""
    return db.query(AlertLog).filter(
        AlertLog.cheque_id == cheque_id,
        AlertLog.alert_type == alert_type,
        AlertLog.scheduled_for == scheduled_for
    ).first() is not None

def _log_sent(db: Session, cheque_id: int, alert_type: str, scheduled_for: date):
    db.add(AlertLog(cheque_id=cheque_id, alert_type=alert_type, scheduled_for=scheduled_for))
    # No comiteamos aquí, el motor principal hace el commit final

def _fmt_money(x):
    try:
        return f"{float(x):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(x)

def update_expired_states(db: Session, today: date):
    """Garantiza que f_vencimiento exista y marca cheques como VENCIDOS si pasaron su fecha."""
    # 1. Backfill f_vencimiento (f_pago + 30 días si no tiene)
    missing_venc = db.query(Cheque).filter(
        Cheque.f_vencimiento.is_(None),
        Cheque.f_pago.isnot(None)
    ).all()
    
    for ch in missing_venc:
        ch.f_vencimiento = ch.f_pago + timedelta(days=30)
    
    # 2. Transición a estado VENCIDO
    expired = db.query(Cheque).filter(
        Cheque.estado.in_(["PENDIENTE", "EN_CARTERA", "DEPOSITADO"]),
        Cheque.f_vencimiento.isnot(None),
        Cheque.f_vencimiento < today
    ).all()
    
    for ch in expired:
        ch.estado = "VENCIDO"
    
    if missing_venc or expired:
        db.commit()
    return len(expired)

def run_alerts(db: Session, today: date | None = None) -> dict:
    """
    Motor principal de alertas. Se ejecuta diariamente.
    Asegura que se generen notificaciones internas (campanita) y correo de resumen.
    """
    if today is None:
        today = date.today()
    
    alerts_buffer = []  # Para el correo
    log_counts = {"new": 0, "expired": 0}

    print(f"--- INICIANDO MOTOR DE ALERTAS ({today}) ---")

    # 0. Actualizar estados de cheques caducados administrativamente
    expired_count = update_expired_states(db, today)
    log_counts["expired"] = expired_count

    # A. REGLAS DE NOTIFICACIÓN
    acred_rules = [
        (5, "ACRED_5", "vence en 5 días"),
        (0, "ACRED_0", "vence hoy")
    ]
    
    expir_rules = [
        (5, "EXPIR_5", "caduca en 5 días"),
        (0, "EXPIR_0", "caduca hoy")
    ]

    target_users = db.query(User).filter(User.active == True).all()
    if not target_users:
        print("ALERTA: No hay usuarios activos registrados.")

    # Query de cheques activos
    cheques = db.query(Cheque).filter(
        Cheque.estado.in_(["PENDIENTE", "EN_CARTERA", "DEPOSITADO"])
    ).all()

    for ch in cheques:
        # 1. Acreditación (f_pago)
        if ch.f_pago:
            for days, a_type, label in acred_rules:
                scheduled_for = ch.f_pago - timedelta(days=days)
                # Catch-up logic: <= today
                if today >= scheduled_for and not _already_sent(db, ch.id, a_type, scheduled_for):
                    msg = f"Cheque {ch.banco} #{ch.nro_cheque} (${_fmt_money(ch.importe)}) {label} ({ch.f_pago})."
                    alerts_buffer.append({"cheque_id": ch.id, "type": a_type, "date": scheduled_for, "msg": msg})
                    
                    for user in target_users:
                        db.add(Notification(
                            user_id=user.id,
                            title=f"Alerta de Cheque: {label} - #{ch.nro_cheque}",
                            message=msg,
                            reference_url=f"/finance/cheques?nro={ch.nro_cheque}"
                        ))
                    _log_sent(db, ch.id, a_type, scheduled_for)
                    log_counts["new"] += 1

        # 2. Vencimiento de plazo (f_vencimiento)
        if ch.f_vencimiento:
            for days, a_type, label in expir_rules:
                scheduled_for = ch.f_vencimiento - timedelta(days=days)
                if today >= scheduled_for and not _already_sent(db, ch.id, a_type, scheduled_for):
                    msg = f"¡ATENCIÓN! Cheque {ch.banco} #{ch.nro_cheque} (${_fmt_money(ch.importe)}) {label} ({ch.f_vencimiento})."
                    alerts_buffer.append({"cheque_id": ch.id, "type": a_type, "date": scheduled_for, "msg": msg})
                    
                    for user in target_users:
                        db.add(Notification(
                            user_id=user.id,
                            title=f"URGENTE: {label} - #{ch.nro_cheque}",
                            message=msg,
                            reference_url=f"/finance/cheques?nro={ch.nro_cheque}"
                        ))
                    _log_sent(db, ch.id, a_type, scheduled_for)
                    log_counts["new"] += 1

    # B. COMMIT FINAL
    try:
        db.commit()
        print(f"Commit exitoso: {log_counts['new']} alertas creadas.")
    except Exception as e:
        db.rollback()
        print(f"ERROR al guardar alertas: {e}")
        return {"status": "error", "message": str(e)}

    # C. ENVÍO DE CORREO RESUMEN
    if not alerts_buffer:
        return {"status": "ok", "message": "Procesado sin alertas nuevas.", "counts": log_counts}
    
    html = f"<h2>Resumen de Alertas de Cheques - {today.strftime('%d/%m/%Y')}</h2><ul>"
    for item in alerts_buffer:
        html += f"<li>{item['msg']}</li>"
    html += f"</ul><p><small>Total alertas: {len(alerts_buffer)}</small></p>"

    try:
        res = send_email(
            subject=f"ALERTA CHEQUES: {len(alerts_buffer)} novedades",
            html_body=html
        )
        return {"status": "ok", "message": "Procesado con resumen enviado.", "counts": log_counts}
    except Exception as e:
        print(f"Mailer error: {e}")
        return {"status": "warning", "message": "Alertas creadas, mail falló.", "counts": log_counts}
