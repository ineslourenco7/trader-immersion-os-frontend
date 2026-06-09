import { NextResponse } from 'next/server';

export async function GET() {
  const data = {
    verdict: "wait",
    market: "XAU/USD",
    regime: "Tendência controlada",
    regime_confidence: 0.74,
    engine_live: true,
    trades_count: 1000,
    win_rate: 0.535,
    guidance: "A maioria das perdas vem de trading em excesso. Usa a nota como filtro, não como entrada.",
    updated_at: new Date().toISOString(),
  };
  return NextResponse.json(data);
}