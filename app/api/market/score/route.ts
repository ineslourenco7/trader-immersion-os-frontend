import { NextResponse } from 'next/server';

export async function GET() {
  const data = {
    asset: "XAU/USD",
    score: 82,
    metrics: {
      trade_count: 128,
      win_rate: 0.65,
      total_pnl_pct: 2.35,
    },
    updated_at: new Date().toISOString(),
  };
  return NextResponse.json(data);
}