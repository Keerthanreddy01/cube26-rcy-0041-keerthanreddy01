// =============================================================================
// RECOVER — Evidence Engine
// Loads, normalizes, and interprets upstream evidence records
// Implements cross-stage precedence, condition relevance, and pre-existing defect tracking
// =============================================================================
import type {
  ReceivingRecord, PrepRecord, PackRecord, ReturnsRecord,
  EvidenceItem, EvidenceState, ChargeRecord, ChargeType,
  EvidenceFinding
} from './types';

// =============================================================================
// Evidence Interpretation — Receiving (Stage 1: Intake Dock)
// =============================================================================
export function interpretReceiving(rec: ReceivingRecord, chargeType: ChargeType): EvidenceItem {
  const finding: string[] = [];
  const supporting: string[] = [];
  const contradicting: string[] = [];
  const missing: string[] = [];
  const findingsDetail: EvidenceFinding[] = [];
  let state: EvidenceState = 'PASS';
  let decisionImpact = '';

  // 1. Identity match
  if (rec.identity_match === 'yes') {
    finding.push('Product identity confirmed at dock intake.');
    supporting.push(`Identity match confirmed: ${rec.identity_match}`);
    findingsDetail.push({
      id: `fnd-rcv-id-${rec.record_id}`,
      source: 'receiving',
      source_record_id: rec.record_id,
      finding: 'Product identity confirmed at dock intake.',
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Confirms physical unit received matches purchase order SKU/ASIN.',
      classification: 'SUPPORTS_CLAIM',
      impact: 'HIGH',
      is_pre_existing: false,
    });
  } else if (rec.identity_match === 'uncertain') {
    finding.push('Product identity uncertain at receiving.');
    missing.push('Reliable identity confirmation at receiving');
    state = 'UNCERTAIN';
    findingsDetail.push({
      id: `fnd-rcv-id-${rec.record_id}`,
      source: 'receiving',
      source_record_id: rec.record_id,
      finding: 'Product identity uncertain at receiving dock.',
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Cannot verify whether the received unit matches the charged catalog item.',
      classification: 'UNCERTAIN',
      impact: 'HIGH',
      is_pre_existing: false,
    });
  } else {
    finding.push(`Product identity mismatch at receiving: ${rec.identity_match}`);
    contradicting.push(`Identity mismatch at receiving: ${rec.identity_match}`);
    state = 'FAIL';
    findingsDetail.push({
      id: `fnd-rcv-id-${rec.record_id}`,
      source: 'receiving',
      source_record_id: rec.record_id,
      finding: `Product identity mismatch (${rec.identity_match}) at intake.`,
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Identity mismatch prevents linking upstream evidence to charge.',
      classification: 'CONTRADICTS_CLAIM',
      impact: 'HIGH',
      is_pre_existing: true,
    });
  }

  // 2. Physical Unit Damage (Pre-existing Condition Rule)
  if (rec.unit_damage && rec.unit_damage !== 'none') {
    if (rec.unit_damage === 'uncertain') {
      finding.push('Unit damage condition uncertain at receiving.');
      missing.push('Clear receiving unit damage assessment');
      state = state === 'FAIL' ? 'FAIL' : 'UNCERTAIN';
      findingsDetail.push({
        id: `fnd-rcv-dmg-${rec.record_id}`,
        source: 'receiving',
        source_record_id: rec.record_id,
        finding: 'Unit physical condition uncertain at intake.',
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'Uncertain intake condition leaves causality unresolved.',
        classification: 'UNCERTAIN',
        impact: 'HIGH',
        is_pre_existing: false,
      });
    } else {
      finding.push(`Unit damage noted at receiving: ${rec.unit_damage}`);
      contradicting.push(`Pre-existing unit damage at receiving: ${rec.unit_damage}`);
      state = 'FAIL';
      decisionImpact = `Pre-existing damage (${rec.unit_damage}) recorded upon arrival justifies inbound defect fee. Downstream packaging compliance cannot negate prior damage.`;
      findingsDetail.push({
        id: `fnd-rcv-dmg-${rec.record_id}`,
        source: 'receiving',
        source_record_id: rec.record_id,
        finding: `Receiving damage logged: ${rec.unit_damage}`,
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'Physical damage existed on carrier arrival. Downstream packaging compliance does not establish unit was undamaged.',
        classification: 'CONTRADICTS_CLAIM',
        impact: 'HIGH',
        is_pre_existing: true,
      });
    }
  } else {
    finding.push('No unit damage noted at receiving.');
    supporting.push('Clean arrival: no unit damage recorded at receiving');
    findingsDetail.push({
      id: `fnd-rcv-dmg-${rec.record_id}`,
      source: 'receiving',
      source_record_id: rec.record_id,
      finding: 'No unit damage noted at receiving intake.',
      charge_relevance: (chargeType === 'inbound_defect_fee' || chargeType === 'damaged_in_warehouse') ? 'DIRECTLY_RELEVANT' : 'CONTEXTUAL_ONLY',
      relevance_explanation: 'Intake inspection verified unit arrived free of visible physical damage.',
      classification: 'SUPPORTS_CLAIM',
      impact: 'HIGH',
      is_pre_existing: false,
    });
  }

  // 3. Carton Damage
  if (rec.carton_damage && rec.carton_damage !== 'none') {
    finding.push(`Carton damage noted at receiving: ${rec.carton_damage}`);
    if (chargeType === 'inbound_defect_fee' || chargeType === 'damaged_in_warehouse') {
      contradicting.push(`Pre-existing carton damage at receiving: ${rec.carton_damage}`);
      state = state === 'FAIL' ? 'FAIL' : 'UNCERTAIN';
      findingsDetail.push({
        id: `fnd-rcv-crt-${rec.record_id}`,
        source: 'receiving',
        source_record_id: rec.record_id,
        finding: `Carton damage noted: ${rec.carton_damage}`,
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'External carton damage indicates transit or handling stress prior to warehouse processing.',
        classification: 'CONTRADICTS_CLAIM',
        impact: 'MEDIUM',
        is_pre_existing: true,
      });
    }
  }

  // 4. Quality Flags
  if (rec.quality_flags) {
    finding.push(`Quality flags: ${rec.quality_flags}`);
    if (rec.quality_flags.includes('obvious_defect')) {
      findingsDetail.push({
        id: `fnd-rcv-qf-${rec.record_id}`,
        source: 'receiving',
        source_record_id: rec.record_id,
        finding: `Quality flag: ${rec.quality_flags}`,
        charge_relevance: 'CONTEXTUAL_ONLY',
        relevance_explanation: 'Intake operator note recorded. Unit and carton physical damage confirmed none.',
        classification: 'SUPPORTS_CLAIM',
        impact: 'LOW',
        is_pre_existing: false,
      });
    }
    if (rec.quality_flags.includes('missing_components')) {
      findingsDetail.push({
        id: `fnd-rcv-mc-${rec.record_id}`,
        source: 'receiving',
        source_record_id: rec.record_id,
        finding: 'Missing components noted at receiving.',
        charge_relevance: 'PARTIALLY_RELEVANT',
        relevance_explanation: 'Intake parts note flagged for packaging review.',
        classification: 'UNCERTAIN',
        impact: 'LOW',
        is_pre_existing: false,
      });
    }
  }

  // 5. Quantity Check
  if (rec.qty_received < rec.qty_ordered) {
    const shortage = rec.qty_ordered - rec.qty_received;
    finding.push(`Short shipment: ordered ${rec.qty_ordered}, received ${rec.qty_received}`);
    if (chargeType === 'lost_inbound') {
      supporting.push(`Quantity shortfall at receiving: ${shortage} unit(s)`);
      findingsDetail.push({
        id: `fnd-rcv-qty-${rec.record_id}`,
        source: 'receiving',
        source_record_id: rec.record_id,
        finding: `Short shipment: ordered ${rec.qty_ordered}, received ${rec.qty_received}`,
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'Receiving record confirms missing quantity from carrier shipment.',
        classification: 'SUPPORTS_CLAIM',
        impact: 'HIGH',
        is_pre_existing: false,
      });
    }
  }

  if (!decisionImpact) {
    if (state === 'FAIL') {
      decisionImpact = 'Receiving record identifies pre-existing defect or mismatch that contradicts recovery.';
    } else if (state === 'UNCERTAIN') {
      decisionImpact = 'Receiving record contains uncertain condition flags requiring human review.';
    } else if (chargeType === 'inbound_defect_fee' || chargeType === 'damaged_in_warehouse') {
      decisionImpact = 'Receiving evidence shows clean intake — contradicts defect/damage fee.';
    } else {
      decisionImpact = 'Receiving evidence provides baseline chain-of-custody verification.';
    }
  }

  return {
    id: `ev-rcv-${rec.record_id}`,
    source: 'receiving',
    record_id: rec.record_id,
    unit_id: rec.unit_id,
    org_id: rec.org_id,
    timestamp: rec.captured_at,
    state,
    interpretation: finding.join(' '),
    finding: finding.join(' '),
    supporting,
    contradicting,
    missing,
    decision_impact: decisionImpact,
    findings_detail: findingsDetail,
    original: rec,
  };
}

