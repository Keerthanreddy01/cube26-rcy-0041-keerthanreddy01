import { NextResponse } from 'next/server';
import fs from 'fs';
import { resolveDataPath } from '@/lib/data-path';

export async function GET() {
  try {
    const csvPath = resolveDataPath('fee_report_sample.csv');
    if (!fs.existsSync(csvPath)) {
      console.error('Fee report CSV not found at:', csvPath);
      return new NextResponse('Fee report CSV not found', { status: 404 });
    }
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    return new NextResponse(csvText, {
      headers: { 'Content-Type': 'text/csv' },
    });
  } catch (error) {
    console.error('Error loading fee report:', error);
    return new NextResponse('Error loading fee report', { status: 500 });
  }
}
