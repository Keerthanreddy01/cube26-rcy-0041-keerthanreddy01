// =============================================================================
// RECOVER — Data Loader
// Loads and parses CSV datasets from disk using resolveDataPath
// =============================================================================
import fs from 'fs';
import Papa from 'papaparse';
import { resolveDataPath } from './data-path';
import type {
  ChargeRecord, ReceivingRecord, PrepRecord, PackRecord, ReturnsRecord
} from './types';

export async function loadFeeReport(): Promise<ChargeRecord[]> {
  const filePath = resolveDataPath('fee_report_sample.csv');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fee report not found at: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf-8');
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return (result.data as Record<string, string>[]).map((row) => ({
    line_id: row.line_id || '',
    report_type: (row.report_type || 'fee_report') as ChargeRecord['report_type'],
    unit_id: row.unit_id || '',
    org_id: row.org_id || '',
    sku: row.sku || '',
    fnsku: row.fnsku || '',
    fba_shipment_id: row.fba_shipment_id || '',
    order_id: row.order_id || '',
    charge_type: (row.charge_type || 'inbound_defect_fee') as ChargeRecord['charge_type'],
    quantity: Number(row.quantity) || 1,
    amount_usd: Number(row.amount_usd) || 0,
    posted_date: row.posted_date || '',
  }));
}

export async function loadUpstreamData(): Promise<{
  receiving: ReceivingRecord[];
  prep: PrepRecord[];
  pack: PackRecord[];
  returns: ReturnsRecord[];
}> {
  // Receiving
  const rcvPath = resolveDataPath('upstream', 'receiving_sample.csv');
  const rcvText = fs.existsSync(rcvPath) ? fs.readFileSync(rcvPath, 'utf-8') : '';
  const rcvResult = Papa.parse(rcvText, { header: true, skipEmptyLines: true });
  const receiving: ReceivingRecord[] = (rcvResult.data as Record<string, string>[]).map((row) => ({
    record_id: row.record_id || '',
    unit_id: row.unit_id || '',
    org_id: row.org_id || '',
    po_number: row.po_number || '',
    po_line: row.po_line || '',
    supplier: row.supplier || '',
    sku: row.sku || '',
    asin: row.asin || '',
    product_title: row.product_title || '',
    spec_colour: row.spec_colour || '',
    spec_variant: row.spec_variant || '',
    spec_components: row.spec_components || '',
    cartons_ordered: Number(row.cartons_ordered) || 0,
    cartons_received: Number(row.cartons_received) || 0,
    units_per_carton_ordered: Number(row.units_per_carton_ordered) || 0,
    units_per_carton_counted: Number(row.units_per_carton_counted) || 0,
    qty_ordered: Number(row.qty_ordered) || 0,
    qty_received: Number(row.qty_received) || 0,
    identity_match: row.identity_match || '',
    carton_damage: row.carton_damage || '',
    unit_damage: row.unit_damage || '',
    quality_flags: row.quality_flags || '',
    photo_refs: row.photo_refs || '',
    operator_id: row.operator_id || '',
    captured_at: row.captured_at || '',
  }));

  // Prep
  const prepPath = resolveDataPath('upstream', 'prep_sample.csv');
  const prepText = fs.existsSync(prepPath) ? fs.readFileSync(prepPath, 'utf-8') : '';
  const prepResult = Papa.parse(prepText, { header: true, skipEmptyLines: true });
  const prep: PrepRecord[] = (prepResult.data as Record<string, string>[]).map((row) => ({
    record_id: row.record_id || '',
    unit_id: row.unit_id || '',
    org_id: row.org_id || '',
    work_order_id: row.work_order_id || '',
    fba_shipment_id: row.fba_shipment_id || '',
    sku: row.sku || '',
    asin: row.asin || '',
    fnsku: row.fnsku || '',
    prep_price_usd: Number(row.prep_price_usd) || 0,
    wo_polybag: row.wo_polybag || '',
    wo_suffocation_warning: row.wo_suffocation_warning || '',
    wo_expiry_date: row.wo_expiry_date || '',
    wo_handling_marks: row.wo_handling_marks || '',
    polybag_present_sealed: row.polybag_present_sealed || '',
    suffocation_warning: row.suffocation_warning || '',
    fnsku_label_placement: row.fnsku_label_placement || '',
    original_barcode_covered: row.original_barcode_covered || '',
    expiry_date: row.expiry_date || '',
    handling_marks: row.handling_marks || '',
    photo_refs: row.photo_refs || '',
    operator_id: row.operator_id || '',
    captured_at: row.captured_at || '',
  }));

  // Pack
  const packPath = resolveDataPath('upstream', 'pack_sample.csv');
  const packText = fs.existsSync(packPath) ? fs.readFileSync(packPath, 'utf-8') : '';
  const packResult = Papa.parse(packText, { header: true, skipEmptyLines: true });
  const pack: PackRecord[] = (packResult.data as Record<string, string>[]).map((row) => ({
    record_id: row.record_id || '',
    unit_id: row.unit_id || '',
    org_id: row.org_id || '',
    order_id: row.order_id || '',
    channel: row.channel || '',
    order_lines: row.order_lines || '',
    observed_in_box: row.observed_in_box || '',
    operator_verdict: row.operator_verdict || '',
    photo_refs: row.photo_refs || '',
    operator_id: row.operator_id || '',
    captured_at: row.captured_at || '',
  }));

  // Returns
  const rtnPath = resolveDataPath('upstream', 'returns_sample.csv');
  const rtnText = fs.existsSync(rtnPath) ? fs.readFileSync(rtnPath, 'utf-8') : '';
  const rtnResult = Papa.parse(rtnText, { header: true, skipEmptyLines: true });
  const returns: ReturnsRecord[] = (rtnResult.data as Record<string, string>[]).map((row) => ({
    record_id: row.record_id || '',
    unit_id: row.unit_id || '',
    org_id: row.org_id || '',
    order_id: row.order_id || '',
    ordered_sku: row.ordered_sku || '',
    ordered_asin: row.ordered_asin || '',
    identity_match: row.identity_match || '',
    parts_list: row.parts_list || '',
    parts_missing: row.parts_missing || '',
    observed_state: row.observed_state || '',
    amazon_condition: row.amazon_condition || '',
    operator_disposition: row.operator_disposition || '',
    photo_refs: row.photo_refs || '',
    operator_id: row.operator_id || '',
    captured_at: row.captured_at || '',
  }));

  return { receiving, prep, pack, returns };
}
