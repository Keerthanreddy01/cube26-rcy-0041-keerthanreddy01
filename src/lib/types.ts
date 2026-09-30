// =============================================================================
// RECOVER — Recovery Manager · Core Type Definitions
// =============================================================================
// These types are derived from the actual CSV schemas in data/ and data/upstream/
// =============================================================================

// --- Evidence States (from organizer spec) ---
export type EvidenceState = 'PASS' | 'FAIL' | 'UNCERTAIN';

// --- Recovery Decision States ---
export type RecoveryDecision = 'CLAIM_RECOMMENDED' | 'REVIEW_REQUIRED' | 'NO_CLAIM';

// --- Charge Types (from fee_report_sample.csv) ---
export type ChargeType =
  | 'inbound_defect_fee'
  | 'lost_inbound'
  | 'damaged_in_warehouse'
  | 'fulfilment_fee_weight_tier'
  | 'refund_issued_item_not_returned'
  | string; // Allow unknown charge types

// --- Report Types (from fee_report_sample.csv) ---
export type ReportType = 'fee_report' | 'inventory_adjustment' | 'reimbursement_report' | string;

// --- Match Strategy ---
export type MatchStrategy =
  | 'unit_id_exact'
  | 'order_id_asin'
  | 'asin_shipment'
  | 'sku_date_proximity'
  | 'partial_match'
  | 'unmatched';

// --- Failure Modes ---
export type FailureMode =
  | 'missing_unit_identifier'
  | 'ambiguous_unit_match'
  | 'missing_upstream_evidence'
  | 'contradictory_upstream_evidence'
  | 'unsupported_charge_type'
  | 'malformed_charge_record'
  | 'incomplete_evidence_chain'
  | 'insufficient_evidence'
  | 'model_dependency_failure'
  | 'duplicate_charge';

// =============================================================================
// Fee / Charge Record (from fee_report_sample.csv)
// =============================================================================
export interface ChargeRecord {
  line_id: string;
  report_type: ReportType;
  unit_id: string;
  org_id: string;
  sku: string;
  fnsku: string;
  fba_shipment_id: string;
  order_id: string;
  charge_type: ChargeType;
  quantity: number;
  amount_usd: number;
  posted_date: string;
  // Internal fields
  _importId?: string;
  _importedAt?: string;
  _rowIndex?: number;
  _parseErrors?: string[];
}

// =============================================================================
// Upstream Evidence Records (from data/upstream/*.csv)
// =============================================================================

export interface ReceivingRecord {
  record_id: string;
  unit_id: string;
  org_id: string;
  po_number: string;
  po_line: string;
  supplier: string;
  sku: string;
  asin: string;
  product_title: string;
  spec_colour: string;
  spec_variant: string;
  spec_components: string;
  cartons_ordered: number;
  cartons_received: number;
  units_per_carton_ordered: number;
  units_per_carton_counted: number;
  qty_ordered: number;
  qty_received: number;
  identity_match: string;
  carton_damage: string;
  unit_damage: string;
  quality_flags: string;
  photo_refs: string;
  operator_id: string;
  captured_at: string;
}

export interface PrepRecord {
  record_id: string;
  unit_id: string;
  org_id: string;
  work_order_id: string;
  fba_shipment_id: string;
  sku: string;
  asin: string;
  fnsku: string;
  prep_price_usd: number;
  wo_polybag: string;
  wo_suffocation_warning: string;
  wo_expiry_date: string;
  wo_handling_marks: string;
  polybag_present_sealed: string;
  suffocation_warning: string;
  fnsku_label_placement: string;
  original_barcode_covered: string;
  expiry_date: string;
  handling_marks: string;
  photo_refs: string;
  operator_id: string;
  captured_at: string;
}

export interface PackRecord {
  record_id: string;
  unit_id: string;
  org_id: string;
  order_id: string;
  channel: string;
  order_lines: string;
  observed_in_box: string;
  operator_verdict: string;
  photo_refs: string;
  operator_id: string;
  captured_at: string;
}

export interface ReturnsRecord {
  record_id: string;
  unit_id: string;
  org_id: string;
  order_id: string;
  ordered_sku: string;
  ordered_asin: string;
  identity_match: string;
  parts_list: string;
  parts_missing: string;
  observed_state: string;
  amazon_condition: string;
  operator_disposition: string;
  photo_refs: string;
  operator_id: string;
  captured_at: string;
}

// =============================================================================
// =============================================================================
// Unified Evidence Item & Evidence Findings
// =============================================================================
export type FindingRelevance = 'DIRECTLY_RELEVANT' | 'PARTIALLY_RELEVANT' | 'CONTEXTUAL_ONLY';
export type FindingImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type FindingClassification =
  | 'SUPPORTS_CLAIM'
  | 'CONTRADICTS_CLAIM'
  | 'UNCERTAIN'
  | 'MISSING';

export interface EvidenceFinding {
  id: string;
  source: 'receiving' | 'prep' | 'pack' | 'returns';
  source_record_id: string;
  finding: string;
  charge_relevance: FindingRelevance;
  relevance_explanation: string;
  classification: FindingClassification;
  impact: FindingImpact;
  is_pre_existing?: boolean;
}

