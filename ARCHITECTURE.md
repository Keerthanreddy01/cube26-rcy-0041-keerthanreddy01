# ARCHITECTURE.md — RECOVER Architecture Specification

**Product**: RECOVER — Recovery Manager  
**Role in Commerce Chain**: Step 5 of 5 (Receiving → Prep → Pack → Returns → **Recovery Manager**)  
**Challenge**: CUBE Buildathon · Round 2  

---

## 1. System Architecture

RECOVER is an evidence-first recovery intelligence engine designed to reconcile channel deductions and fee events against factual operational records across the commerce lifecycle. It ingests fee and reimbursement reports, matches charges deterministically against upstream operational records, analyzes the evidence according to cross-stage causal precedence rules, and produces auditable recovery decisions.

### End-to-End Architecture Diagram

```mermaid
flowchart TD
    subgraph Upstream Operational Stages [Upstream Evidence Sources - CUBE Official Contract]
        RCV[Receiving Manager\n(Dock intake, damage, counts)]
        PRP[Prep Manager\n(Polybag, labels, expiry, warnings)]
        PCK[Pack Manager\n(Cartonization, box items, packing)]
        RET[Returns Manager\n(Return receipts, condition, disposition)]
    end

    subgraph Channel Input
        FEE[Fee Report / Adjustment CSV\n(Line ID, Unit ID, Org ID, Charge Type, Amount)]
    end

    subgraph RECOVER Pipeline
        ING[Ingestion & Schema Validation\nsrc/lib/ingestion.ts]
        PAR[Charge Parsing & Normalization\nNormalized ChargeRecord]
        MAT[Deterministic Matching Engine\nunit_id_exact / order_id_asin]
        COL[Evidence Collection & Normalization\nsrc/lib/evidence.ts]
        ANA[Evidence Analysis & Causal Precedence\nEvidenceFinding extraction]
        DEC[Conservative Decision Engine\nsrc/lib/decision-engine.ts]
    end

    subgraph Decision Outcomes
        CLM[Claim Recommended\nCLAIM_RECOMMENDED\nDraft Claim Brief & Attached Evidence]
        REV[Review Required\nREVIEW_REQUIRED\nHuman Review Queue & Ambiguity Context]
        NOC[No Claim\nNO_CLAIM\nJustified Fee / Unsupported Category]
    end

    subgraph Integration & Presentation
        API[Recovery Decisions API\n/api/recovery/decisions]
        UI[Interactive Dashboard & Explorer\nsrc/app/page.tsx]
    end

    FEE --> ING
    ING --> PAR
    PAR --> MAT

    RCV --> COL
    PRP --> COL
    PCK --> COL
    RET --> COL

    MAT --> COL
    COL --> ANA
    ANA --> DEC

    DEC --> CLM
    DEC --> REV
    DEC --> NOC

    CLM --> API
    REV --> API
    NOC --> API

    CLM --> UI
    REV --> UI
    NOC --> UI
```

### Official CUBE Evidence Contract Preservation
RECOVER preserves the official CUBE evidence contract defined by the challenge organizers:
- **Baseline Interoperability**: RECOVER does not invent a competing or alternate cross-pod evidence schema. It consumes the raw CSV outputs of the upstream managers (`receiving_sample.csv`, `prep_sample.csv`, `pack_sample.csv`, and `returns_sample.csv`).
- **Joining Keys**: The primary identifier for cross-stage reconciliation is `unit_id` (`UNIT-0001` through `UNIT-0100`). Secondary correlation uses `order_id` for pack and customer return events.
- **Evidence State Contract**: Every evidence record is classified strictly into `PASS`, `FAIL`, or `UNCERTAIN` in accordance with the organizer's contract specification.
- **Traceability to Raw Records**: Every unified `EvidenceItem` embeds the complete raw upstream record in its `.original` attribute. Record IDs (`record_id`), source stages (`source`), operator IDs (`operator_id`), photo references (`photo_refs`), and captured timestamps (`captured_at`) are preserved for end-to-end auditability.

