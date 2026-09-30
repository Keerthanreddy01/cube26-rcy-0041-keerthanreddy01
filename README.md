# Recovery Manager

## RECOVER — Turn Operational Evidence into Defensible Recovery Claims

**Cube Buildathon · Round 2 · Commerce Context · Step 5 of 5**

---

## Problem

Amazon charges inbound defect fees, loses units, damages inventory, and mis-weighs parcels. Sellers are owed reimbursements they never claim, and charged fees they cannot contest, because contesting requires evidence that is fragmented across four operational stages: receiving, prep, pack, and returns.

Today this is done by hand, by agencies taking a percentage, or not at all.

The evidence exists — it's just scattered.

## Solution

Recovery Manager reads the evidence records produced by the other four Managers in the commerce chain, matches them against channel fee and reimbursement reports, determines whether each charge is supported or contradicted by the available evidence, and assembles traceable, defensible claims.

**This is not a vision agent.** No camera, no capture surface. Recovery consumes upstream evidence records, not images.

## How It Works

```
Fee Report Ingestion
       ↓
Charge Parsing & Validation
       ↓
Charge Normalization
       ↓
Unit Matching (deterministic)
       ↓
Upstream Evidence Retrieval
       ↓
Evidence Interpretation (rule-based)
       ↓
Contradiction / Support Analysis
       ↓
Recovery Decision
       ↓
Claim Generation
       ↓
Human Review (when necessary)
       ↓
Audit Trail
```

Every claim is traceable from charge → unit → upstream evidence → interpretation → decision → claim → evidence attached.

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for full system architecture.

### Key Design Decisions

1. **Deterministic rules over generative AI** — Evidence interpretation uses explicit, auditable rules. No LLM hallucination in the decision path.

2. **Precision-first** — The system prefers `REVIEW_REQUIRED` over an unsupported claim. A wrong claim damages seller standing; a missed one costs only money.

3. **Three evidence states** — `PASS`, `FAIL`, `UNCERTAIN`. `UNCERTAIN` is not a low-confidence PASS.

4. **Three decision states** — `CLAIM_RECOMMENDED`, `REVIEW_REQUIRED`, `NO_CLAIM`.

5. **Fail open** — Model or dependency failures preserve the charge and move it to `REVIEW_REQUIRED`. Nothing is silently discarded.

## Evidence Contract Usage

Recovery Manager uses the official evidence contract provided by the organisers as the interoperability baseline.

- **Joining key:** `unit_id` (shared across all five manager repositories: `UNIT-0001` through `UNIT-0100`)
- **Upstream sources:** Receiving, Prep, Pack, Returns records
- **Evidence states:** `PASS`, `FAIL`, `UNCERTAIN` per the organizer specification

Recovery does NOT invent a separate cross-pod evidence contract.

## Decision Framework

| Condition | Decision |
|---|---|
| Strong supporting evidence, no contradictions | `CLAIM_RECOMMENDED` |
| Contradictory evidence | `REVIEW_REQUIRED` or `NO_CLAIM` |
| Missing critical evidence | `REVIEW_REQUIRED` |
| Ambiguous identity match | `REVIEW_REQUIRED` |
| Prep non-compliance found for defect fee | `NO_CLAIM` (fee may be justified) |
| No supporting evidence | `NO_CLAIM` |
| Unsupported charge type | `REVIEW_REQUIRED` / `NO_CLAIM` |
| Standard fulfilment fee (no weight error evidence) | `NO_CLAIM` |

## Precision-First Philosophy

Recovery Manager optimizes for **trustworthy claims**, not maximum claim volume.

```
Claim Precision = Correctly Supported Claims / All Claims Recommended
```

A system that never says "I don't have enough evidence" is not trustworthy. Recovery Manager explicitly surfaces:
- What evidence supports the claim
- What evidence contradicts it
- What evidence is missing
- Why a case requires review
- Named failure modes

