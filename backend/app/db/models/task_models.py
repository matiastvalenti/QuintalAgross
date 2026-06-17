import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Enum, JSON, ForeignKey, Text
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from app.db.session import Base
from app.db.models.models import Entity

def generate_uuid():
    return str(uuid.uuid4())

class TaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

class TaskPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default=TaskStatus.PENDING.value)
    priority = Column(String, default=TaskPriority.MEDIUM.value)
    
    # User mapping
    creator_id = Column(String, ForeignKey("users.id"), nullable=False)
    creator = relationship("User", foreign_keys=[creator_id], backref="created_tasks")
    
    assignee_id = Column(String, ForeignKey("entities.id"), nullable=True)
    assignee = relationship("Entity", foreign_keys=[assignee_id], backref="assigned_tasks")
    
    due_date = Column(DateTime, nullable=True)
    start_time = Column(String, nullable=True) # e.g. "08:00"
    end_time = Column(String, nullable=True)   # e.g. "10:30"
    category = Column(String, nullable=True)   # e.g. "Otro", "Cobranza", etc.
    address = Column(String, nullable=True)
    additional_notes = Column(Text, nullable=True)
    
    completed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    user = relationship("User", backref="notifications")
    
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    reference_url = Column(String, nullable=True) # E.g. /tasks/123
    
    created_at = Column(DateTime, default=datetime.utcnow)
