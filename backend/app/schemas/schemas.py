"""
Pydantic schemas for API contracts.
These are the typed interfaces between frontend and backend.
"""

from __future__ import annotations
from datetime import datetime
from typing import Any, Literal, Union
from pydantic import BaseModel, Field, EmailStr, field_validator
import uuid


# ─────────────────────────────────────────────────────────────────
# Auth Schemas
# ─────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str | None = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    full_name: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ─────────────────────────────────────────────────────────────────
# Variable Metadata Schemas
# ─────────────────────────────────────────────────────────────────

VariableType = Literal["numeric", "string", "date", "datetime", "boolean", "categorical"]
MeasurementLevel = Literal["nominal", "ordinal", "scale"]
VariableRole = Literal["input", "target", "both", "none", "partition", "split", "frequency", "weight", "identifier"]


class ValueLabel(BaseModel):
    value: Union[float, int, str]
    label: str


class MissingValueSpec(BaseModel):
    type: Literal["none", "single", "multiple", "range"] = "none"
    system_missing: bool = True
    values: list[Union[float, int, str]] = Field(default_factory=list)
    range_low: float | None = None
    range_high: float | None = None


class Variable(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    label: str = ""
    type: VariableType = "numeric"
    width: int = 8
    decimals: int = 2
    value_labels: list[ValueLabel] = Field(default_factory=list)
    missing_values: MissingValueSpec = Field(default_factory=MissingValueSpec)
    measurement_level: MeasurementLevel = "scale"
    role: VariableRole = "input"
    column_width: int = 100
    visibility: bool = True
    description: str = ""
    format: str = "F8.2"
    custom_metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def name_no_spaces(cls, v: str) -> str:
        return v.strip()


class VariableUpdate(BaseModel):
    """Partial update for a single variable metadata field."""
    label: str | None = None
    type: VariableType | None = None
    width: int | None = None
    decimals: int | None = None
    value_labels: list[ValueLabel] | None = None
    missing_values: MissingValueSpec | None = None
    measurement_level: MeasurementLevel | None = None
    role: VariableRole | None = None
    column_width: int | None = None
    visibility: bool | None = None
    description: str | None = None
    format: str | None = None


# ─────────────────────────────────────────────────────────────────
# Filter / Weight / Split Schemas
# ─────────────────────────────────────────────────────────────────

class FilterSpec(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    expression: str
    type: Literal["temporary", "permanent"] = "temporary"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    description: str = ""


# ─────────────────────────────────────────────────────────────────
# Dataset Schemas
# ─────────────────────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = ""


class DatasetOut(BaseModel):
    id: str
    project_id: str
    name: str
    description: str
    schema_version: str
    variables_meta: list[Variable]
    n_cases: int
    n_variables: int
    active_filter: FilterSpec | None
    weight_variable: str | None
    split_variables: list[str]
    source_file: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DatasetSummary(BaseModel):
    """Lightweight dataset info (no case data)."""
    id: str
    name: str
    description: str
    n_cases: int
    n_variables: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CellUpdate(BaseModel):
    row: int
    col: int
    value: Any


class BulkCellUpdate(BaseModel):
    updates: list[CellUpdate]


class AddRowsRequest(BaseModel):
    count: int = Field(default=1, ge=1, le=1000)
    values: list[list[Any]] | None = None  # optional initial values


class AddVariableRequest(BaseModel):
    variable: Variable
    position: int | None = None  # None = append


class DeleteVariablesRequest(BaseModel):
    variable_ids: list[str]


class DeleteCasesRequest(BaseModel):
    row_indices: list[int]


class DataPageRequest(BaseModel):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=5000)
    variables: list[str] | None = None  # None = all variables


class DataPageOut(BaseModel):
    offset: int
    limit: int
    total_cases: int
    variables: list[Variable]
    rows: list[list[Any]]


# ─────────────────────────────────────────────────────────────────
# Project Schemas
# ─────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    active_dataset_id: str | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    schema_version: str
    active_dataset_id: str | None
    created_at: datetime
    updated_at: datetime
    datasets: list[DatasetSummary]

    model_config = {"from_attributes": True}


class ProjectSummary(BaseModel):
    id: str
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    dataset_count: int = 0

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────
# Warning / Error Schemas
# ─────────────────────────────────────────────────────────────────

class Warning(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    severity: Literal["HIGH", "MEDIUM", "LOW"]
    code: str
    issue: str
    why_it_matters: str
    recommended_action: str
    procedure_id: str = ""
    variables_involved: list[str] = Field(default_factory=list)


class ComputationError(BaseModel):
    procedure: str
    error_code: str
    message: str
    likely_cause: str
    suggested_action: str
    technical_detail: str | None = None


class AssumptionResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    status: Literal["passed", "failed", "warning", "not_tested"]
    test_statistic: float | None = None
    p_value: float | None = None
    description: str
    interpretation: str


# ─────────────────────────────────────────────────────────────────
# Analysis Schemas
# ─────────────────────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    procedure_id: str
    dataset_id: str
    parameters: dict[str, Any]


class AnalysisRecordOut(BaseModel):
    id: str
    procedure_id: str
    dataset_id: str | None
    parameters: dict[str, Any]
    engine_version: str
    syntax: str
    result: dict[str, Any] | None
    warnings: list[Warning]
    assumptions_checked: list[AssumptionResult]
    status: str
    error: ComputationError | None
    timestamp: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────
# Output Document Schemas
# ─────────────────────────────────────────────────────────────────

OutputObjectType = Literal[
    "heading", "paragraph", "warning", "pivotTable",
    "chart", "modelSummary", "text", "diagnostic", "interpretation"
]


class OutputObject(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: OutputObjectType
    title: str = ""
    visible: bool = True
    collapsed: bool = False
    parent_id: str | None = None
    order: int = 0
    data: dict[str, Any] = Field(default_factory=dict)


class OutputDocumentOut(BaseModel):
    id: str
    project_id: str
    title: str
    objects_data: list[OutputObject]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────
# Syntax Script Schemas
# ─────────────────────────────────────────────────────────────────

class SyntaxScriptCreate(BaseModel):
    title: str = "Syntax"
    content: str = ""


class SyntaxScriptOut(BaseModel):
    id: str
    project_id: str
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────
# Import Schemas
# ─────────────────────────────────────────────────────────────────

class ImportColumnSpec(BaseModel):
    column_index: int
    original_name: str
    variable_name: str
    label: str = ""
    type: VariableType = "numeric"
    measurement_level: MeasurementLevel = "scale"
    decimals: int = 2
    include: bool = True


class ImportPreviewOut(BaseModel):
    file_id: str
    filename: str
    n_rows: int
    n_cols: int
    column_specs: list[ImportColumnSpec]
    preview_rows: list[list[Any]]  # first 10 rows


class ImportConfirmRequest(BaseModel):
    file_id: str
    dataset_name: str
    column_specs: list[ImportColumnSpec]
    has_header: bool = True
    encoding: str = "utf-8"
    decimal_separator: str = "."