## Setup

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` if desired (optional — the application works 100% deterministically in demo mode without any API keys or external services):

```bash
# No API keys required for demo mode
# The entire pipeline is deterministic and runs locally
```

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Data Verification & Test Suite

Run the full deterministic CSV audit and tenancy verification script:

```bash
npm test
```

### Production Build

```bash
npm run build
npm start
```

## Demo Instructions

1. Open the application at [http://localhost:3000](http://localhost:3000)
2. Click **"Run Demo"** in the sidebar
3. The demo loads:
   - **61** charges from organizer-provided synthetic fee report
   - **100** receiving records, **62** prep records, **29** pack records, **24** returns records
4. The pipeline runs automatically:
   - Charges are parsed and validated (0 malformed rows dropped)
   - Each charge is matched to upstream evidence via `unit_id` (100% match rate)
   - Evidence is interpreted with deterministic, auditable rules
   - Recovery decisions are made: **14 Recommended Claims**, **4 Review Required**, **43 No Claim**
   - Claims are generated for supported charges with attached evidence
   - Uncertain or ambiguous cases are routed to the Human Review Queue
5. Navigate through:
   - **Dashboard** — executive metrics, charts, Recovery Guard, Evidence Coverage
   - **Charges** — full charge explorer with coverage and decision filters
   - **Charge Detail** — click any charge to see the complete evidence timeline and route context
   - **Evidence Explorer** — all upstream evidence records across all 4 managers
   - **Review Queue** — cases requiring human judgment with action buttons
   - **Claims** — generated claims with export (JSON/CSV) and formatted briefs
   - **Evaluation** — run the evaluation harness to benchmark precision against independent fixture
   - **Settings / Data Sources** — upload custom CSV reports, view import history and audit logs

## Evaluation Methodology & Results

### Independent Ground Truth
Ground truth was established **independently** from the decision engine by manual audit of the raw upstream records ([`src/lib/eval-fixture.ts`](src/lib/eval-fixture.ts)), covering all 61 cases.

### Formula
$$\text{Claim Precision} = \frac{\text{Correctly Supported Claims}}{\text{All Claims Recommended}} = \frac{14}{14} = \mathbf{100.0\%}$$

- **Claims Recommended**: 14 ($21.00)
- **Correctly Supported**: 14
- **Incorrectly Recommended (False Positives)**: 0
- **Charges Withheld from Auto-Claim**: 47 (43 `NO_CLAIM` + 4 `REVIEW_REQUIRED`)
- **Review Rate**: 6.6% (4 / 61)
- **Causal Precedence**: Case `FEE-0095-1` resolved via generalized cross-stage precedence (receiving damage overrides subsequent prep packaging compliance).

See [`EVAL.md`](EVAL.md) for full evaluation breakdown.

## Failure Modes

| Mode | Count | Impact |
|---|---|---|
| `insufficient_evidence` | 4 | Uncertain inspection flags; routed to Review Queue |
| `missing_upstream_evidence` | 0 | Unit unmapped in upstream data |
| `contradictory_upstream_evidence` | 0 | Resolved via causal precedence (intake defect = NO_CLAIM) |
| `unsupported_charge_type` | 0 | Charge type not mapped in rules |

## Limitations

1. **Synthetic Data Boundaries** — All data is from the organizer-provided synthetic dataset. The requirement flags and fee amounts are sample fixtures.
2. **Weight Tier Calibrations** — No scale calibration records exist in the sample dataset; `fulfilment_fee_weight_tier` charges are marked `NO_CLAIM` by default.
3. **Draft Claims Only** — Claims are assembled as `DRAFT CLAIM` / `READY FOR SUBMISSION` audit packets; no direct Amazon submission integration exists.
4. **Deterministic Focus** — Recovery uses deterministic, auditable rules to maintain high precision and prevent generative hallucinations.

## Future Improvements

- Integration with the other four managers' live outputs (Round 3)
- Database persistence with row-level security
- Authoritative Amazon fee schedule lookup
- LLM-assisted semantic interpretation for edge cases
- Automated filing via Amazon SP-API
- Multi-tenant production deployment

---

*Cube Buildathon · Commerce Context · Recovery Manager*
