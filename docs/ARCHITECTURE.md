# SOCIOSTAT — Architecture Overview

## System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                            │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Project  │  │ Data     │  │ Variable │  │ Output Viewer    │  │
│  │ Manager  │  │ View     │  │ View     │  │ (Pivot Tables,   │  │
│  │          │  │ (Virtual │  │          │  │  Charts)         │  │
│  │          │  │  Grid)   │  │          │  │                  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Syntax   │  │ Analysis │  │ Graph    │  │ AI Assistant     │  │
│  │ Editor   │  │ Dialogs  │  │ Builder  │  │                  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                                    │
│                   Zustand State Management                         │
│              React Query (server state + caching)                  │
└───────────────────────────┬────────────────────────────────────────┘
                            │ REST API (JSON)
                            │ WebSocket (job progress)
┌───────────────────────────▼────────────────────────────────────────┐
│                     FastAPI Backend                                │
│                                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Auth       │  │ Project    │  │ Dataset    │  │ Analysis   │  │
│  │ Router     │  │ Router     │  │ Router     │  │ Router     │  │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              Statistical Engine Layer                       │   │
│  │                                                             │   │
│  │  ProcedureRegistry → Validator → Compute → ResultSchema    │   │
│  │  NumPy / Pandas / SciPy / Statsmodels / Scikit-learn       │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              Transformation Engine                          │   │
│  │                                                             │   │
│  │  Compute / Recode / Filter / Weight / Split / Aggregate    │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              Job Queue (Celery / Background Tasks)          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              SQLAlchemy ORM                                 │   │
│  │              SQLite (dev) / PostgreSQL (prod)               │   │
│  └────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript 5
- **Build Tool**: Vite 5
- **State Management**: Zustand (client state) + TanStack Query v5 (server state)
- **Grid / Virtualization**: TanStack Virtual v3 (data view, variable view)
- **Routing**: React Router v6
- **UI Components**: Custom component library (no heavy UI framework)
- **Charts**: Recharts + D3 (custom charts)
- **Syntax Editor**: CodeMirror 6
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Statistical Libraries**: NumPy, Pandas, SciPy, Statsmodels, Scikit-learn, Pingouin
- **ORM**: SQLAlchemy 2.0 + Alembic (migrations)
- **Auth**: python-jose (JWT) + passlib (bcrypt)
- **File Parsing**: openpyxl, python-csv
- **Task Queue**: FastAPI BackgroundTasks (Phase 1) → Celery (Phase 2+)
- **Validation**: Pydantic v2

### Storage
- **Database**: SQLite (dev), PostgreSQL (prod)
- **File Storage**: Local filesystem (dev), S3-compatible (prod)
- **Session**: JWT stateless

## Directory Structure

```
sociostat/
├── frontend/                    # React + TypeScript
│   ├── src/
│   │   ├── app/                # App shell, router, providers
│   │   ├── features/           # Feature modules
│   │   │   ├── auth/
│   │   │   ├── project/
│   │   │   ├── data-editor/    # Data View + Variable View
│   │   │   ├── transform/
│   │   │   ├── analyze/        # Analysis dialogs
│   │   │   ├── graphs/
│   │   │   ├── syntax/
│   │   │   ├── output/
│   │   │   ├── history/
│   │   │   └── ai-assistant/
│   │   ├── components/         # Shared UI components
│   │   │   ├── layout/
│   │   │   ├── grid/           # Virtual spreadsheet
│   │   │   ├── pivot-table/
│   │   │   ├── charts/
│   │   │   └── dialogs/
│   │   ├── store/              # Zustand stores
│   │   ├── hooks/              # Custom hooks
│   │   ├── api/                # API client layer
│   │   ├── types/              # TypeScript types
│   │   └── utils/
│   └── package.json
│
├── backend/                     # FastAPI + Python
│   ├── app/
│   │   ├── main.py
│   │   ├── core/               # Config, security, db
│   │   ├── models/             # SQLAlchemy models
│   │   ├── schemas/            # Pydantic schemas
│   │   ├── routers/            # API endpoints
│   │   ├── engine/             # Statistical engine
│   │   │   ├── procedures/     # Each procedure module
│   │   │   ├── registry.py
│   │   │   ├── validator.py
│   │   │   ├── assumption_checker.py
│   │   │   └── warning_engine.py
│   │   ├── transform/          # Transformation engine
│   │   ├── services/           # Business logic
│   │   └── tests/
│   ├── alembic/
│   └── requirements.txt
│
├── docs/                        # Documentation
└── docker-compose.yml
```

## Key Design Principles

1. **Separation of Concerns**: Frontend renders, backend computes. No statistics in frontend.
2. **Typed Contracts**: Pydantic (backend) + TypeScript (frontend) with shared schema conventions.
3. **Reproducibility**: Every analysis stores its complete execution context.
4. **Modularity**: ProcedureRegistry pattern — adding a procedure does not require app rewrites.
5. **Correctness First**: Statistical accuracy over performance optimization.