---

## 2. Components

The RECOVER codebase is structured into modular, single-responsibility components with strict TypeScript type safety:

```
src/
├── app/
│   ├── api/
│   │   ├── demo/fee-report/route.ts       # Serves demo fee report CSV data
│   │   ├── recovery/decisions/route.ts    # Round 3 5-agent interoperability API (GET/POST)
│   │   └── upstream/
│   │       ├── pack/route.ts              # Upstream Pack evidence endpoint
│   │       ├── prep/route.ts              # Upstream Prep evidence endpoint
│   │       ├── receiving/route.ts         # Upstream Receiving evidence endpoint
│   │       └── returns/route.ts           # Upstream Returns evidence endpoint
│   ├── globals.css                        # Design system & CSS tokens
│   ├── layout.tsx                         # Root Next.js layout & metadata
│   └── page.tsx                           # Main interactive UI (8 modules)
└── lib/
    ├── data.ts                            # Disk data loader & PapaParse integration
    ├── data-path.ts                       # Environment-aware file path resolution
    ├── decision-engine.ts                 # Matching, decision logic, claim builder
    ├── eval-fixture.ts                    # Independent 61-case ground-truth fixture
    ├── evidence.ts                        # Evidence normalization, findings & causality
    ├── ingestion.ts                       # CSV parser, column & row schema validation
    ├── store.ts                           # Reactive client state & review triage handlers
    └── types.ts                           # Domain types, interfaces, failure modes
```

### 1. Data Ingestion & Parsing ([`src/lib/ingestion.ts`](src/lib/ingestion.ts))
- **`parseCSV`**: Parses raw CSV text using PapaParse with automatic header trimming and case normalization.
- **`validateColumns`**: Verifies that all 12 required columns (`line_id`, `report_type`, `unit_id`, `org_id`, `sku`, `fnsku`, `fba_shipment_id`, `order_id`, `charge_type`, `quantity`, `amount_usd`, `posted_date`) are present.
- **`parseChargeRow`**: Performs field-level type casting, ISO date verification, and validation.
- **Fault-Tolerant Row Isolation**: Malformed rows are not discarded; they are captured in `ImportBatch.errors` and preserved on the `ChargeRecord._parseErrors` field for audit visibility.
- **`detectDuplicates`**: Identifies duplicate `line_id` values within and across import batches.

### 2. Evidence Processing & Collection ([`src/lib/evidence.ts`](src/lib/evidence.ts))
- **Stage Interpreters**: Dedicated interpretation functions for each upstream manager:
  - `interpretReceiving`: Evaluates dock intake condition, unit damage, carton crushing, count discrepancies, and supplier identity.
  - `interpretPrep`: Evaluates work order compliance (polybag sealing, suffocation warning, FNSKU label placement, barcode covering, expiration marking).
  - `interpretPack`: Evaluates order cartonization, operator packing verdicts, and box verification.
  - `interpretReturns`: Evaluates return receipt, customer return condition, missing components, and warehouse disposition.
- **`getEvidenceForUnit`**: Aggregates all upstream records matching a `unit_id`, sorts them chronologically by `captured_at`, and constructs a unified evidence timeline.

### 3. Evidence Analysis & Findings Extraction ([`src/lib/evidence.ts`](src/lib/evidence.ts))
- Extracts fine-grained `EvidenceFinding` objects from raw operational fields.
- **Relevance**: Classified as `DIRECTLY_RELEVANT`, `PARTIALLY_RELEVANT`, or `CONTEXTUAL_ONLY`.
- **Classification**: Categorized into `SUPPORTS_CLAIM`, `CONTRADICTS_CLAIM`, `UNCERTAIN`, or `MISSING`.
- **Impact**: Weighted as `HIGH`, `MEDIUM`, or `LOW`.
- **Pre-Existing Flag (`is_pre_existing`)**: Flags conditions identified at dock intake to prevent downstream packaging compliance from masking upstream physical damage.

