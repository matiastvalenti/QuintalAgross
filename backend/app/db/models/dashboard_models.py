from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import relationship

from app.db.session import Base


class DashboardPreference(Base):
    __tablename__ = "dashboard_preferences"

    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    layout = Column(JSON, nullable=False, default=list)
    hidden_widgets = Column(JSON, nullable=False, default=list)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user = relationship("User")