// =============================================================================
// Evidence Interpretation — Prep (Stage 2: Preparation & Labeling)
// =============================================================================
export function interpretPrep(rec: PrepRecord, chargeType: ChargeType): EvidenceItem {
  const finding: string[] = [];
  const supporting: string[] = [];
  const contradicting: string[] = [];
  const missing: string[] = [];
  const findingsDetail: EvidenceFinding[] = [];
  let state: EvidenceState = 'PASS';
  let decisionImpact = '';

  const prepChecks = {
    polybag: { required: rec.wo_polybag === 'True', actual: rec.polybag_present_sealed },
    suffocation: { required: rec.wo_suffocation_warning === 'True', actual: rec.suffocation_warning },
    label: { actual: rec.fnsku_label_placement },
    barcode: { actual: rec.original_barcode_covered },
    handling: { actual: rec.handling_marks },
  };

  // 1. Polybag Check
  if (prepChecks.polybag.required) {
    if (prepChecks.polybag.actual === 'yes') {
      finding.push('Polybag present and sealed as required.');
      supporting.push('Polybag requirement verified compliant');
      findingsDetail.push({
        id: `fnd-prp-poly-${rec.record_id}`,
        source: 'prep',
        source_record_id: rec.record_id,
        finding: 'Polybag present and sealed.',
        charge_relevance: chargeType === 'inbound_defect_fee' ? 'PARTIALLY_RELEVANT' : 'CONTEXTUAL_ONLY',
        relevance_explanation: 'Confirms secondary packaging compliance. Does not establish absence of pre-existing unit damage.',
        classification: 'SUPPORTS_CLAIM',
        impact: 'MEDIUM',
      });
    } else if (prepChecks.polybag.actual === 'missing' || prepChecks.polybag.actual === 'not_sealed') {
      finding.push(`Polybag defect: ${prepChecks.polybag.actual}`);
      contradicting.push(`Prep defect — polybag: ${prepChecks.polybag.actual}`);
      state = 'FAIL';
      findingsDetail.push({
        id: `fnd-prp-poly-${rec.record_id}`,
        source: 'prep',
        source_record_id: rec.record_id,
        finding: `Polybag defect: ${prepChecks.polybag.actual}`,
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'Missing or unsealed polybag violates prep requirement and justifies inbound defect fee.',
        classification: 'CONTRADICTS_CLAIM',
        impact: 'HIGH',
      });
    } else if (prepChecks.polybag.actual === 'uncertain') {
      finding.push('Polybag condition uncertain.');
      missing.push('Clear polybag verification');
      state = 'UNCERTAIN';
      findingsDetail.push({
        id: `fnd-prp-poly-${rec.record_id}`,
        source: 'prep',
        source_record_id: rec.record_id,
        finding: 'Polybag inspection uncertain.',
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'Uncertain polybag inspection flag cannot confirm compliance.',
        classification: 'UNCERTAIN',
        impact: 'HIGH',
      });
    }
  }

  // 2. Suffocation Warning Check
  if (prepChecks.suffocation.required) {
    if (prepChecks.suffocation.actual === 'missing') {
      finding.push('Required suffocation warning missing.');
      contradicting.push('Missing suffocation warning on polybag');
      state = 'FAIL';
      findingsDetail.push({
        id: `fnd-prp-suff-${rec.record_id}`,
        source: 'prep',
        source_record_id: rec.record_id,
        finding: 'Suffocation warning missing.',
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'Safety warning defect directly justifies inbound defect charge.',
        classification: 'CONTRADICTS_CLAIM',
        impact: 'HIGH',
      });
    } else if (prepChecks.suffocation.actual === 'legible') {
      finding.push('Suffocation warning present and legible.');
      supporting.push('Suffocation warning verified compliant');
      findingsDetail.push({
        id: `fnd-prp-suff-${rec.record_id}`,
        source: 'prep',
        source_record_id: rec.record_id,
        finding: 'Suffocation warning present and legible.',
        charge_relevance: chargeType === 'inbound_defect_fee' ? 'PARTIALLY_RELEVANT' : 'CONTEXTUAL_ONLY',
        relevance_explanation: 'Safety warning verified. Supports packaging compliance.',
        classification: 'SUPPORTS_CLAIM',
        impact: 'MEDIUM',
      });
    } else if (prepChecks.suffocation.actual === 'obscured_by_fold') {
      finding.push('Suffocation warning obscured by fold.');
      state = state === 'FAIL' ? 'FAIL' : 'UNCERTAIN';
      missing.push('Legible suffocation warning view');
      findingsDetail.push({
        id: `fnd-prp-suff-${rec.record_id}`,
        source: 'prep',
        source_record_id: rec.record_id,
        finding: 'Suffocation warning obscured by fold.',
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'Obscured warning violates Amazon safety standards.',
        classification: 'UNCERTAIN',
        impact: 'HIGH',
      });
    }
  }

  // 3. FNSKU Label Check
  if (prepChecks.label.actual === 'missing') {
    finding.push('FNSKU label missing.');
    contradicting.push('Missing FNSKU label at prep');
    state = 'FAIL';
    findingsDetail.push({
      id: `fnd-prp-lbl-${rec.record_id}`,
      source: 'prep',
      source_record_id: rec.record_id,
      finding: 'FNSKU label missing.',
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Missing product identification label directly justifies defect fee.',
      classification: 'CONTRADICTS_CLAIM',
      impact: 'HIGH',
    });
  } else if (prepChecks.label.actual === 'uncertain') {
    finding.push('FNSKU label placement uncertain.');
    missing.push('Clear FNSKU label verification');
    state = state === 'FAIL' ? 'FAIL' : 'UNCERTAIN';
    findingsDetail.push({
      id: `fnd-prp-lbl-${rec.record_id}`,
      source: 'prep',
      source_record_id: rec.record_id,
      finding: 'FNSKU label placement uncertain.',
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Uncertain label placement requires human inspection review.',
      classification: 'UNCERTAIN',
      impact: 'HIGH',
    });
  } else if (prepChecks.label.actual) {
    finding.push(`FNSKU label placed: ${prepChecks.label.actual}`);
    supporting.push(`FNSKU label placement verified: ${prepChecks.label.actual}`);
    findingsDetail.push({
      id: `fnd-prp-lbl-${rec.record_id}`,
      source: 'prep',
      source_record_id: rec.record_id,
      finding: `FNSKU label placed: ${prepChecks.label.actual}`,
      charge_relevance: chargeType === 'inbound_defect_fee' ? 'PARTIALLY_RELEVANT' : 'CONTEXTUAL_ONLY',
      relevance_explanation: 'Verifies FNSKU label was affixed. Supports packaging compliance.',
      classification: 'SUPPORTS_CLAIM',
      impact: 'MEDIUM',
    });
  }

  // 4. Original Barcode Check
  if (prepChecks.barcode.actual === 'no') {
    finding.push('Original manufacturer barcode not covered.');
    contradicting.push('Original barcode exposed (risk of mis-scan at FC)');
    state = 'FAIL';
    findingsDetail.push({
      id: `fnd-prp-bc-${rec.record_id}`,
      source: 'prep',
      source_record_id: rec.record_id,
      finding: 'Original barcode not covered.',
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Uncovered barcode creates scanning errors at fulfillment center.',
      classification: 'CONTRADICTS_CLAIM',
      impact: 'HIGH',
    });
  } else if (prepChecks.barcode.actual === 'uncertain') {
    finding.push('Original barcode coverage uncertain.');
    missing.push('Barcode coverage verification');
    state = state === 'FAIL' ? 'FAIL' : 'UNCERTAIN';
    findingsDetail.push({
      id: `fnd-prp-bc-${rec.record_id}`,
      source: 'prep',
      source_record_id: rec.record_id,
      finding: 'Original barcode coverage uncertain.',
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Uncertain barcode coverage could trigger FC scanning defect.',
      classification: 'UNCERTAIN',
      impact: 'HIGH',
    });
  } else if (prepChecks.barcode.actual === 'yes') {
    finding.push('Original barcode covered.');
    supporting.push('Original barcode properly covered');
    findingsDetail.push({
      id: `fnd-prp-bc-${rec.record_id}`,
      source: 'prep',
      source_record_id: rec.record_id,
      finding: 'Original barcode covered.',
      charge_relevance: chargeType === 'inbound_defect_fee' ? 'PARTIALLY_RELEVANT' : 'CONTEXTUAL_ONLY',
      relevance_explanation: 'Confirms original barcode covered to prevent duplicate scanning.',
      classification: 'SUPPORTS_CLAIM',
      impact: 'MEDIUM',
    });
  }

  // 5. Handling Marks
  if (prepChecks.handling.actual === 'some_missing') {
    finding.push('Some required handling marks missing.');
    contradicting.push('Missing required handling marks');
    findingsDetail.push({
      id: `fnd-prp-hnd-${rec.record_id}`,
      source: 'prep',
      source_record_id: rec.record_id,
      finding: 'Some handling marks missing.',
      charge_relevance: 'PARTIALLY_RELEVANT',
      relevance_explanation: 'Missing handling marks may violate fragile handling protocol.',
      classification: 'CONTRADICTS_CLAIM',
      impact: 'LOW',
    });
  } else if (prepChecks.handling.actual === 'all_present') {
    finding.push('All required handling marks present.');
    supporting.push('All required handling marks verified present');
  }

  if (!decisionImpact) {
    if (state === 'FAIL') {
      decisionImpact = 'Prep non-compliance found — inbound defect fee may be justified.';
    } else if (state === 'UNCERTAIN') {
      decisionImpact = 'Prep inspection flags uncertain — manual review required.';
    } else {
      decisionImpact = 'Packaging compliance verified. Note: prep compliance verifies packaging only, not absence of pre-existing unit damage.';
    }
  }

  return {
    id: `ev-prp-${rec.record_id}`,
    source: 'prep',
    record_id: rec.record_id,
    unit_id: rec.unit_id,
    org_id: rec.org_id,
    timestamp: rec.captured_at,
    state,
    interpretation: finding.join(' '),
    finding: finding.join(' '),
    supporting,
    contradicting,
    missing,
    decision_impact: decisionImpact,
    findings_detail: findingsDetail,
    original: rec,
  };
}

