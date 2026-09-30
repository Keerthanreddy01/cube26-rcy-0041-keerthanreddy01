import { NextResponse } from 'next/server';
import fs from 'fs';
import Papa from 'papaparse';
import { resolveDataPath } from '@/lib/data-path';

export async function GET() {
  try {
    const csvPath = resolveDataPath('upstream', 'returns_sample.csv');
    if (!fs.existsSync(csvPath)) {
      console.error('Returns CSV not found at:', csvPath);
      return NextResponse.json({ error: 'Returns CSV not found' }, { status: 404 });
    }
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error loading returns data:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
