import { NextResponse } from 'next/server';
import fs from 'fs';
import Papa from 'papaparse';
import { resolveDataPath } from '@/lib/data-path';

export async function GET() {
  try {
    const csvPath = resolveDataPath('upstream', 'prep_sample.csv');
    if (!fs.existsSync(csvPath)) {
      console.error('Prep CSV not found at:', csvPath);
      return NextResponse.json({ error: 'Prep CSV not found' }, { status: 404 });
    }
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    const records = (result.data as Record<string, string>[]).map((row) => ({
      ...row,
      prep_price_usd: Number(row.prep_price_usd) || 0,
    }));

    return NextResponse.json(records);
  } catch (error) {
    console.error('Error loading prep data:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