export interface EvidenceItem {
  id: string;
  source: 'receiving' | 'prep' | 'pack' | 'returns';
  record_id: string;
  unit_id: string;
  org_id: string;
  timestamp: string;
  state: EvidenceState;
  interpretation: string;
  finding: string;
  supporting: string[];
  contradicting: string[];
  missing: string[];
  decision_impact: string;
  findings_detail?: EvidenceFinding[];
  original: ReceivingRecord | PrepRecord | PackRecord | ReturnsRecord;
}

// =============================================================================
// Charge Analysis Result
// =============================================================================
export interface ChargeAnalysis {
  charge: ChargeRecord;
  matchStrategy: MatchStrategy;
  matchConfidence: string;
  matchExplanation: string;
  evidence: EvidenceItem[];
  evidenceFindings?: EvidenceFinding[];
  evidenceCoverage: {
    receiving: boolean;
    prep: boolean;
    pack: boolean;
    returns: boolean;
  };
  contradictions: string[];
  missingEvidence: string[];
  supportingEvidence: string[];
  reasoning: string;
  decision: RecoveryDecision;
  claimAmount: number;
  failureModes: FailureMode[];
  auditTrail: AuditEntry[];
}

// =============================================================================
// Claim
// =============================================================================
export interface Claim {
  claim_id: string;
  charge_id: string;
  unit_id: string;
  org_id: string;
  claim_type: string;
  disputed_amount: number;
  reason: string;
  explanation: string;
  supporting_evidence: string[];
  evidence_references: EvidenceItem[];
  evidence_timeline: TimelineEntry[];
  decision_state: RecoveryDecision;
  status: 'DRAFT' | 'READY_FOR_SUBMISSION' | 'APPROVED' | 'REJECTED' | 'INSUFFICIENT_EVIDENCE';
  generated_at: string;
  reviewed_at?: string;
  reviewer_note?: string;
  original_decision?: RecoveryDecision;
}

// =============================================================================
// Review Case
// =============================================================================
export interface ReviewCase {
  id: string;
  charge: ChargeRecord;
  analysis: ChargeAnalysis;
  reason: string;
  what_is_known: string[];
  what_is_missing: string[];
  what_conflicts: string[];
  possible_actions: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INSUFFICIENT_EVIDENCE';
  reviewer_note?: string;
  reviewed_at?: string;
  original_decision: RecoveryDecision;
}

// =============================================================================
// Audit Trail
// =============================================================================
export interface AuditEntry {
  timestamp: string;
  action: string;
  detail: string;
  source: string;
}

// =============================================================================
// Timeline
// =============================================================================
export interface TimelineEntry {
  timestamp: string;
  source: string;
  event: string;
  state: EvidenceState;
  detail: string;
}

// =============================================================================
// Import Batch
// =============================================================================
export interface ImportBatch {
  id: string;
  filename: string;
  imported_at: string;
  total_rows: number;
  parsed_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  total_amount: number;
  charges: ChargeRecord[];
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  error: string;
  raw_data: string;
}

// =============================================================================
// Dashboard Metrics
// =============================================================================
export interface DashboardMetrics {
  totalCharges: number;
  totalAmount: number;
  potentialRecovery: number;
  claimsRecommended: number;
  claimsRecommendedAmount: number;
  reviewRequired: number;
  noClaim: number;
  claimPrecision: number;
  evidenceCoverage: number;
  unmatchedCharges: number;
  uncertainCases: number;
  chargesByType: Record<string, number>;
  decisionDistribution: {
    claim_recommended: number;
    review_required: number;
    no_claim: number;
  };
  recoveryGuard: {
    totalPrevented: number;
    preventedAmount: number;
    missingEvidenceCount: number;
    conflictingEvidenceCount: number;
    ambiguousIdentityCount: number;
    unsupportedChargeCount: number;
  };
  coverageBreakdown: {
    complete: number;
    partial: number;
    conflicting: number;
    unmatched: number;
  };
}

// =============================================================================
// Evaluation
// =============================================================================
export interface EvaluationResult {
  total_charges: number;
  claims_recommended: number;
  correctly_supported: number;
  incorrectly_recommended: number;
  missed_recoverable: number;
  review_rate: number;
  claim_precision: number;
  failure_modes: FailureModeReport[];
  cases: EvaluationCase[];
}

export interface EvaluationCase {
  case_id: string;
  charge_id: string;
  unit_id: string;
  charge_type: string;
  expected_outcome: RecoveryDecision;
  expected_claim_amount: number;
  actual_outcome: RecoveryDecision;
  actual_claim_amount: number;
  correct: boolean;
  ground_truth_reason: string;
  reasoning: string;
  // Backwards compatibility aliases
  expected_decision: RecoveryDecision;
  actual_decision: RecoveryDecision;
  ground_truth_note: string;
}

export interface FailureModeReport {
  mode: FailureMode;
  count: number;
  percentage: number;
  example_cases: string[];
  impact: string;
}