### 4. Decision Engine ([`src/lib/decision-engine.ts`](src/lib/decision-engine.ts))
- **`determineMatchStrategy`**: Evaluates match candidate relationships:
  - `unit_id_exact` (high confidence): Exact `unit_id` match in any upstream source.
  - `order_id_asin` (medium confidence): Secondary match via `order_id` in pack or returns.
  - `unmatched` (none): No upstream record found.
- **`makeDecision`**: Deterministic rule dispatcher that maps charge types to dedicated decision handlers (`decideInboundDefect`, `decideLostInbound`, `decideDamagedInWarehouse`, `decideRefundNotReturned`).
- **Claim Builder (`generateClaim`)**: Assembles `Claim` entities with unique IDs, financial claim amounts, evidence timelines, and supporting record references.
- **Review Case Builder (`generateReviewCase`)**: Isolates ambiguous charges with structured explanations of what is known, what is missing, and what conflicts.

### 5. Recovery Decisions API ([`src/app/api/recovery/decisions/route.ts`](src/app/api/recovery/decisions/route.ts))
- Exposes programmatic REST endpoints for the Round 3 five-agent commerce chain pod:
  - `GET`: Analyzes all fee records against upstream data and returns a structured batch payload.
  - `POST`: Accepts an individual charge event and returns an immediate decision with attached evidence references and audit metadata.

### 6. State Management Store ([`src/lib/store.ts`](src/lib/store.ts))
- Client-side reactive singleton store implementing the observer pattern (`subscribe`/`notify`).
- Computes aggregate metrics (`getMetrics`), tracks import history, maintains the audit log, and manages the human review queue workflow (`approveReview`, `rejectReview`, `markInsufficient`).

### 7. Data Loader & Path Resolution ([`src/lib/data.ts`](src/lib/data.ts), [`src/lib/data-path.ts`](src/lib/data-path.ts))
- Reads the canonical CSV fixtures from the filesystem (`data/fee_report_sample.csv` and `data/upstream/*.csv`).
- Handles path resolution across local Node development environments and serverless runtime environments.

### 8. Evaluation & Testing Harness ([`src/lib/eval-fixture.ts`](src/lib/eval-fixture.ts), [`scripts/`](scripts/))
- **`eval-fixture.ts`**: Contains an independent, manually audited ground-truth fixture for all 61 challenge cases.
- **`scripts/verify-data.mjs`**: Validates CSV schema conformance, row counts, and verifies 100% tenant isolation across organizations.
- **`scripts/test-reasoning.mjs`**: Standalone CI test script that verifies the decision engine achieves 100% precision against the ground-truth benchmark.

### 9. Frontend Application ([`src/app/page.tsx`](src/app/page.tsx))
- Next.js 16 Client Component providing 8 operational views: Dashboard, Charges, Charge Detail Drawer, Evidence Explorer, Review Queue, Claims, Evaluation Lab, and Data Sources.

---

## 3. Data Flow

The lifecycle of every charge through the RECOVER pipeline follows a deterministic 7-step sequence:

```
Fee Report CSV
      │
      ▼
1. Ingestion & Validation ──> Validates headers, parses fields, checks duplicates
      │
      ▼
2. Identifier Matching   ──> Matches unit_id / order_id; verifies org_id boundary
      │
      ▼
3. Evidence Retrieval    ──> Queries Receiving, Prep, Pack, Returns records
      │
      ▼
4. Evidence Findings     ──> Extracts atomic findings with relevance & polarity
      │
      ▼
5. Causal Analysis       ──> Evaluates pre-existing conditions & stage precedence
      │
      ▼
6. Decision Resolution   ──> CLAIM_RECOMMENDED | REVIEW_REQUIRED | NO_CLAIM
      │
      ▼
7. Claim Assembly        ──> Generates draft claim brief OR review ticket
```

