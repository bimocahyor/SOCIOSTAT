"""
ImportService — handles CSV/XLSX parsing and type inference for Import Wizard.
"""

import io
import re
import uuid
from typing import Any

from app.schemas.schemas import (
    ImportPreviewOut, ImportColumnSpec, ImportConfirmRequest, Variable,
    ValueLabel, MissingValueSpec, VariableType, MeasurementLevel
)


def _safe_var_name(name: str) -> str:
    """Convert a column name to a valid variable name."""
    name = re.sub(r"[^a-zA-Z0-9_]", "_", str(name).strip())
    if not name or name[0].isdigit():
        name = "var_" + name
    return name[:64]


def _infer_type(values: list[Any]) -> tuple[VariableType, MeasurementLevel]:
    """Infer variable type and measurement level from a sample of values."""
    non_null = [v for v in values if v is not None and str(v).strip() != ""]
    if not non_null:
        return "numeric", "scale"

    # Try numeric
    numeric_count = 0
    for v in non_null:
        try:
            float(str(v).replace(",", "."))
            numeric_count += 1
        except (ValueError, TypeError):
            pass

    numeric_ratio = numeric_count / len(non_null)
    if numeric_ratio >= 0.9:
        # Check if integer-like (potential categorical/ordinal)
        int_count = sum(1 for v in non_null if str(v).strip().isdigit())
        unique_vals = set(str(v).strip() for v in non_null)
        n_unique = len(unique_vals)
        n_total = len(non_null)

        if int_count == len(non_null) and n_unique <= 10:
            # Small number of integer values → likely nominal or ordinal
            return "numeric", "ordinal" if n_unique <= 7 else "nominal"
        return "numeric", "scale"

    # String type
    unique_ratio = len(set(str(v).strip().lower() for v in non_null)) / len(non_null)
    if unique_ratio < 0.5:
        return "categorical", "nominal"
    return "string", "nominal"


def _parse_csv(content: bytes) -> tuple[list[str], list[list[Any]]]:
    import csv
    # Detect encoding
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return [], []
    headers = rows[0]
    data = rows[1:]
    return headers, data


def _parse_xlsx(content: bytes) -> tuple[list[str], list[list[Any]]]:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], []
    headers = [str(h) if h is not None else f"col{i}" for i, h in enumerate(rows[0])]
    data = [list(row) for row in rows[1:]]
    return headers, data


class ImportService:
    @staticmethod
    def preview(file_id: str, filename: str, content: bytes) -> ImportPreviewOut:
        if filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls"):
            headers, data = _parse_xlsx(content)
        else:
            headers, data = _parse_csv(content)

        n_cols = len(headers)
        n_rows = len(data)
        preview_rows = [list(row) for row in data[:10]]

        column_specs = []
        for i, header in enumerate(headers):
            col_values = [row[i] if i < len(row) else None for row in data[:200]]
            var_type, meas_level = _infer_type(col_values)
            column_specs.append(ImportColumnSpec(
                column_index=i,
                original_name=header,
                variable_name=_safe_var_name(header),
                label=header if header != _safe_var_name(header) else "",
                type=var_type,
                measurement_level=meas_level,
                decimals=2 if var_type == "numeric" else 0,
                include=True,
            ))

        return ImportPreviewOut(
            file_id=file_id,
            filename=filename,
            n_rows=n_rows,
            n_cols=n_cols,
            column_specs=column_specs,
            preview_rows=preview_rows,
        )

    @staticmethod
    def import_data(
        content: bytes,
        filename: str,
        req: ImportConfirmRequest,
    ) -> dict:
        if filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls"):
            headers, raw_data = _parse_xlsx(content)
        else:
            headers, raw_data = _parse_csv(content)

        included = [spec for spec in req.column_specs if spec.include]
        variables: list[Variable] = []
        col_indices = [spec.column_index for spec in included]

        for spec in included:
            variables.append(Variable(
                id=str(uuid.uuid4()),
                name=spec.variable_name,
                label=spec.label or spec.original_name,
                type=spec.type,
                measurement_level=spec.measurement_level,
                decimals=spec.decimals,
                width=10,
                format=f"F8.{spec.decimals}" if spec.type == "numeric" else "A16",
            ))

        cases: list[list[Any]] = []
        dec_sep = req.decimal_separator or "."

        for raw_row in raw_data:
            row: list[Any] = []
            for idx, spec in zip(col_indices, included):
                raw_val = raw_row[idx] if idx < len(raw_row) else None
                val = _convert_value(raw_val, spec.type, dec_sep)
                row.append(val)
            cases.append(row)

        return {"variables": variables, "cases": cases}


def _convert_value(raw: Any, var_type: VariableType, dec_sep: str = ".") -> Any:
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        return None
    if var_type == "numeric":
        try:
            s = str(raw).replace(dec_sep, ".")
            f = float(s)
            return f
        except (ValueError, TypeError):
            return None
    elif var_type == "boolean":
        s = str(raw).strip().lower()
        if s in ("1", "true", "yes", "ya", "benar"):
            return 1
        if s in ("0", "false", "no", "tidak", "salah"):
            return 0
        return None
    else:
        return str(raw).strip() if raw is not None else None
