import { NextResponse } from 'next/server';
import fs from 'fs';
import Papa from 'papaparse';
import { resolveDataPath } from '@/lib/data-path';

export async function GET() {
  try {
    const csvPath = resolveDataPath('upstream', 'receiving_sample.csv');
    if (!fs.existsSync(csvPath)) {
      console.error('Receiving CSV not found at:', csvPath);
      return NextResponse.json({ error: 'Receiving CSV not found' }, { status: 404 });
    }
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    const records = (result.data as Record<string, string>[]).map((row) => ({
      ...row,
      cartons_ordered: Number(row.cartons_ordered) || 0,
      cartons_received: Number(row.cartons_received) || 0,
      units_per_carton_ordered: Number(row.units_per_carton_ordered) || 0,
      units_per_carton_counted: Number(row.units_per_carton_counted) || 0,
      qty_ordered: Number(row.qty_ordered) || 0,
      qty_received: Number(row.qty_received) || 0,
    }));

    return NextResponse.json(records);
  } catch (error) {
    console.error('Error loading receiving data:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