### Step 1: Identifier Matching
- **`unit_id` Matching**: The engine checks whether `charge.unit_id` exists in receiving, prep, pack, or returns. If present, it assigns `unit_id_exact` with `high` confidence.
- **`order_id` Matching**: If `unit_id` is missing or unindexed, the engine checks `charge.order_id` against pack and returns records. If matched, it assigns `order_id_asin` with `medium` confidence.
- **Unmatched Handling**: If no identity link can be established, the strategy is set to `unmatched` (`confidence: none`). The charge immediately transitions to `REVIEW_REQUIRED` with the failure mode `missing_upstream_evidence`.
- **Tenancy Boundary Enforcement**: During matching, RECOVER verifies that `charge.org_id` strictly matches the `org_id` of the upstream records to guarantee complete multi-tenant isolation.

### Step 2: Operational Evidence Association
For each matched unit, RECOVER retrieves all associated records across the four upstream stages:
- **Receiving**: Provides dock arrival timestamp, carton integrity, unit damage status, and identity match.
- **Prep**: Provides work order specifications (polybag, suffocation warning, FNSKU barcode placement, expiry) and actual inspection findings.
- **Pack**: Provides outbound packing verification, channel specification, and operator verdicts.
- **Returns**: Provides return receipt confirmation, return dispositioning, and parts completeness.

### Step 3: Evidence Polarity & Relevance Classification
Each extracted finding is assigned an explicit classification:
- **`SUPPORTS_CLAIM`**: The operational evidence directly refutes the channel's deduction (e.g., prep confirms all labeling and polybagging checks passed, contradicting an inbound defect fee).
- **`CONTRADICTS_CLAIM`**: The operational evidence confirms that the defect existed on the merchant's end (e.g., intake inspection recorded `carton_damage: crushing`, justifying an inbound fee).
- **`UNCERTAIN`**: An upstream operator recorded an inconclusive assessment (e.g., `unit_damage: uncertain`).
- **`MISSING`**: A required operational record is absent (e.g., dock receiving was clean, but no prep work order record exists).

### Step 4: Cross-Stage Causal Precedence
Real-world supply chains are causal and sequential. RECOVER models chronological precedence across stages:
1. **Intake Precedence**: Dock receiving occurs *before* prep. If an item arrived at dock receiving with pre-existing water damage (`unit_damage: water`), subsequent compliant polybagging and labeling in the Prep stage **cannot** erase the pre-existing intake defect.
2. **Decision Impact**: When `is_pre_existing: true` and `classification: CONTRADICTS_CLAIM` are detected at receiving, the decision engine immediately rules `NO_CLAIM`. It does not recommend an erroneous dispute.

### Step 5: Charge-Specific Decision Flow Matrix

| Charge Type | Condition Observed | Decision | Rationale |
|---|---|---|---|
| `inbound_defect_fee` | Clean receiving intake + compliant prep packaging | `CLAIM_RECOMMENDED` | Incontrovertible evidence that packaging met specifications |
| `inbound_defect_fee` | Pre-existing damage recorded at receiving intake | `NO_CLAIM` | Fee justified by dock intake condition (causal precedence) |
| `inbound_defect_fee` | Non-compliance recorded at prep (e.g., missing polybag) | `NO_CLAIM` | Fee justified by prep inspection failure |
| `inbound_defect_fee` | Clean receiving, but prep record missing | `REVIEW_REQUIRED` | Incomplete evidence chain |
| `inbound_defect_fee` | Receiving or prep marked `uncertain` | `REVIEW_REQUIRED` | Inconclusive operational record |
| `lost_inbound` | Receiving confirms undamaged receipt and unit count | `CLAIM_RECOMMENDED` | Channel lost inventory after confirmed warehouse intake |
| `lost_inbound` | Receiving notes crushed carton or uncertain arrival | `REVIEW_REQUIRED` | Ambiguous intake liability |
| `damaged_in_warehouse` | Receiving confirms undamaged arrival | `CLAIM_RECOMMENDED` | Damage occurred while in channel custody |
| `refund_issued_item_not_returned` | Returns center confirms physical receipt of item | `CLAIM_RECOMMENDED` | Refund granted to customer but item was returned |
| `fulfilment_fee_weight_tier` | Standard fulfillment fee (no scale calibration error) | `NO_CLAIM` | Legitimate fee; scale error not established |
| Any charge type | Unmatched unit / missing evidence | `REVIEW_REQUIRED` | Cannot claim without upstream proof |

