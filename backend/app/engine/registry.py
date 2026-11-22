"""
ProcedureRegistry — central registry for all statistical procedures.
Adding a new procedure only requires creating a module and registering it here.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class ProcedureSpec:
    id: str
    category: str
    display_name: str
    description: str
    required_inputs: list[str]
    execute_fn: Callable
    syntax_generator_fn: Callable | None = None

    def execute(self, **kwargs) -> dict[str, Any]:
        return self.execute_fn(**kwargs)

    def generate_syntax(self, parameters: dict) -> str:
        if self.syntax_generator_fn:
            return self.syntax_generator_fn(parameters)
        return f"* {self.id}\n"


class _Registry:
    def __init__(self):
        self._procedures: dict[str, ProcedureSpec] = {}

    def register(self, spec: ProcedureSpec):
        self._procedures[spec.id] = spec

    def get(self, procedure_id: str) -> ProcedureSpec | None:
        return self._procedures.get(procedure_id)

    def list_procedures(self) -> list[dict]:
        return [
            {
                "id": p.id,
                "category": p.category,
                "display_name": p.display_name,
                "description": p.description,
                "required_inputs": p.required_inputs,
            }
            for p in self._procedures.values()
        ]


ProcedureRegistry = _Registry()

# Import and register all procedures
from app.engine.procedures import (
    frequencies,
    descriptives,
    crosstabs,
    correlation,
    ttest,
    anova,
    regression,
    reliability,
    nonparametric,
    factor_analysis,
    logistic_regression,
)
