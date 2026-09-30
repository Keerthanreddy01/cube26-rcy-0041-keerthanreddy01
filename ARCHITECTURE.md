# ARCHITECTURE.md — Recovery Manager

## System Overview

Recovery Manager is the fifth and final agent in the Cube Buildathon commerce chain. It reads evidence from the other four Managers (Receiving, Prep, Pack, Returns), matches charges from fee/reimbursement reports to units, interprets the evidence, and produces traceable recovery decisions.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      RECOVERY MANAGER                                │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Ingestion│→ │ Matching │→ │ Evidence │→ │ Decision │            │
│  │  Agent   │  │  Engine  │  │ Reasoning│  │  Engine  │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│       ↓              ↓             ↓             ↓                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Charge  │  │  Unit    │  │ Evidence │  │  Claim   │            │
│  │  Store   │  │  Match   │  │  Items   │  │ Builder  │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│                                                   ↓                  │
│                                            ┌──────────┐              │
│                                            │  Review  │              │
│                                            │  Queue   │              │
│                                            └──────────┘              │
│                                                   ↓                  │
│                                            ┌──────────┐              │
│                                            │  Audit   │              │
│                                            │  Trail   │              │
│                                            └──────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
Fee Report (CSV)
    ↓
[Ingestion Agent]
    → Parse CSV with PapaParse
    → Validate required columns
    → Parse each row with error handling
    → Detect duplicates against existing charges
    → Preserve failed rows (not silently discarded)
    → Create ImportBatch with summary
    ↓
[Charge Store]
    → Normalized ChargeRecord[]
    ↓
[Matching Engine]
    → For each charge:
        → Check unit_id in upstream data
        → If exact match found: unit_id_exact (high confidence)
        → If order_id match: order_id_asin (medium confidence)
        → Otherwise: unmatched (no confidence)
    → Strategy + explanation stored per charge
    ↓
[Evidence Retrieval Layer]
    → For each matched unit_id:
        → Query receiving records
        → Query prep records
        → Query pack records
        → Query returns records
    → All records returned with original data preserved
    ↓
[Evidence Reasoning Agent]
    → For each evidence record + charge type:
        → Apply deterministic interpretation rules
        → Generate: finding, supporting, contradicting, missing
        → Assign evidence state: PASS / FAIL / UNCERTAIN
        → Determine decision impact
    → Rules are charge-type-specific (see below)
    ↓
[Recovery Decision Engine]
    → Conservative, precision-first logic:
        1. Unmatched → REVIEW_REQUIRED
        2. Non-recoverable charge type → NO_CLAIM
        3. Unknown charge type → REVIEW_REQUIRED
        4. No evidence → REVIEW_REQUIRED
        5. Charge-type-specific rules:
            - inbound_defect_fee: needs clean receiving + compliant prep
            - lost_inbound: needs confirmed receiving
            - damaged_in_warehouse: needs clean receiving
            - refund_issued_item_not_returned: needs return record
    → Decision + reasoning + claim amount stored
    ↓
[Claim Builder]
    → For CLAIM_RECOMMENDED:
        → Generate claim with unique ID
        → Attach all supporting evidence
        → Build evidence timeline
        → Set status: DRAFT
    → For REVIEW_REQUIRED:
        → Generate ReviewCase with:
            - WHY review is required
            - WHAT IS KNOWN
            - WHAT IS MISSING
            - WHAT CONFLICTS
            - POSSIBLE ACTIONS
    ↓
[Review / Audit Layer]
    → Human reviewer can: approve, reject, mark insufficient
    → Original automated decision preserved in audit trail
    → Every action creates an audit entry
