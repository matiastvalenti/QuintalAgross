from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.db.models.task_models import TaskStatus, TaskPriority

class UserShort(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None

    model_config = {
        "from_attributes": True
    }

class EntityShort(BaseModel):
    id: str
    name: str # Note: Entity uses 'name' instead of 'full_name'
    email: Optional[str] = None
    code: Optional[str] = None

    model_config = {
        "from_attributes": True
    }
        
class TaskBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    status: Optional[str] = TaskStatus.PENDING.value
    priority: Optional[str] = TaskPriority.MEDIUM.value
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    additional_notes: Optional[str] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    additional_notes: Optional[str] = None

class TaskResponse(TaskBase):
    id: str
    creator_id: str
    creator: Optional[UserShort] = None
    assignee: Optional[EntityShort] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True
    }

class NotificationBase(BaseModel):
    title: str
    message: str
    is_read: bool = False
    reference_url: Optional[str] = None

class NotificationResponse(NotificationBase):
    id: str
    user_id: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }
