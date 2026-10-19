from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func

from app.db.database import Base


class GmailAttachmentImport(Base):
    """Tracks Gmail PDFs through review so imported statements stay idempotent."""

    __tablename__ = "gmail_attachment_imports"
    __table_args__ = (UniqueConstraint("message_id", "attachment_id", name="uq_gmail_attachment"),)

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(String, nullable=False, index=True)
    # Gmail's external attachmentId changes between message reads for some messages;
    # store the stable MIME partId in the existing attachment_id DB column instead.
    part_id = Column("attachment_id", String, nullable=False)
    filename = Column(String, nullable=False)
    statement_id = Column(Integer, ForeignKey("statements.id", ondelete="SET NULL"), nullable=True)
    status = Column(String, nullable=False, default="pending_review")  # pending_review | processed | duplicate
    imported_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
