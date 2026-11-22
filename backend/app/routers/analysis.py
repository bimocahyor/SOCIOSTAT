"""
Analysis router — execute statistical procedures.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.db_models import User, Project, Dataset as DatasetModel, AnalysisRecord
from app.routers.auth import get_current_user
from app.schemas.schemas import AnalysisRequest, AnalysisRecordOut
from app.engine.registry import ProcedureRegistry
from app.services.dataset_service import DatasetService

router = APIRouter(prefix="/api/projects/{project_id}/analysis", tags=["analysis"])


@router.post("/run", response_model=AnalysisRecordOut, status_code=status.HTTP_201_CREATED)
def run_analysis(
    project_id: str,
    req: AnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate project
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load dataset
    ds = db.query(DatasetModel).filter(
        DatasetModel.id == req.dataset_id,
        DatasetModel.project_id == project_id
    ).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get procedure
    procedure = ProcedureRegistry.get(req.procedure_id)
    if not procedure:
        raise HTTPException(status_code=400, detail=f"Unknown procedure: {req.procedure_id}")

    # Build dataset snapshot (no case data in snapshot)
    from app.schemas.schemas import Variable
    variables = [Variable(**v) for v in (ds.variables_meta or [])]
    snapshot = {
        "dataset_id": ds.id,
        "dataset_name": ds.name,
        "n_cases": ds.n_cases,
        "n_variables": ds.n_variables,
        "variables": [v.model_dump() for v in variables],
    }

    # Execute
    result = procedure.execute(
        dataset_id=ds.id,
        variables_meta=ds.variables_meta or [],
        cases=ds.cases_data or [],
        parameters=req.parameters,
        active_filter=ds.active_filter,
        weight_variable=ds.weight_variable,
        split_variables=ds.split_variables or [],
    )

    # Persist analysis record
    record = AnalysisRecord(
        project_id=project_id,
        dataset_id=ds.id,
        procedure_id=req.procedure_id,
        parameters=req.parameters,
        dataset_snapshot=snapshot,
        filter_active=ds.active_filter,
        weight_variable=ds.weight_variable,
        split_configuration=ds.split_variables or [],
        syntax=result.get("syntax", ""),
        result=result.get("result"),
        warnings=[w for w in result.get("warnings", [])],
        assumptions_checked=result.get("assumptions_checked", []),
        status=result.get("status", "complete"),
        error=result.get("error"),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return AnalysisRecordOut(
        id=record.id,
        procedure_id=record.procedure_id,
        dataset_id=record.dataset_id,
        parameters=record.parameters,
        engine_version=record.engine_version,
        syntax=record.syntax,
        result=record.result,
        warnings=record.warnings,
        assumptions_checked=record.assumptions_checked,
        status=record.status,
        error=record.error,
        timestamp=record.timestamp,
    )


@router.get("", response_model=list[AnalysisRecordOut])
def list_analysis_records(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    records = db.query(AnalysisRecord).filter(
        AnalysisRecord.project_id == project_id
    ).order_by(AnalysisRecord.timestamp.desc()).all()

    return [
        AnalysisRecordOut(
            id=r.id,
            procedure_id=r.procedure_id,
            dataset_id=r.dataset_id,
            parameters=r.parameters,
            engine_version=r.engine_version,
            syntax=r.syntax,
            result=r.result,
            warnings=r.warnings or [],
            assumptions_checked=r.assumptions_checked or [],
            status=r.status,
            error=r.error,
            timestamp=r.timestamp,
        )
        for r in records
    ]


@router.get("/procedures", response_model=list[dict])
def list_procedures(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    return ProcedureRegistry.list_procedures()
