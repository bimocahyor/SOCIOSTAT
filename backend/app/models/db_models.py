"""
SQLAlchemy ORM Models
All database entities for SOCIOSTAT.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime,
    ForeignKey, JSON, Index
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(256), unique=True, nullable=False, index=True)
    hashed_password = Column(String(256), nullable=False)
    full_name = Column(String(256), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=_uuid)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    name = Column(String(256), nullable=False)
    description = Column(Text, default="")
    schema_version = Column(String(16), default="1.0.0")
    active_dataset_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    owner = relationship("User", back_populates="projects")
    datasets = relationship("Dataset", back_populates="project", cascade="all, delete-orphan")
    output_documents = relationship("OutputDocument", back_populates="project", cascade="all, delete-orphan")
    syntax_scripts = relationship("SyntaxScript", back_populates="project", cascade="all, delete-orphan")
    analysis_records = relationship("AnalysisRecord", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_projects_owner_id", "owner_id"),
    )


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    name = Column(String(256), nullable=False)
    description = Column(Text, default="")
    schema_version = Column(String(16), default="1.0.0")

    # Variable metadata stored as JSON array
    variables_meta = Column(JSON, default=list)

    # Case data stored as JSON array of arrays
    # For large datasets this would move to a separate table or file
    cases_data = Column(JSON, default=list)

    # Active state
    active_filter = Column(JSON, nullable=True)
    weight_variable = Column(String(64), nullable=True)
    split_variables = Column(JSON, default=list)

    # Metadata
    n_cases = Column(Integer, default=0)
    n_variables = Column(Integer, default=0)
    source_file = Column(String(512), nullable=True)
    encoding = Column(String(32), default="utf-8")

    transformation_history = Column(JSON, default=list)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    project = relationship("Project", back_populates="datasets")
    analysis_records = relationship("AnalysisRecord", back_populates="dataset")

    __table_args__ = (
        Index("ix_datasets_project_id", "project_id"),
    )


class AnalysisRecord(Base):
    __tablename__ = "analysis_records"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    dataset_id = Column(String(36), ForeignKey("datasets.id"), nullable=True)

    procedure_id = Column(String(64), nullable=False)
    parameters = Column(JSON, default=dict)
    dataset_snapshot = Column(JSON, default=dict)
    filter_active = Column(JSON, nullable=True)
    weight_variable = Column(String(64), nullable=True)
    split_configuration = Column(JSON, default=list)
    engine_version = Column(String(32), default="1.0.0")
    syntax = Column(Text, default="")
    result = Column(JSON, nullable=True)
    warnings = Column(JSON, default=list)
    assumptions_checked = Column(JSON, default=list)
    status = Column(String(16), default="pending")
    error = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=_now)

    project = relationship("Project", back_populates="analysis_records")
    dataset = relationship("Dataset", back_populates="analysis_records")

    __table_args__ = (
        Index("ix_analysis_records_project_id", "project_id"),
        Index("ix_analysis_records_dataset_id", "dataset_id"),
    )


class OutputDocument(Base):
    __tablename__ = "output_documents"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    title = Column(String(256), default="Output")
    objects_data = Column(JSON, default=list)  # list of OutputObject
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    project = relationship("Project", back_populates="output_documents")


class SyntaxScript(Base):
    __tablename__ = "syntax_scripts"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    title = Column(String(256), default="Syntax")
    content = Column(Text, default="")
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    project = relationship("Project", back_populates="syntax_scripts")