```

## Component Architecture

### 1. Ingestion Agent (`src/lib/ingestion.ts`)

- **CSV Parser**: PapaParse with header mode
- **Column Validator**: Checks for all required columns
- **Row Parser**: Validates each field, preserves errors
- **Duplicate Detector**: Checks line_id against existing charges
- **Batch Creator**: Generates ImportBatch with full summary

### 2. Matching Engine (`src/lib/decision-engine.ts` → `determineMatchStrategy`)

- Primary key: `unit_id` (exact match across all upstream sources)
- Secondary key: `order_id` (matches pack/returns)
- Reports strategy, confidence level, and human-readable explanation

### 3. Evidence Retrieval Layer (`src/lib/evidence.ts` → `getEvidenceForUnit`)

- Queries all four upstream sources by `unit_id`
- Returns sorted (by timestamp) evidence items
- Preserves original record in each evidence item

### 4. Evidence Reasoning Agent (`src/lib/evidence.ts`)

Four interpretation functions, one per upstream source:

- **`interpretReceiving`**: Checks identity match, carton damage, unit damage, quality flags, quantity shortfall
- **`interpretPrep`**: Checks polybag compliance, suffocation warning, FNSKU label, barcode coverage, handling marks
- **`interpretPack`**: Checks operator verdict, content match between order and box
- **`interpretReturns`**: Checks identity match, observed state, missing parts, operator disposition

Each produces:
- `finding`: Human-readable description
- `supporting`: Evidence supporting the charge
- `contradicting`: Evidence contradicting the charge
- `missing`: Evidence that could not be determined
- `state`: PASS / FAIL / UNCERTAIN
- `decision_impact`: How this evidence affects the recovery decision

### 5. Recovery Decision Engine (`src/lib/decision-engine.ts`)

Conservative decision logic with explicit rules:

**inbound_defect_fee:**
- Clean receiving + compliant prep → CLAIM_RECOMMENDED
- Prep non-compliance found → NO_CLAIM (fee justified)
- Clean receiving but no prep record → REVIEW_REQUIRED
- Uncertain evidence → REVIEW_REQUIRED

**lost_inbound:**
- Receiving confirms unit received → CLAIM_RECOMMENDED
- Uncertain receiving → REVIEW_REQUIRED
- No receiving record → REVIEW_REQUIRED

**damaged_in_warehouse:**
- Receiving shows no damage → CLAIM_RECOMMENDED
- Uncertain condition → REVIEW_REQUIRED

**refund_issued_item_not_returned:**
- Return record exists → CLAIM_RECOMMENDED
- Pack evidence but no return → REVIEW_REQUIRED
- No evidence → REVIEW_REQUIRED

**fulfilment_fee_weight_tier:**
- Always NO_CLAIM (standard fee, no weight error evidence available)
- Labeled: "Demo/configurable rule — not authoritative"

### 6. Claim Generation (`src/lib/decision-engine.ts` → `generateClaim`)

- Unique claim ID
- Evidence timeline (sorted by timestamp)
- Reason text (charge-type-specific template)
- All supporting evidence references
- Status: DRAFT (not "submitted" — no real integration)

### 7. Review Queue (`src/lib/store.ts`)

- Generates ReviewCase with structured context
- Reviewer actions: approve, reject, mark insufficient
- Original decision preserved in audit trail
- Approved reviews generate claims with reviewer note

### 8. Audit Trail (`src/lib/store.ts`)

- Every important action logged with timestamp
- Actions: import, parse, match, evidence retrieval, analysis, decision, claim generation, review actions

## Charge Ingestion

### Supported Report Types
- `fee_report`
- `inventory_adjustment`
- `reimbursement_report`

### Supported Charge Types
- `inbound_defect_fee`
- `lost_inbound`
- `damaged_in_warehouse`
- `fulfilment_fee_weight_tier`
- `refund_issued_item_not_returned`

### Validation Rules
- Required columns checked before parsing
- Each row validated for: line_id, unit_id, charge_type, quantity, amount_usd, posted_date format
- Unknown report types generate warnings but rows are preserved
- Malformed rows preserved with error details
- Duplicates detected by line_id

## Normalization

All charge records are normalized to the `ChargeRecord` interface with:
- Import metadata (`_importId`, `_importedAt`, `_rowIndex`)
- Parse errors (`_parseErrors`) preserved for debugging

## External Rule Handling

**Current approach:** All decision rules are documented as "Demo / configurable rule — not authoritative."

The synthetic data uses invented fee amounts and requirement flags that are NOT real Amazon rules (per the organizer's explicit warning in `data/README.md`).

The system is designed to support external rule lookup:
1. Each decision rule is isolated in a named function
2. Rule source metadata can be attached
3. The UI shows which rules were applied
4. Rules can be updated without changing the core pipeline

## Evaluation Framework

### Primary Metric
```
Claim Precision = Correctly Supported Claims / All Claims Recommended
```

### Ground Truth Methodology
Ground truth is determined deterministically from the evidence:
- For each charge type, the expected decision is derived from the actual evidence state
- This avoids circular evaluation (the evaluator uses the same evidence, different evaluation path)

### Reported Metrics
- Total charges evaluated
- Claims recommended
- Correctly supported claims
- Incorrectly recommended claims
- Missed recoverable claims
- UNCERTAIN / review rate
- Claim precision
- Named failure modes with counts and examples

## Failure Handling

| Scenario | Behavior |
|---|---|
| CSV parse error | Errors preserved, parseable rows continue |
| Missing column | Warning, best-effort parse |
| Malformed row | Row preserved with errors, not discarded |
| Duplicate charge | Detected and excluded from import, counted |
| No unit_id | Charge preserved, decision = REVIEW_REQUIRED |
| No upstream evidence | Charge preserved, decision = REVIEW_REQUIRED |
| Contradictory evidence | Decision = REVIEW_REQUIRED |
| Unknown charge type | Decision = REVIEW_REQUIRED |
| API/dependency failure | Charge preserved in review queue |

**Key principle:** Nothing is silently discarded. Failed cases are always visible.

## Security / Tenancy Considerations

- **No secrets in source**: .env.example provided, no API keys needed for demo
- **File validation**: CSV uploads checked for expected format
- **Structured outputs**: All internal data uses typed interfaces
- **Tenancy awareness**: org_id preserved on all records; the sample data includes two orgs (org_demo_alpha, org_demo_bravo) for tenant isolation testing

### Production tenancy requirements (not implemented in demo):
- Row-level security per org_id
- API authentication
- Separate data stores per organization

## AI Boundaries

In this version, **all reasoning is deterministic**. No LLM calls are made.

The architecture supports future LLM integration for:
- Semantic interpretation of ambiguous evidence
- Natural language claim explanations
- Edge case reasoning

Guardrails:
- LLM output must be structured JSON (validated against schema)
- Deterministic validation overrides generative output
- Model failures move cases to REVIEW_REQUIRED
- Every LLM-generated interpretation must include source evidence

## Round 3 Interoperability

Recovery Manager outputs are structured and predictable:

### Output interfaces:
- `ChargeAnalysis` — complete analysis per charge
- `Claim` — structured claim with evidence references
- `EvaluationResult` — precision metrics

### Service boundaries:
- `ingestion.ts` — standalone charge parser
- `evidence.ts` — standalone evidence interpreter
- `decision-engine.ts` — standalone decision logic
- `store.ts` — state management (replaceable with database)

These can be imported directly by a Round 3 integration layer without depending on the UI.

### Evidence contract:
- Uses `unit_id` as the joining key (shared across all five manager repositories)
- Preserves original upstream record in each evidence item
- Evidence states follow the organizer's PASS/FAIL/UNCERTAIN contract

---

*Recovery Manager Architecture · Cube Buildathon*
