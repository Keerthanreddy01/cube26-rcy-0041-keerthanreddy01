// =============================================================================
// RECOVER — CSV Parser & Charge Ingestion Engine
// =============================================================================
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import type { ChargeRecord, ImportBatch, ImportError } from './types';

const REQUIRED_COLUMNS = [
  'line_id', 'report_type', 'unit_id', 'org_id', 'sku', 'fnsku',
  'fba_shipment_id', 'order_id', 'charge_type', 'quantity', 'amount_usd', 'posted_date'
];

const VALID_REPORT_TYPES = ['fee_report', 'inventory_adjustment', 'reimbursement_report'];
const VALID_CHARGE_TYPES = [
  'inbound_defect_fee', 'lost_inbound', 'damaged_in_warehouse',
  'fulfilment_fee_weight_tier', 'refund_issued_item_not_returned'
];

export function parseCSV(csvText: string): Papa.ParseResult<Record<string, string>> {
  return Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });
}

export function validateColumns(headers: string[]): string[] {
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter(col => !normalizedHeaders.includes(col));
  return missing;
}

export function parseChargeRow(
  row: Record<string, string>,
  rowIndex: number,
  importId: string
): { charge?: ChargeRecord; errors: string[] } {
  const errors: string[] = [];

  const line_id = (row['line_id'] || '').trim();
  if (!line_id) errors.push('Missing line_id');

  const unit_id = (row['unit_id'] || '').trim();
  if (!unit_id) errors.push('Missing unit_id');

  const charge_type = (row['charge_type'] || '').trim();
  if (!charge_type) errors.push('Missing charge_type');

  const report_type = (row['report_type'] || '').trim();
  if (report_type && !VALID_REPORT_TYPES.includes(report_type)) {
    errors.push(`Unknown report_type: ${report_type}`);
  }

  const quantity = parseInt(row['quantity'] || '0', 10);
  if (isNaN(quantity)) errors.push('Invalid quantity');

  const amount_usd = parseFloat(row['amount_usd'] || '0');
  if (isNaN(amount_usd)) errors.push('Invalid amount_usd');

  const posted_date = (row['posted_date'] || '').trim();
  if (posted_date && !/^\d{4}-\d{2}-\d{2}/.test(posted_date)) {
    errors.push(`Invalid posted_date format: ${posted_date}`);
  }

  if (errors.length > 0 && !line_id && !unit_id) {
    return { errors };
  }

  const charge: ChargeRecord = {
    line_id: line_id || `UNKNOWN-${rowIndex}`,
    report_type: report_type || 'unknown',
    unit_id,
    org_id: (row['org_id'] || '').trim(),
    sku: (row['sku'] || '').trim(),
    fnsku: (row['fnsku'] || '').trim(),
    fba_shipment_id: (row['fba_shipment_id'] || '').trim(),
    order_id: (row['order_id'] || '').trim(),
    charge_type,
    quantity: isNaN(quantity) ? 0 : quantity,
    amount_usd: isNaN(amount_usd) ? 0 : amount_usd,
    posted_date,
    _importId: importId,
    _importedAt: new Date().toISOString(),
    _rowIndex: rowIndex,
    _parseErrors: errors.length > 0 ? errors : undefined,
  };

  return { charge, errors };
}

export function detectDuplicates(
  newCharges: ChargeRecord[],
  existingCharges: ChargeRecord[]
): { unique: ChargeRecord[]; duplicates: ChargeRecord[] } {
  const existingIds = new Set(existingCharges.map(c => c.line_id));
  const unique: ChargeRecord[] = [];
  const duplicates: ChargeRecord[] = [];

  for (const charge of newCharges) {
    if (existingIds.has(charge.line_id)) {
      duplicates.push(charge);
    } else {
      existingIds.add(charge.line_id);
      unique.push(charge);
    }
  }

  return { unique, duplicates };
}

export function ingestFeeReport(
  csvText: string,
  filename: string,
  existingCharges: ChargeRecord[] = []
): ImportBatch {
  const importId = uuidv4();
  const result = parseCSV(csvText);
  const errors: ImportError[] = [];
  const charges: ChargeRecord[] = [];

  // Check for parse-level errors
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      errors.push({
        row: err.row ?? -1,
        error: `CSV parse error: ${err.message}`,
        raw_data: JSON.stringify(err),
      });
    }
  }

  // Validate columns
  if (result.meta.fields) {
    const missingCols = validateColumns(result.meta.fields);
    if (missingCols.length > 0) {
      errors.push({
        row: 0,
        error: `Missing required columns: ${missingCols.join(', ')}`,
        raw_data: '',
      });
    }
  }

  // Parse each row
  for (let i = 0; i < result.data.length; i++) {
    const { charge, errors: rowErrors } = parseChargeRow(result.data[i], i + 1, importId);
    if (rowErrors.length > 0) {
      errors.push({
        row: i + 1,
        error: rowErrors.join('; '),
        raw_data: JSON.stringify(result.data[i]),
      });
    }
    if (charge) {
      charges.push(charge);
    }
  }

  // Detect duplicates
  const { unique, duplicates } = detectDuplicates(charges, existingCharges);

  const totalAmount = unique.reduce((sum, c) => sum + c.amount_usd, 0);

  return {
    id: importId,
    filename,
    imported_at: new Date().toISOString(),
    total_rows: result.data.length,
    parsed_rows: unique.length,
    failed_rows: errors.length,
    duplicate_rows: duplicates.length,
    total_amount: totalAmount,
    charges: unique,
    errors,
  };
}
