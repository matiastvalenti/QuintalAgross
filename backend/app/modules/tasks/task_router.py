from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.db.models.auth_models import User
from app.db.models.models import Entity, EntityType
from app.db.models.task_models import Task, Notification, TaskStatus
from app.modules.auth.auth_router import get_current_user
from . import task_schemas
from app.db.models.models import AccountMovement, Document, DocumentStatus, EntityType

router = APIRouter(prefix="/tasks", tags=["Tasks"])

# --- TASKS ---

@router.get("", response_model=List[task_schemas.TaskResponse])
def get_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status: str = None,
    date: str = None
):
    if "admin" in current_user.roles or "owner" in current_user.roles:
        query = db.query(Task)
    else:
        query = db.query(Task).filter(
            or_(
                Task.creator_id == current_user.id,
                Task.assignee_id == current_user.id
            )
        )
    if status:
        query = query.filter(Task.status == status)
    
    if date:
        try:
            target_date = datetime.strptime(date, '%Y-%m-%d').date()
            # Check tasks for that day (due_date)
            from sqlalchemy import func
            query = query.filter(func.date(Task.due_date) == target_date)
        except Exception:
            pass
            
    return query.order_by(Task.created_at.desc()).all()

@router.post("", response_model=task_schemas.TaskResponse)
def create_task(
    task_in: task_schemas.TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_task = Task(
        title=task_in.title,
        description=task_in.description,
        status=task_in.status,
        priority=task_in.priority,
        creator_id=current_user.id,
        assignee_id=task_in.assignee_id,
        due_date=task_in.due_date,
        start_time=task_in.start_time,
        end_time=task_in.end_time,
        category=task_in.category,
        address=task_in.address,
        additional_notes=task_in.additional_notes
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    
    # Notify assignee if it's someone else
    if task_in.assignee_id and task_in.assignee_id != current_user.id:
        notif = Notification(
            user_id=task_in.assignee_id,
            title="Nueva tarea asignada",
            message=f"{current_user.full_name or current_user.email} te ha asignado la tarea: {task_in.title}",
            reference_url=f"/tasks"
        )
        db.add(notif)
        db.commit()

    return new_task

@router.put("/{task_id}", response_model=task_schemas.TaskResponse)
def update_task(
    task_id: str,
    task_in: task_schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    old_status = task.status
    
    if task_in.title is not None:
        task.title = task_in.title
    if task_in.description is not None:
        task.description = task_in.description
    if task_in.status is not None:
        task.status = task_in.status
        if task_in.status == TaskStatus.COMPLETED.value and old_status != TaskStatus.COMPLETED.value:
            task.completed_at = datetime.utcnow()
    if task_in.priority is not None:
        task.priority = task_in.priority
    if task_in.assignee_id is not None:
        task.assignee_id = task_in.assignee_id
    if task_in.due_date is not None:
        task.due_date = task_in.due_date
    if task_in.start_time is not None:
        task.start_time = task_in.start_time
    if task_in.end_time is not None:
        task.end_time = task_in.end_time
    if task_in.category is not None:
        task.category = task_in.category
    if task_in.address is not None:
        task.address = task_in.address
    if task_in.additional_notes is not None:
        task.additional_notes = task_in.additional_notes

    db.commit()
    db.refresh(task)
    
    # Notify creator if task was completed by assignee
    if task.status == TaskStatus.COMPLETED.value and old_status != TaskStatus.COMPLETED.value:
        if current_user.id != task.creator_id:
            notif = Notification(
                user_id=task.creator_id,
                title="Tarea completada",
                message=f"{current_user.full_name or current_user.email} ha completado la tarea: {task.title}",
                reference_url=f"/tasks"
            )
            db.add(notif)
            db.commit()
            
    return task

@router.delete("/{task_id}")
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
        
    db.delete(task)
    db.commit()
    return {"message": "Tarea eliminada"}

# --- ALERTS SYNC ---

def sync_debt_alerts(db: Session, user_id: str):
    """Escanear entidades y documentos para generar notificaciones de alerta."""
    now = datetime.now()
    
    # 1. Alertas de Límite de Crédito
    # Buscar entidades con saldo > límite de crédito
    from sqlalchemy import case, func
    from app.db.models.models import DocumentType
    debit_types = [DocumentType.INVOICE, DocumentType.DEBIT_NOTE, DocumentType.PURCHASE_INVOICE]
    
    subquery_balance = db.query(
        Document.entity_id,
        func.sum(
            case(
                (Document.doc_type.in_(debit_types), Document.total_amount_ars),
                else_=-Document.total_amount_ars
            )
        ).label("balance")
    ).group_by(Document.entity_id).subquery()
    
    over_limit_entities = db.query(Entity, subquery_balance.c.balance).join(
        subquery_balance, Entity.id == subquery_balance.c.entity_id
    ).filter(
        Entity.credit_limit > 0,
        subquery_balance.c.balance > Entity.credit_limit
    ).all()
    
    for entity, balance in over_limit_entities:
        title = "Límite de Crédito Excedido"
        message = f"La entidad {entity.name} ({entity.code}) ha excedido su límite de crédito. Saldo: ${balance:.2f} / Límite: ${entity.credit_limit:.2f}"
        
        # Evitar duplicados recientes (últimos 3 días)
        exists = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.title == title,
            Notification.message.like(f"La entidad {entity.name}%"),
            Notification.created_at >= datetime.utcnow().replace(hour=0, minute=0, second=0) - func.cast("3 days", func.Interval) if db.bind.dialect.name == 'postgresql' else func.date(Notification.created_at) >= func.date('now', '-3 days')
        ).first()
        
        if not exists:
            db.add(Notification(
                user_id=user_id,
                title=title,
                message=message,
                reference_url=f"/finanzas/vista360/{entity.id}"
            ))

    # 2. Alertas de Facturas Vencidas
    overdue_docs = db.query(Document).filter(
        Document.status.in_([DocumentStatus.OPEN, DocumentStatus.PARTIAL]),
        Document.due_date < now
    ).all()
    
    for doc in overdue_docs:
        title = "Factura Vencida"
        message = f"El documento {doc.number} de {doc.entity_name} venció el {doc.due_date.strftime('%d/%m/%Y')}. Monto: {doc.currency} {doc.total_amount:.2f}"
        
        # Evitar duplicados para el mismo documento
        exists = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.title == title,
            Notification.reference_url == f"/documents/{doc.id}"
        ).first()
        
        if not exists:
            db.add(Notification(
                user_id=user_id,
                title=title,
                message=message,
                reference_url=f"/documents/{doc.id}"
            ))
            
    # 3. Alertas de Cheques
    try:
        from app.db.models.finance_models import Cheque
        from datetime import date, timedelta
        
        today = date.today()
        upcoming_cheques = db.query(Cheque).filter(
            Cheque.estado.in_(["PENDIENTE", "EN_CARTERA", "DEPOSITADO"])
        ).all()
        
        for ch in upcoming_cheques:
            if not ch.f_pago:
                continue
            
            # 1. Alertas previas a la fecha de pago (f_pago)
            dado_por = ch.cliente_dador or (ch.entity.name if ch.entity else None) or "Desconocido"
            pagar_a = ch.entregado_a or (ch.endorsee.name if ch.endorsee else None) or "En cartera"

            # Check if overdue or due today
            if ch.f_pago <= today:
                title = f"Acredita HOY / Pasado - Chq #{ch.nro_cheque}"
                message = (
                    f"Recordatorio: Hacer ND por acreditación para el cheque {ch.banco} #{ch.nro_cheque} "
                    f"de ${ch.importe:,.2f}. Fecha de pago original: {ch.f_pago.strftime('%d/%m/%Y')}. "
                    f"Recibido de: {dado_por}. Entregado a: {pagar_a}."
                )
                ref_url = f"/finanzas/cheques?search={ch.nro_cheque}"
                
                existing = db.query(Notification).filter(
                    Notification.user_id == user_id,
                    Notification.title == title
                ).first()
                
                if existing:
                    existing.message = message
                    existing.reference_url = ref_url
                else:
                    db.add(Notification(user_id=user_id, title=title, message=message, reference_url=ref_url))
            else:
                for days, label in [(5, "Próximo a Acreditar (5 días)"), (2, "Próximo a Acreditar (2 días)")]:
                    if ch.f_pago - timedelta(days=days) <= today:
                        title = f"{label} - Chq #{ch.nro_cheque}"
                        message = (
                            f"Recordatorio: Hacer ND por acreditación para el cheque {ch.banco} #{ch.nro_cheque} "
                            f"de ${ch.importe:,.2f}. Fecha de pago: {ch.f_pago.strftime('%d/%m/%Y')}. "
                            f"Recibido de: {dado_por}. Entregado a: {pagar_a}."
                        )
                        ref_url = f"/finanzas/cheques?search={ch.nro_cheque}"
                        
                        existing = db.query(Notification).filter(
                            Notification.user_id == user_id,
                            Notification.title == title
                        ).first()
                        
                        if existing:
                            existing.message = message
                            existing.reference_url = ref_url
                        else:
                            db.add(Notification(user_id=user_id, title=title, message=message, reference_url=ref_url))
                        break # Only trigger the most relevant one

            # 2. Alertas de vencimiento de validez del cheque (f_vencimiento)
            if ch.estado in ["PENDIENTE", "EN_CARTERA"]:
                vencimiento = ch.f_vencimiento
                if not vencimiento and ch.f_pago: 
                     vencimiento = ch.f_pago + timedelta(days=30)
                
                if vencimiento:
                    if vencimiento <= today:
                        title = f"¡ALERTA! Cheque VENCIDO o VENCE HOY - Chq #{ch.nro_cheque}"
                        message = (
                            f"URGENTE: El cheque {ch.banco} #{ch.nro_cheque} de ${ch.importe:,.2f} "
                            f"perdió o pierde su validez el {vencimiento.strftime('%d/%m/%Y')}. "
                            f"Recibido de: {dado_por}. Entregado a: {pagar_a}. "
                            f"Gestione su depósito o cobro."
                        )
                        ref_url = f"/finanzas/cheques?search={ch.nro_cheque}"
                        
                        existing = db.query(Notification).filter(
                            Notification.user_id == user_id,
                            Notification.title == title
                        ).first()
                        
                        if existing:
                            existing.message = message
                            existing.reference_url = ref_url
                        else:
                            db.add(Notification(user_id=user_id, title=title, message=message, reference_url=ref_url))
                    else:
                        for days_before, label in [(5, "Vence en 5 días")]:
                            if vencimiento - timedelta(days=days_before) <= today:
                                title = f"¡ALERTA! Cheque a punto de Vencer ({label}) - Chq #{ch.nro_cheque}"
                                message = (
                                    f"URGENTE: El cheque {ch.banco} #{ch.nro_cheque} de ${ch.importe:,.2f} "
                                    f"perderá su validez el {vencimiento.strftime('%d/%m/%Y')}. "
                                    f"Recibido de: {dado_por}. Entregado a: {pagar_a}. "
                                    f"Gestione su depósito o cobro."
                                )
                                ref_url = f"/finanzas/cheques?search={ch.nro_cheque}"
                                
                                existing = db.query(Notification).filter(
                                    Notification.user_id == user_id,
                                    Notification.title == title
                                ).first()
                                
                                if existing:
                                    existing.message = message
                                    existing.reference_url = ref_url
                                else:
                                    db.add(Notification(user_id=user_id, title=title, message=message, reference_url=ref_url))
                                break

    except Exception as e:
        print(f"Error syncing cheque alerts: {e}")

    db.commit()

# --- NOTIFICATIONS ---

@router.get("/notifications/check-alerts")
def check_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Trigger manual de sincronización de alertas."""
    sync_debt_alerts(db, current_user.id)
    return {"status": "ok", "message": "Alertas sincronizadas"}

@router.get("/notifications", response_model=List[task_schemas.NotificationResponse])
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    unread_only: bool = False
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    return query.order_by(Notification.created_at.desc()).all()

@router.put("/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.id
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"message": "Notificación leída"}

@router.put("/notifications/{notif_id}/unread")
def mark_notification_unread(
    notif_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.id
    ).first()
    if notif:
        notif.is_read = False
        db.commit()
    return {"message": "Notificación marcada como no leída"}
    
@router.put("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(Notification).filter(Notification.user_id == current_user.id).update({"is_read": True})
    db.commit()
    return {"message": "Todas las notificaciones marcadas como leídas"}

# --- EMPLOYEES ---
@router.get("/employees", response_model=List[task_schemas.EntityShort])
def get_employees(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    employees = db.query(Entity).filter(Entity.type == EntityType.EMPLOYEE).all()
    return employees
