"""
Project router — CRUD for projects.
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.db_models import User, Project, Dataset
from app.routers.auth import get_current_user
from app.schemas.schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut, ProjectSummary, DatasetSummary
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _project_or_404(project_id: str, user_id: str, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[ProjectSummary])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    projects = db.query(Project).filter(Project.owner_id == current_user.id).all()
    result = []
    for p in projects:
        dataset_count = db.query(Dataset).filter(Dataset.project_id == p.id).count()
        result.append(ProjectSummary(
            id=p.id,
            name=p.name,
            description=p.description,
            created_at=p.created_at,
            updated_at=p.updated_at,
            dataset_count=dataset_count,
        ))
    return result


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = Project(
        owner_id=current_user.id,
        name=project_in.name,
        description=project_in.description,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_to_out(project, db)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _project_or_404(project_id, current_user.id, db)
    return _project_to_out(project, db)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    update: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _project_or_404(project_id, current_user.id, db)
    if update.name is not None:
        project.name = update.name
    if update.description is not None:
        project.description = update.description
    if update.active_dataset_id is not None:
        project.active_dataset_id = update.active_dataset_id
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return _project_to_out(project, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _project_or_404(project_id, current_user.id, db)
    db.delete(project)
    db.commit()


def _project_to_out(project: Project, db: Session) -> ProjectOut:
    datasets = db.query(Dataset).filter(Dataset.project_id == project.id).all()
    dataset_summaries = [
        DatasetSummary(
            id=d.id,
            name=d.name,
            description=d.description,
            n_cases=d.n_cases,
            n_variables=d.n_variables,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in datasets
    ]
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        schema_version=project.schema_version,
        active_dataset_id=project.active_dataset_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        datasets=dataset_summaries,
    )