### Step 6: Traceable Claim & Review Assembly
- When `CLAIM_RECOMMENDED` is reached, RECOVER constructs a `Claim` entity containing:
  - Unique `claim_id`
  - Exact `disputed_amount`
  - Formatted claim brief detailing the factual basis
  - `evidence_references`: List of specific `EvidenceItem` records with their original `record_id`, timestamps, and findings
  - Chronological `evidence_timeline`
- When `REVIEW_REQUIRED` is reached, RECOVER creates a `ReviewCase` containing:
  - `why_review_required`: Summary of the ambiguity or missing data
  - `what_is_known`: Summary of verified facts
  - `what_is_missing`: Specific missing records or flags
  - `what_conflicts`: Explicit conflicting evidence statements
  - `possible_actions`: Triage recommendations for the human reviewer

---

## 4. Model / Agent Usage

### Accurate Implementation Disclosure
**RECOVER does NOT use external Large Language Models (LLMs), generative AI APIs, or autonomous probabilistic agents in its recovery decision pipeline.**

The codebase contains:
- **No** OpenAI, Anthropic, or Google Gemini API calls.
- **No** LangChain, LlamaIndex, or agentic framework dependencies.
- **No** non-deterministic prompt templates in the claim decision path.

### Architectural Rationale for Deterministic Decision Logic

1. **Claim Precision & Account Safety**:
   Filing unbacked or hallucinated claims with Amazon or logistics partners risks seller account health, dispute bans, and financial clawbacks. A deterministic rule engine guarantees **0% hallucination** and ensures that claims are generated only when factual evidence directly refutes the deduction.
2. **100% Auditability & Explainability**:
   Every claim decision produces a fully deterministic audit trail. Every sentence in the generated claim brief maps directly to a specific field and timestamp in an upstream operational record.
3. **Strict Uncertainty Handling**:
   Probabilistic models often exhibit sycophancy or attempt to guess plausible answers when evidence is missing. A deterministic engine strictly enforces uncertainty boundaries: if a record is marked `uncertain` or missing, the case is routed to `REVIEW_REQUIRED` without exception.
4. **Execution Performance & Zero Cost**:
   The entire deterministic decision pipeline processes all 61 challenge cases in **under 25 milliseconds** locally. It requires zero cloud API costs, eliminates network latency, and has zero external runtime failure modes.
5. **Reproducibility**:
   Deterministic logic ensures that given the same input CSVs, RECOVER produces identical decisions, claim amounts, and reasoning across every execution.

---

## 5. Important Engineering Decisions

### 1. Preserving the Official Upstream Evidence Contract
Rather than inventing an isolated, proprietary evidence schema, RECOVER strictly adopts the CUBE challenge contract:
- Upstream evidence states remain `PASS`, `FAIL`, and `UNCERTAIN`.
- Original records are preserved in full on every normalized evidence item.
- Stage-specific identifiers (`record_id`, `po_number`, `work_order_id`, `order_id`) are maintained throughout the pipeline.

### 2. Multi-Stage Identifier Matching Strategy
RECOVER implements a tiered matching strategy (`unit_id_exact` → `order_id_asin` → `unmatched`). It never guesses associations; if a charge lacks an identifier or the identifier cannot be found in upstream records, the charge is explicitly flagged as `unmatched` and held for human review.

