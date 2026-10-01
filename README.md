# RECOVER — Recovery Manager

**Cube Buildathon · Round 2 · Step 5 of 5 (Commerce Chain)**

Deployment URL: [https://recover-cube2026.vercel.app](https://recover-cube2026.vercel.app)

---

## 1. Problem Understanding

In modern multi-channel fulfillment operations (such as Amazon FBA and multi-node 3PL networks), sellers frequently encounter inventory deductions, warehouse damage adjustments, customer return discrepancies, and inbound defect penalties. In response, sellers are either charged non-compliance fees or denied reimbursements for inventory that was mishandled or misclassified by the fulfillment channel.

Contesting these deductions requires reconstructing operational reality from disparate warehouse systems. The evidence needed to support or dispute these charges is fragmented across four operational stages:
- **Receiving (Dock Intake)**: Records carton integrity, unit damage on arrival, quantity count discrepancies, and supplier packaging condition. It establishes whether an item arrived damaged or defective *before* the merchant's warehouse handled it.
- **Prep (Work Order Compliance)**: Records polybagging, suffocation warnings, FNSKU barcode placement, expiry labeling, and fragile handling. It provides direct evidence of compliance with inbound packaging specifications.
- **Pack (Outbound Fulfillment)**: Records order cartonization, observed items in carton, box seal integrity, and operator packing sign-offs.
- **Returns (Reverse Logistics)**: Records customer return receipts, item condition assessments, missing component logs, and return dispositioning. It verifies whether an item was physically returned to the warehouse when a refund was granted.

### Why Unsupported Claims Must Be Avoided
Filing automated or speculative claims without concrete operational evidence causes severe negative outcomes:
- **Channel Standing & Account Health**: Submitting false, invalid, or unverified claims can trigger dispute bans, policy warnings, or account suspension.
- **Clawbacks & Audit Penalties**: Unsupported claims approved inadvertently are subject to post-reconciliation audits, resulting in clawbacks and financial penalties.
- **Wasted Review Cycles**: Flooding dispute teams with weak claims strains relationship capital and delays resolution of genuine high-value recoveries.

A trustworthy recovery system must prioritize **precision over volume**: it must never guess, never fabricate, and never recommend a claim unless verifiable upstream operational records directly refute the channel's deduction.

---

## 2. Solution Overview

**RECOVER (Recovery Manager)** is an evidence-first recovery intelligence engine. It ingests marketplace fee reports, matches fee events deterministically against upstream operational records across the commerce lifecycle, analyzes the factual evidence, and generates auditable recovery decisions.

### Core Operating Principle: Evidence First, Claims Second
The guiding principle of RECOVER is **evidence first, claims second**:
- A recovery claim is never generated simply because a fee occurred.
- If upstream evidence is missing, ambiguous, incomplete, or conflicting, the system **does not force a claim**.
- Ambiguous cases are routed to human review, while demonstrably justified channel charges or unsupported categories are classified as `NO_CLAIM`.

### Three Explicit Decision Outcomes
Every evaluated fee record resolves into exactly one of three deterministic states:

1. **Claim Recommended (`CLAIM_RECOMMENDED`)**:
   Concrete upstream evidence incontrovertibly refutes the fee or confirms channel liability (e.g., dock receiving confirms a unit arrived undamaged and fully counted before channel loss, or prep inspection confirms full polybag and label compliance before an inbound defect fee was levied). A defensible claim brief is generated with attached evidence records.

2. **Review Required (`REVIEW_REQUIRED`)**:
   The evidence is ambiguous, partial, uncertain, or exhibits conflicting signals that cannot be conclusively resolved by automated rules (e.g., an operator recorded `uncertain` damage at intake, or an unmapped discrepancy arose). These cases are isolated into the Human Review Queue for operator adjudication without risking false-positive claim filings.

3. **No Claim (`NO_CLAIM`)**:
   The evidence shows that the fee is justified (e.g., warehouse intake recorded pre-existing water damage on dock arrival), or the available operational data does not establish an error (e.g., standard fulfillment fees where no scale calibration log exists). No claim is generated.

### System Architecture & Workflow

```
┌──────────────┐     ┌────────────────────────┐     ┌────────────────────────┐
│  Fee Report  │ ──> │ Charge Parsing/Schema  │ ──> │   Deterministic Unit   │
│ Ingestion CSV│     │   Validation Layer     │     │   & Order Matching     │
└──────────────┘     └────────────────────────┘     └────────────────────────┘
                                                                 │
                                                                 ▼
┌────────────────────────┐     ┌────────────────────────┐   ┌────────────────────────┐
│    Final Decision      │ <── │   Evidence Analysis    │ <─── Upstream Operational │
│ ────────────────────── │     │  & Causal Precedence   │   │ Evidence (Dock, Prep,  │
│ • Claim Recommended    │     │  (Support/Contradict)  │   │     Pack, Returns)     │
│ • Review Required      │     └────────────────────────┘   └────────────────────────┘
│ • No Claim             │
└────────────────────────┘
```

#### Cross-Stage Causal Precedence
Real-world operational stages occur sequentially. RECOVER models chronological causality across stages:
- *Example*: If an item arrived at dock receiving with pre-existing water damage (`unit_damage=water`), subsequent compliant packaging in the Prep stage does **not** erase the dock defect. RECOVER recognizes this causal precedence and resolves the inbound defect fee to `NO_CLAIM`, avoiding an invalid dispute.

---

## 3. Setup Instructions

### Prerequisites
- **Node.js**: v18.17.0 or higher (v20+ recommended)
- **npm**: v9 or higher

### Local Installation & Development

1. Clone the repository and navigate into the project root:
   ```bash
   git clone https://github.com/Keerthanreddy01/cube26-rcy-0041-keerthanreddy01.git
   cd cube26-rcy-0041-keerthanreddy01
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

### Production Build & Start

To build and run the optimized production bundle locally:

```bash
npm run build
npm start
```

### Environment Variables
**No environment variables are required.** The application is 100% self-contained and deterministic. All ingestion, normalization, matching, evidence analysis, and evaluation harnesses execute locally in memory and via client-side/API routes without requiring external API keys, database credentials, or paid cloud services. An optional `.env.example` file is included in the repository solely for future extensibility.

---

## 4. Usage Instructions

An evaluator can explore the entire recovery pipeline directly from the web interface.

### Key Pages & Features

- **Dashboard (Overview)**:
  Displays top-level operational metrics: total fee exposure, recoverable claim volume, review queue count, no-claim count, claim precision rate, evidence coverage by operational stage, and recovery breakdown charts.
- **Charges**:
  An interactive tabular charge explorer displaying all fee events. Allows filtering by decision outcome (`CLAIM_RECOMMENDED`, `REVIEW_REQUIRED`, `NO_CLAIM`), matching confidence, and charge type. Evaluators can click any charge to open the **Charge Detail** drawer, displaying the full chronological timeline from dock receiving to returns.
- **Evidence**:
  Unified multi-stage operational evidence browser. Evaluators can view raw records across Receiving (100 rows), Prep (62 rows), Pack (29 rows), and Returns (24 rows), inspect photos and inspection flags, and verify multi-tenant isolation (`org_id`).
- **Review Queue**:
  A triaged queue of uncertain and ambiguous charges requiring human operator attention. Evaluators can review the exact evidence ambiguity and exercise human-in-the-loop actions (**Approve as Claim**, **Reject / No Claim**, or **Flag as Insufficient Evidence**).
- **Claims**:
  Displays all generated recovery claims. Each claim features an audit-ready claim brief, explicit supporting evidence references, claim amounts, and one-click export capabilities (**Export JSON** and **Export CSV**).
- **Evaluation**:
  An interactive benchmark lab that runs RECOVER's decision engine against the independent ground-truth evaluation fixture (`src/lib/eval-fixture.ts`). Displays instant precision, recall, confusion matrix, and case-by-case comparison.
- **Data Sources**:
  Displays status and metadata of active datasets (`fee_report_sample.csv`, upstream evidence CSVs). Allows evaluators to upload custom fee reports or reset to default synthetic data.
- **Demo**:
  A guided demo page that executes the full pipeline end-to-end with visual step-by-step progress tracking from raw CSV ingestion through to claim brief generation.

### Tracing a Charge from Fee Report to Decision

To trace a specific charge:
1. Open the **Charges** page from the sidebar.
2. Select any charge (for example, `FEE-0014-1` — an inbound defect fee on `UNIT-0014`).
3. Click on the row to open the **Charge Detail** view.
4. Observe the **Operational Evidence Timeline**:
   - **Receiving**: Verifies clean arrival (`unit_damage: none`, `carton_damage: none`).
   - **Prep**: Verifies all work order packaging specifications were completed (`polybag_present_sealed: pass`, `suffocation_warning: pass`, `fnsku_label_placement: pass`).
5. Observe the **Decision Engine Analysis**: Because intake damage is absent and prep compliance is verified, the system rules the inbound defect fee unjustified and renders `CLAIM_RECOMMENDED`.
6. Switch to the **Claims** page to inspect the assembled draft claim brief with attached evidence IDs and timestamps.

### Evaluation Results on the Benchmark Fixture

RECOVER includes an independent evaluation benchmark covering all 61 fee cases from the challenge dataset:

- **Total Cases Evaluated**: 61
- **Decisions Matched**: 61 / 61 (100.0%)
- **Claims Recommended**: 14
- **Correctly Supported Claims**: 14
- **False-Positive Claims**: 0
- **Claim Precision**: **100%** on the evaluation fixture

> **Evaluation Disclaimer**: These benchmark metrics reflect evaluation against the challenge's synthetic dataset and independent fixture ([`src/lib/eval-fixture.ts`](src/lib/eval-fixture.ts)). They do not claim or imply real-world Amazon reimbursement performance or real Amazon dispute policy success rates.

---

## 5. Assumptions & Limitations

To ensure transparency and integrity, the following operational assumptions and limitations are explicitly noted:

1. **Synthetic Data**: The challenge dataset is synthetic. Fee amounts, SKU references, order numbers, and operational flags are sample test fixtures designed for evaluation.
2. **Challenge Rules vs. Real Amazon Policies**: The fee types, requirement flags, and recovery criteria modeled reflect the CUBE Buildathon challenge specifications and do not constitute actual Amazon reimbursement agreements, FBA policies, or service terms.
3. **Upstream Evidence Dependency**: RECOVER relies entirely on structured operational evidence provided by upstream managers (Receiving, Prep, Pack, Returns). If upstream systems fail to capture dock intake or prep compliance data, the system cannot verify charge validity.
4. **Handling of Missing or Ambiguous Evidence**: Whenever operational evidence is missing, conflicting, or inconclusive, RECOVER intentionally withholds automated claim recommendations and routes the case to `REVIEW_REQUIRED` or `NO_CLAIM`.
5. **Weight-Tier and Dimensional Measurement Charges**: Standard weight-tier fulfillment fees (`fulfilment_fee_weight_tier`) are classified as `NO_CLAIM` by default because the available synthetic dataset does not contain scale calibration logs or dimensional cubiscan audit records necessary to establish measurement error.
6. **Claim Assembly vs. Channel Submission**: RECOVER acts as a recovery intelligence and decision engine that prepares traceable, evidence-backed claim packages and briefs; it does not directly transmit or submit claims to Amazon Seller Central or the Amazon SP-API.

---

## 6. Testing & Evaluation

RECOVER includes automated verification scripts and type checking:

### 1. Data Verification & Reasoning Test Suite
Run the full test suite, which verifies CSV data integrity, schema consistency, multi-tenancy isolation (`org_id`), and benchmarks reasoning against the independent fixture:

```bash
npm test
```

This runs:
- `scripts/verify-data.mjs`: Validates all 5 CSV data files, verifies zero malformed rows, audits unit matching across FBA/3PL routes, and confirms 100% tenant isolation.
- `scripts/test-reasoning.mjs`: Executes the decision engine against all 61 cases and validates that all 61 match the independent ground truth with 0 false positives.

### 2. TypeScript Static Type Checking
Verify strict TypeScript compilation across the entire project:

```bash
npx tsc --noEmit
```

### 3. Production Build Verification
Verify that Next.js compiles, validates routes, and generates static pages without warnings or errors:

```bash
npm run build
```

### 4. Independent Evaluation Fixture
The ground truth fixture is maintained in [`src/lib/eval-fixture.ts`](src/lib/eval-fixture.ts) independently of the decision engine logic, ensuring un-biased evaluation scoring.

---

## 7. Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **UI Library**: [React 19](https://react.dev/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/) (strict mode)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Data Ingestion & Parsing**: [PapaParse](https://www.papaparse.com/)
- **Visualizations**: [Recharts](https://recharts.org/)
- **Iconography**: [Lucide React](https://lucide.dev/)

---

## 8. Project Structure

```
cube26-rcy-0041-keerthanreddy01/
├── data/                               # Challenge dataset files
│   ├── fee_report_sample.csv           # 61 fee report charge events
│   └── upstream/                       # Upstream operational evidence
│       ├── receiving_sample.csv        # 100 dock receiving records
│       ├── prep_sample.csv             # 62 prep work order records
│       ├── pack_sample.csv             # 29 pack & fulfillment records
│       └── returns_sample.csv          # 24 customer return records
├── scripts/                            # Verification & evaluation scripts
│   ├── verify-data.mjs                 # CSV schema and tenancy audit script
│   └── test-reasoning.mjs              # Automated decision engine test suite
├── src/
│   ├── app/                            # Next.js App Router
│   │   ├── api/                        # API routes
│   │   │   ├── demo/fee-report/        # Fee report endpoint
│   │   │   ├── recovery/decisions/     # Round 3 5-agent interoperability API
│   │   │   └── upstream/               # Upstream evidence query endpoints
│   │   ├── globals.css                 # Application styling
│   │   ├── layout.tsx                  # Root HTML layout and metadata
│   │   └── page.tsx                    # Main interactive application UI
│   └── lib/                            # Core engine logic
│       ├── data.ts                     # Upstream CSV loaders and data access
│       ├── decision-engine.ts          # Deterministic decision rules & claim generator
│       ├── eval-fixture.ts             # Independent evaluation ground truth fixture
│       ├── evidence.ts                 # Evidence normalization & causality logic
│       ├── ingestion.ts                # Fee report CSV parser & validator
│       ├── store.ts                    # Application state management & reactivity
│       └── types.ts                    # TypeScript domain models and contracts
├── ARCHITECTURE.md                     # Detailed system architecture document
├── EVAL.md                             # Comprehensive evaluation benchmark report
├── package.json                        # Scripts and dependencies
└── tsconfig.json                       # TypeScript compiler configuration
```

---

## 9. Deployment

- **Live Production URL**: [https://recover-cube2026.vercel.app](https://recover-cube2026.vercel.app)
- **Hosting Platform**: Vercel
- **Deployment Branch**: `keerthan-cube2026`
- **Vercel Configuration**: Configured via `vercel.json` with deployment enabled on the `keerthan-cube2026` branch.
