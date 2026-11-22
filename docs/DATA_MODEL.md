# SOCIOSTAT — Data Model

## Core Entities

### Project
```typescript
interface Project {
  id: string;                    // UUID
  name: string;
  description: string;
  createdAt: string;             // ISO 8601
  updatedAt: string;
  schemaVersion: string;         // "1.0.0" — for backward compat
  datasets: Dataset[];
  activeDatasetId: string | null;
  outputDocuments: OutputDocument[];
  syntaxScripts: SyntaxScript[];
  analysisHistory: AnalysisRecord[];
  aiConversations: AIConversation[];
  reportDrafts: ReportDraft[];
}
```

### Dataset
```typescript
interface Dataset {
  id: string;                    // UUID
  name: string;
  description: string;
  schemaVersion: string;         // "1.0.0"
  variables: Variable[];
  cases: Case[];                 // array of value arrays (row-major)
  activeFilter: FilterSpec | null;
  weightVariable: string | null; // variable name
  splitVariables: string[];      // variable names
  transformationHistory: TransformationRecord[];
  metadata: DatasetMetadata;
  createdAt: string;
  updatedAt: string;
  sourceFile: string | null;
}

interface DatasetMetadata {
  nCases: number;
  nVariables: number;
  encoding: string;
  importSource: string | null;
  importedAt: string | null;
}
```

### Variable
```typescript
interface Variable {
  id: string;                          // UUID
  name: string;                        // e.g. "income"
  label: string;                       // e.g. "Monthly Income (IDR)"
  type: VariableType;
  width: number;
  decimals: number;
  valueLabels: ValueLabel[];
  missingValues: MissingValueSpec;
  measurementLevel: MeasurementLevel;
  role: VariableRole;
  columnWidth: number;
  visibility: boolean;
  description: string;
  format: string;                      // display format
  customMetadata: Record<string, unknown>;
}

type VariableType = 'numeric' | 'string' | 'date' | 'datetime' | 'boolean' | 'categorical';
type MeasurementLevel = 'nominal' | 'ordinal' | 'scale';
type VariableRole = 'input' | 'target' | 'both' | 'none' | 'partition' | 'split' | 'frequency' | 'weight' | 'identifier';

interface ValueLabel {
  value: number | string;
  label: string;
}

interface MissingValueSpec {
  type: 'none' | 'single' | 'multiple' | 'range';
  systemMissing: boolean;
  values: (number | string)[];  // up to 3 user-defined missing values
  rangeLow: number | null;       // for range type
  rangeHigh: number | null;
}
```

### Case
```typescript
// Cases are stored as a flat array of rows
// Each row is an array of values indexed by variable position
type Case = (number | string | null)[];
```

### FilterSpec
```typescript
interface FilterSpec {
  id: string;
  expression: string;           // e.g. "age >= 18 AND gender == 1"
  type: 'temporary' | 'permanent';
  createdAt: string;
  description: string;
}
```

### TransformationRecord
```typescript
interface TransformationRecord {
  id: string;
  type: TransformationType;
  syntax: string;
  parameters: Record<string, unknown>;
  appliedAt: string;
  reversible: boolean;
  snapshotId: string | null;     // reference to dataset snapshot before transform
}

type TransformationType = 
  | 'compute'
  | 'recode'
  | 'recode_into_different'
  | 'automatic_recode'
  | 'count'
  | 'rank'
  | 'standardize'
  | 'aggregate'
  | 'sort'
  | 'select_cases'
  | 'weight_cases'
  | 'split_file';
```

## Analysis Record
```typescript
interface AnalysisRecord {
  id: string;
  procedureId: string;           // e.g. "linear_regression"
  datasetId: string;
  datasetSnapshot: DatasetSnapshot;  // variable metadata at time of analysis
  filterActive: FilterSpec | null;
  weightVariable: string | null;
  splitConfiguration: string[];
  parameters: Record<string, unknown>;
  engineVersion: string;
  timestamp: string;
  syntax: string;
  result: AnalysisResult | null;
  warnings: Warning[];
  assumptionsChecked: AssumptionResult[];
  status: 'pending' | 'running' | 'complete' | 'error';
  error: AnalysisError | null;
}

interface DatasetSnapshot {
  datasetId: string;
  datasetName: string;
  nCases: number;
  nVariables: number;
  variables: Variable[];
  // Does NOT store actual case data to save space
  // Data reproducibility uses stored syntax + source dataset
}
```

## Output Document Model
```typescript
interface OutputDocument {
  id: string;
  title: string;
  createdAt: string;
  objects: OutputObject[];
}

type OutputObjectType = 
  | 'heading'
  | 'paragraph'
  | 'warning'
  | 'pivotTable'
  | 'chart'
  | 'modelSummary'
  | 'text'
  | 'diagnostic'
  | 'interpretation';

interface OutputObject {
  id: string;
  type: OutputObjectType;
  title: string;
  visible: boolean;
  collapsed: boolean;
  parentId: string | null;
  order: number;
  data: PivotTableData | ChartData | TextData | WarningData | unknown;
}
```

## Warning Model
```typescript
interface Warning {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  code: string;
  issue: string;
  whyItMatters: string;
  recommendedAction: string;
  procedureId: string;
  variablesInvolved: string[];
}
```

## AssumptionResult
```typescript
interface AssumptionResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'not_tested';
  testStatistic: number | null;
  pValue: number | null;
  description: string;
  interpretation: string;
}
```

## Schema Versioning
All stored documents include `schemaVersion: "1.0.0"`.
Migration scripts live in `backend/app/migrations/schema_migrations/`.
Never break backward compatibility without a migration path.