### 3. Separation of Evidence Extraction from Decision Logic
Evidence extraction ([`src/lib/evidence.ts`](src/lib/evidence.ts)) is strictly decoupled from decision rules ([`src/lib/decision-engine.ts`](src/lib/decision-engine.ts)). `evidence.ts` normalizes raw domain records into factual findings (`EvidenceFinding`), while `decision-engine.ts` evaluates those findings against recovery policies. This separation allows policy updates without altering evidence parsers.

### 4. Explicit Tri-State Decision Outcomes
Rather than a binary "claim / don't claim" output, RECOVER enforces three explicit outcomes:
- `CLAIM_RECOMMENDED`: High-confidence, evidence-backed claims.
- `REVIEW_REQUIRED`: Cases with partial, ambiguous, or missing evidence that require human adjudication.
- `NO_CLAIM`: Cases where the fee is justified by merchant defect or where operational data does not support a claim.

### 5. Cross-Stage Causal Precedence & Pre-Existing Defect Handling
RECOVER enforces chronological causality: upstream events take precedence over downstream events. For example, receiving intake damage cannot be cured or overridden by compliant prep packaging. This prevents false claims on goods that arrived damaged at the dock.

### 6. Failure-Open Architecture for Ingested Data
Malformed or unrecognized data is never silently discarded:
- Ingestion errors are captured in `ImportBatch.errors` and attached to the charge record.
- Unmatched units or unknown charge types automatically fail open into `REVIEW_REQUIRED`.
- The system ensures that every row in an ingested fee report is accounted for on the dashboard.

### 7. Strict Multi-Tenant Organization Isolation (`org_id`)
All charge records and evidence items enforce `org_id` boundaries. RECOVER audits match candidates to ensure evidence from `org_demo_alpha` cannot be matched to a charge belonging to `org_demo_bravo`. Automated tests in `scripts/verify-data.mjs` verify zero cross-organization leakage across the dataset.

### 8. Withholding Claims on Speculative Policies (Weight Tiers)
In fulfillment operations, weight-tier charges (`fulfilment_fee_weight_tier`) represent standard service billing unless scale calibration errors or dimensional discrepancies can be proven. Because the challenge dataset does not contain scale calibration logs, RECOVER withholds claims on weight-tier charges by default (`NO_CLAIM`), avoiding speculative disputes.

### 9. Self-Contained Deployment Without External API Keys
RECOVER is designed to operate completely offline and without external API keys. All state management, parsing, and analysis logic execute locally in memory and via Next.js API routes, ensuring instant setup and zero deployment barriers.

---

## 6. Evaluation & Reliability

RECOVER is evaluated against an independent, un-biased evaluation fixture ([`src/lib/eval-fixture.ts`](src/lib/eval-fixture.ts)) covering all 61 fee events in the challenge dataset.

### Benchmark Results

| Metric | Benchmark Result | Definition |
|---|---|---|
| **Total Cases Evaluated** | **61** | Complete fee report dataset |
| **Decisions Matched** | **61 / 61 (100.0%)** | Agreement between decision engine and independent fixture |
| **Claims Recommended** | **14** | High-confidence dispute recommendations |
| **Correctly Supported Claims** | **14** | True positives confirmed by upstream evidence |
| **False-Positive Claims** | **0** | Zero unbacked or invalid claims recommended |
| **Claim Precision** | **100.0%** | $\frac{\text{Correctly Supported Claims}}{\text{All Claims Recommended}} = \frac{14}{14}$ |
| **Review Cases** | **4 (6.6%)** | Ambiguous cases safely routed to human review |
| **Cases Withheld as No Claim** | **43 (70.5%)** | 42 standard weight fees + 1 pre-existing damage case |
| **Pipeline Latency** | **< 25ms** | Execution time for all 61 cases |