// =============================================================================
// Evidence Interpretation — Pack (Stage 3: Outbound Pack Station)
// =============================================================================
export function interpretPack(rec: PackRecord, chargeType: ChargeType): EvidenceItem {
  const finding: string[] = [];
  const supporting: string[] = [];
  const contradicting: string[] = [];
  const missing: string[] = [];
  const findingsDetail: EvidenceFinding[] = [];
  let state: EvidenceState = 'PASS';

  if (rec.operator_verdict === 'seal') {
    finding.push('Pack station sealed the box — contents matched.');
    supporting.push('Pack station verified box contents and sealed order');
    findingsDetail.push({
      id: `fnd-pck-vdt-${rec.record_id}`,
      source: 'pack',
      source_record_id: rec.record_id,
      finding: 'Pack operator verdict: seal.',
      charge_relevance: chargeType === 'refund_issued_item_not_returned' ? 'DIRECTLY_RELEVANT' : 'CONTEXTUAL_ONLY',
      relevance_explanation: 'Confirms unit was packed and dispatched for outbound delivery.',
      classification: 'SUPPORTS_CLAIM',
      impact: 'MEDIUM',
    });
  } else if (rec.operator_verdict === 'stop_and_fix') {
    finding.push('Pack station flagged issue — stop_and_fix.');
    contradicting.push('Pack verification caught a packing error (stop_and_fix)');
    state = 'FAIL';
    findingsDetail.push({
      id: `fnd-pck-vdt-${rec.record_id}`,
      source: 'pack',
      source_record_id: rec.record_id,
      finding: 'Pack operator flagged stop_and_fix issue.',
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Pack station caught an operational packaging discrepancy.',
      classification: 'CONTRADICTS_CLAIM',
      impact: 'HIGH',
    });
  }

  // Check for content mismatch
  if (rec.order_lines !== rec.observed_in_box) {
    finding.push(`Content discrepancy: ordered [${rec.order_lines}] vs observed [${rec.observed_in_box}]`);
    contradicting.push('Box contents did not match order lines');
    state = 'FAIL';
    findingsDetail.push({
      id: `fnd-pck-cnt-${rec.record_id}`,
      source: 'pack',
      source_record_id: rec.record_id,
      finding: `Content discrepancy: [${rec.order_lines}] vs [${rec.observed_in_box}]`,
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Order contents mismatch violates packing specifications.',
      classification: 'CONTRADICTS_CLAIM',
      impact: 'HIGH',
    });
  }

  const decisionImpact = chargeType === 'refund_issued_item_not_returned'
    ? 'Pack evidence confirms what was shipped — relevant for return verification.'
    : 'Pack evidence provides downstream chain-of-custody context.';

  return {
    id: `ev-pck-${rec.record_id}`,
    source: 'pack',
    record_id: rec.record_id,
    unit_id: rec.unit_id,
    org_id: rec.org_id,
    timestamp: rec.captured_at,
    state,
    interpretation: finding.join(' '),
    finding: finding.join(' '),
    supporting,
    contradicting,
    missing,
    decision_impact: decisionImpact,
    findings_detail: findingsDetail,
    original: rec,
  };
}

