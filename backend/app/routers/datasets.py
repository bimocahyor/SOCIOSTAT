"""
Dataset router — full dataset management including data view operations.
"""

import io
import csv
import uuid
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.models.db_models import User, Project, Dataset as DatasetModel
from app.routers.auth import get_current_user
from app.schemas.schemas import (
    DatasetCreate, DatasetOut, DataPageOut, DataPageRequest,
    Variable, VariableUpdate, AddRowsRequest, AddVariableRequest,
    DeleteVariablesRequest, DeleteCasesRequest, BulkCellUpdate,
    ImportPreviewOut, ImportColumnSpec, ImportConfirmRequest,
    FilterSpec,
)
from app.services.dataset_service import DatasetService
from app.services.import_service import ImportService

router = APIRouter(prefix="/api/projects/{project_id}/datasets", tags=["datasets"])

# Temp file storage for import wizard
_import_temp: dict[str, dict] = {}


def _dataset_or_404(dataset_id: str, project_id: str, user_id: str, db: Session) -> DatasetModel:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    ds = db.query(DatasetModel).filter(
        DatasetModel.id == dataset_id,
        DatasetModel.project_id == project_id
    ).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


# ─── Dataset CRUD ──────────────────────────────────────────────────────────────

@router.post("", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
def create_dataset(
    project_id: str,
    dataset_in: DatasetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(
        Project.id == project_id, Project.owner_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    ds = DatasetModel(
        project_id=project_id,
        name=dataset_in.name,
        description=dataset_in.description,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return DatasetService.to_schema(ds)


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(
    project_id: str,
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    return DatasetService.to_schema(ds)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    project_id: str,
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    db.delete(ds)
    db.commit()


# ─── Data View (paginated rows) ─────────────────────────────────────────────────

@router.get("/{dataset_id}/data", response_model=DataPageOut)
def get_data_page(
    project_id: str,
    dataset_id: str,
    offset: int = 0,
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    variables = [Variable(**v) for v in (ds.variables_meta or [])]
    cases = ds.cases_data or []
    total = len(cases)
    page = cases[offset: offset + limit]
    return DataPageOut(
        offset=offset,
        limit=limit,
        total_cases=total,
        variables=variables,
        rows=page,
    )


@router.patch("/{dataset_id}/cells", response_model=dict)
def update_cells(
    project_id: str,
    dataset_id: str,
    updates: BulkCellUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    cases = list(ds.cases_data or [])
    n_vars = len(ds.variables_meta or [])

    for upd in updates.updates:
        # Expand rows if needed
        while len(cases) <= upd.row:
            cases.append([None] * n_vars)
        # Expand columns if needed
        while len(cases[upd.row]) <= upd.col:
            cases[upd.row].append(None)
        cases[upd.row][upd.col] = upd.value

    ds.cases_data = cases
    ds.n_cases = len(cases)
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"updated": len(updates.updates)}


# ─── Variable Management ────────────────────────────────────────────────────────

@router.post("/{dataset_id}/variables", response_model=DatasetOut)
def add_variable(
    project_id: str,
    dataset_id: str,
    req: AddVariableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    variables = list(ds.variables_meta or [])
    cases = list(ds.cases_data or [])

    new_var = req.variable.model_dump()
    if req.position is None or req.position >= len(variables):
        variables.append(new_var)
        for row in cases:
            row.append(None)
    else:
        variables.insert(req.position, new_var)
        for row in cases:
            row.insert(req.position, None)

    ds.variables_meta = variables
    ds.cases_data = cases
    ds.n_variables = len(variables)
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ds)
    return DatasetService.to_schema(ds)


@router.patch("/{dataset_id}/variables/{variable_id}", response_model=DatasetOut)
def update_variable(
    project_id: str,
    dataset_id: str,
    variable_id: str,
    update: VariableUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    variables = list(ds.variables_meta or [])
    idx = next((i for i, v in enumerate(variables) if v.get("id") == variable_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Variable not found")

    patch = update.model_dump(exclude_none=True)
    for key, val in patch.items():
        if isinstance(val, dict):
            variables[idx][key] = val
        elif isinstance(val, list):
            variables[idx][key] = [item.model_dump() if hasattr(item, "model_dump") else item for item in val]
        else:
            variables[idx][key] = val

    ds.variables_meta = variables
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ds)
    return DatasetService.to_schema(ds)


@router.delete("/{dataset_id}/variables", response_model=DatasetOut)
def delete_variables(
    project_id: str,
    dataset_id: str,
    req: DeleteVariablesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    variables = list(ds.variables_meta or [])
    cases = list(ds.cases_data or [])

    ids_to_remove = set(req.variable_ids)
    indices_to_remove = [i for i, v in enumerate(variables) if v.get("id") in ids_to_remove]
    indices_set = set(indices_to_remove)

    new_variables = [v for i, v in enumerate(variables) if i not in indices_set]
    new_cases = [
        [val for j, val in enumerate(row) if j not in indices_set]
        for row in cases
    ]

    ds.variables_meta = new_variables
    ds.cases_data = new_cases
    ds.n_variables = len(new_variables)
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ds)
    return DatasetService.to_schema(ds)


# ─── Row Management ─────────────────────────────────────────────────────────────

@router.post("/{dataset_id}/rows", response_model=dict)
def add_rows(
    project_id: str,
    dataset_id: str,
    req: AddRowsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    cases = list(ds.cases_data or [])
    n_vars = len(ds.variables_meta or [])

    for i in range(req.count):
        if req.values and i < len(req.values):
            row = list(req.values[i])
            # Pad or truncate to match variable count
            while len(row) < n_vars:
                row.append(None)
            cases.append(row[:n_vars])
        else:
            cases.append([None] * n_vars)

    ds.cases_data = cases
    ds.n_cases = len(cases)
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"n_cases": ds.n_cases, "added": req.count}


@router.delete("/{dataset_id}/rows", response_model=dict)
def delete_rows(
    project_id: str,
    dataset_id: str,
    req: DeleteCasesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    cases = list(ds.cases_data or [])
    indices_to_remove = set(req.row_indices)
    new_cases = [row for i, row in enumerate(cases) if i not in indices_to_remove]
    ds.cases_data = new_cases
    ds.n_cases = len(new_cases)
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"n_cases": ds.n_cases, "removed": len(indices_to_remove)}


# ─── Filter / Weight / Split ────────────────────────────────────────────────────

@router.post("/{dataset_id}/filter", response_model=dict)
def set_filter(
    project_id: str,
    dataset_id: str,
    filter_spec: FilterSpec | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    ds.active_filter = filter_spec.model_dump() if filter_spec else None
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"active_filter": ds.active_filter}


@router.post("/{dataset_id}/weight", response_model=dict)
def set_weight(
    project_id: str,
    dataset_id: str,
    weight_variable: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    ds.weight_variable = weight_variable
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"weight_variable": weight_variable}


@router.post("/{dataset_id}/split", response_model=dict)
def set_split(
    project_id: str,
    dataset_id: str,
    split_variables: list[str] | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    ds.split_variables = split_variables or []
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"split_variables": ds.split_variables}


# ─── Import Wizard ──────────────────────────────────────────────────────────────

@router.post("/import/upload", response_model=ImportPreviewOut)
async def upload_import_file(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Step 1: Upload file and get preview."""
    # Validate project
    project = db.query(Project).filter(
        Project.id == project_id, Project.owner_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate file
    if file.content_type not in [
        "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel", "text/plain", "application/octet-stream"
    ]:
        # Be lenient with content type — check extension
        filename = file.filename or ""
        if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files are supported")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large (max {settings.MAX_UPLOAD_SIZE_MB}MB)")

    file_id = str(uuid.uuid4())
    preview = ImportService.preview(
        file_id=file_id,
        filename=file.filename or "upload",
        content=content,
    )
    _import_temp[file_id] = {"content": content, "filename": file.filename}
    return preview


@router.post("/import/confirm", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
def confirm_import(
    project_id: str,
    req: ImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Step 2: Confirm import with final column specs."""
    project = db.query(Project).filter(
        Project.id == project_id, Project.owner_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    temp = _import_temp.get(req.file_id)
    if not temp:
        raise HTTPException(status_code=404, detail="Upload session expired. Please re-upload.")

    ds_data = ImportService.import_data(
        content=temp["content"],
        filename=temp["filename"],
        req=req,
    )

    ds = DatasetModel(
        project_id=project_id,
        name=req.dataset_name,
        variables_meta=[v.model_dump() for v in ds_data["variables"]],
        cases_data=ds_data["cases"],
        n_cases=len(ds_data["cases"]),
        n_variables=len(ds_data["variables"]),
        source_file=temp["filename"],
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)

    # Clean temp
    _import_temp.pop(req.file_id, None)

    return DatasetService.to_schema(ds)


# ─── Export ────────────────────────────────────────────────────────────────────

@router.get("/{dataset_id}/export/csv")
def export_csv(
    project_id: str,
    dataset_id: str,
    use_labels: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi.responses import StreamingResponse
    ds = _dataset_or_404(dataset_id, project_id, current_user.id, db)
    variables = ds.variables_meta or []
    cases = ds.cases_data or []

    output = io.StringIO()
    writer = csv.writer(output)
    # Header
    writer.writerow([v["name"] for v in variables])
    # Rows
    for row in cases:
        if use_labels:
            labeled_row = []
            for i, val in enumerate(row):
                if i < len(variables):
                    vl = {str(lbl["value"]): lbl["label"] for lbl in variables[i].get("value_labels", [])}
                    labeled_row.append(vl.get(str(val), val))
                else:
                    labeled_row.append(val)
            writer.writerow(labeled_row)
        else:
            writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={ds.name}.csv"},
    )