### Important Evaluation Context
> **Disclaimer**: The evaluation benchmark is executed against the synthetic dataset provided for Round 2 of the CUBE Buildathon. Fee amounts, SKU attributes, and requirement flags in the challenge dataset are synthetic test fixtures. These benchmark results demonstrate the internal precision, causal reasoning, and consistency of the RECOVER architecture; they do not represent or imply real-world Amazon reimbursement performance.

---

## 7. API / Integration Surface

RECOVER exposes clean RESTful API endpoints for interoperability with external systems and the Round 3 five-agent commerce chain pod:

### 1. Recovery Decisions API (`/api/recovery/decisions`)

#### `GET /api/recovery/decisions`
Executes end-to-end analysis of all fee report charges against active upstream evidence and returns structured recovery decisions.

**Response Structure (`200 OK`)**:
```json
{
  "status": "success",
  "pod_step": "Step 5 of 5 — Recovery Manager (RECOVER)",
  "version": "1.0.0",
  "summary": {
    "total_charges": 61,
    "claims_recommended": 14,
    "review_required": 4,
    "no_claim": 43,
    "total_disputed_amount_usd": 21.00
  },
  "decisions": [
    {
      "claim_id": "CLM-A1B2C3D4",
      "charge_id": "FEE-0014-1",
      "unit_id": "UNIT-0014",
      "decision": "CLAIM_RECOMMENDED",
      "claim_amount": 2.00,
      "evidence_refs": [
        {
          "source": "receiving",
          "record_id": "RCV-0014",
          "state": "PASS",
          "finding": "Product identity confirmed at dock intake. No carton damage on arrival. Unit arrived undamaged."
        },
        {
          "source": "prep",
          "record_id": "PRP-0014",
          "state": "PASS",
          "finding": "Compliant: Polybag sealed, suffocation warning present, FNSKU label correct, barcode covered."
        }
      ],
      "reasoning": "Receiving evidence verifies unit arrived without damage, and prep evidence verifies full compliance with all packaging and labeling requirements.",
      "review_state": "DRAFT",
      "audit_metadata": {
        "analyzed_at": "2026-10-01T10:45:00.000Z",
        "match_strategy": "unit_id_exact",
        "match_confidence": "high",
        "stage_coverage": {
          "receiving": true,
          "prep": true,
          "pack": false,
          "returns": false
        }
      }
    }
  ]
}
```

#### `POST /api/recovery/decisions`
Evaluates an individual fee record in real time against upstream operational records.

**Request Body**:
```json
{
  "line_id": "FEE-TEST-01",
  "unit_id": "UNIT-0014",
  "org_id": "org_demo_alpha",
  "charge_type": "inbound_defect_fee",
  "amount_usd": 2.00,
  "posted_date": "2026-09-15"
}
```

**Response Body (`200 OK`)**:
```json
{
  "status": "success",
  "pod_step": "Step 5 of 5 — Recovery Manager (RECOVER)",
  "result": {
    "claim_id": "CLM-E5F6G7H8",
    "charge_id": "FEE-TEST-01",
    "unit_id": "UNIT-0014",
    "decision": "CLAIM_RECOMMENDED",
    "claim_amount": 2.00,
    "evidence_refs": [ ... ],
    "reasoning": "Receiving evidence verifies unit arrived without damage...",
    "review_state": "DRAFT",
    "audit_metadata": { ... }
  }
}
```

### 2. Auxiliary Operational Endpoints
- **`GET /api/demo/fee-report`**: Returns the parsed fee report charges from `data/fee_report_sample.csv`.
- **`GET /api/upstream/receiving`**: Returns raw dock receiving records from `data/upstream/receiving_sample.csv`.
- **`GET /api/upstream/prep`**: Returns work order records from `data/upstream/prep_sample.csv`.
- **`GET /api/upstream/pack`**: Returns outbound packing records from `data/upstream/pack_sample.csv`.
- **`GET /api/upstream/returns`**: Returns customer return records from `data/upstream/returns_sample.csv`.
