"""
DatasetService — helper functions for dataset schema conversion.
"""

from app.models.db_models import Dataset as DatasetModel
from app.schemas.schemas import DatasetOut, Variable, FilterSpec


class DatasetService:
    @staticmethod
    def to_schema(ds: DatasetModel) -> DatasetOut:
        variables = []
        for v in (ds.variables_meta or []):
            try:
                variables.append(Variable(**v))
            except Exception:
                pass  # Skip malformed variable metadata

        active_filter = None
        if ds.active_filter:
            try:
                active_filter = FilterSpec(**ds.active_filter)
            except Exception:
                pass

        return DatasetOut(
            id=ds.id,
            project_id=ds.project_id,
            name=ds.name,
            description=ds.description,
            schema_version=ds.schema_version,
            variables_meta=variables,
            n_cases=ds.n_cases,
            n_variables=ds.n_variables,
            active_filter=active_filter,
            weight_variable=ds.weight_variable,
            split_variables=ds.split_variables or [],
            source_file=ds.source_file,
            created_at=ds.created_at,
            updated_at=ds.updated_at,
        )