// =============================================================================
// Evidence Interpretation — Returns (Stage 4: Reverse Logistics Intake)
// =============================================================================
export function interpretReturns(rec: ReturnsRecord, chargeType: ChargeType): EvidenceItem {
  const finding: string[] = [];
  const supporting: string[] = [];
  const contradicting: string[] = [];
  const missing: string[] = [];
  const findingsDetail: EvidenceFinding[] = [];
  let state: EvidenceState = 'PASS';
  let decisionImpact = '';

  // 1. Identity match
  if (rec.identity_match === 'yes') {
    finding.push('Returned item identity confirmed.');
    supporting.push('Return intake confirmed item identity match');
    findingsDetail.push({
      id: `fnd-rtn-id-${rec.record_id}`,
      source: 'returns',
      source_record_id: rec.record_id,
      finding: 'Returned item identity confirmed.',
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Physical proof that the customer returned the exact item.',
      classification: 'SUPPORTS_CLAIM',
      impact: 'HIGH',
    });
  } else {
    finding.push(`Identity match issue: ${rec.identity_match}`);
    contradicting.push(`Identity mismatch on return: ${rec.identity_match}`);
    state = 'FAIL';
    findingsDetail.push({
      id: `fnd-rtn-id-${rec.record_id}`,
      source: 'returns',
      source_record_id: rec.record_id,
      finding: `Return identity mismatch: ${rec.identity_match}`,
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Item returned does not match customer order.',
      classification: 'CONTRADICTS_CLAIM',
      impact: 'HIGH',
    });
  }

  // 2. Observed state
  if (rec.observed_state) {
    finding.push(`Return condition: ${rec.observed_state}`);
    if (rec.observed_state === 'damaged') {
      supporting.push('Item returned in damaged condition');
      findingsDetail.push({
        id: `fnd-rtn-st-${rec.record_id}`,
        source: 'returns',
        source_record_id: rec.record_id,
        finding: 'Item returned in damaged condition.',
        charge_relevance: 'PARTIALLY_RELEVANT',
        relevance_explanation: 'Damage observed upon customer return.',
        classification: 'SUPPORTS_CLAIM',
        impact: 'MEDIUM',
      });
    } else if (rec.observed_state === 'factory_sealed') {
      supporting.push('Item returned factory sealed');
      findingsDetail.push({
        id: `fnd-rtn-st-${rec.record_id}`,
        source: 'returns',
        source_record_id: rec.record_id,
        finding: 'Item returned factory sealed.',
        charge_relevance: 'DIRECTLY_RELEVANT',
        relevance_explanation: 'Item returned in new, unopened state.',
        classification: 'SUPPORTS_CLAIM',
        impact: 'HIGH',
      });
    } else if (rec.observed_state === 'signs_of_use') {
      supporting.push('Signs of use on returned item');
    } else if (rec.observed_state === 'opened_unused') {
      finding.push('Item opened but unused.');
    }
  }

  // 3. Parts missing
  if (rec.parts_missing) {
    finding.push(`Missing parts: ${rec.parts_missing}`);
    contradicting.push(`Customer returned item with missing parts: ${rec.parts_missing}`);
    findingsDetail.push({
      id: `fnd-rtn-pm-${rec.record_id}`,
      source: 'returns',
      source_record_id: rec.record_id,
      finding: `Parts missing on return: ${rec.parts_missing}`,
      charge_relevance: 'DIRECTLY_RELEVANT',
      relevance_explanation: 'Customer did not return complete product.',
      classification: 'CONTRADICTS_CLAIM',
      impact: 'MEDIUM',
    });
  }

  // 4. Operator disposition
  if (rec.operator_disposition) {
    finding.push(`Disposition: ${rec.operator_disposition}`);
    if (rec.operator_disposition === 'pending_review') {
      state = 'UNCERTAIN';
      missing.push('Final disposition pending review');
      findingsDetail.push({
        id: `fnd-rtn-disp-${rec.record_id}`,
        source: 'returns',
        source_record_id: rec.record_id,
        finding: 'Disposition status: pending_review.',
        charge_relevance: 'PARTIALLY_RELEVANT',
        relevance_explanation: 'Return disposition is not yet finalized.',
        classification: 'UNCERTAIN',
        impact: 'MEDIUM',
      });
    }
  }

  if (!decisionImpact) {
    if (chargeType === 'refund_issued_item_not_returned') {
      decisionImpact = 'Return record exists — item was returned, directly contradicting the charge.';
    } else {
      decisionImpact = 'Return evidence provides unit condition context.';
    }
  }

  return {
    id: `ev-rtn-${rec.record_id}`,
    source: 'returns',
    record_id: rec.record_id,
    unit_id: rec.unit_id,
    org_id: rec.org_id,
    timestamp: rec.captured_at,
    state,
    interpretation: finding.join(' '),
    finding: finding.join(' '),
    supporting,
    contradicting,
    missing,
    decision_impact: decisionImpact,
    findings_detail: findingsDetail,
    original: rec,
  };
}

// =============================================================================
// Evidence Retrieval — Get all evidence for a unit
// =============================================================================
export function getEvidenceForUnit(
  unitId: string,
  chargeType: ChargeType,
  upstreamData: {
    receiving: ReceivingRecord[];
    prep: PrepRecord[];
    pack: PackRecord[];
    returns: ReturnsRecord[];
  }
): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  const rcvRecords = upstreamData.receiving.filter(r => r.unit_id === unitId);
  for (const r of rcvRecords) {
    evidence.push(interpretReceiving(r, chargeType));
  }

  const prpRecords = upstreamData.prep.filter(r => r.unit_id === unitId);
  for (const r of prpRecords) {
    evidence.push(interpretPrep(r, chargeType));
  }

  const pckRecords = upstreamData.pack.filter(r => r.unit_id === unitId);
  for (const r of pckRecords) {
    evidence.push(interpretPack(r, chargeType));
  }

  const rtnRecords = upstreamData.returns.filter(r => r.unit_id === unitId);
  for (const r of rtnRecords) {
    evidence.push(interpretReturns(r, chargeType));
  }

  // Sort by timestamp
  evidence.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return evidence;
}
