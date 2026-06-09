import { NextResponse } from 'next/server';

export async function GET() {
  const data = {
    asset: "BTCUSD",
    sentiment_score: 0.65, // 0-1, onde 0.5 é neutro
    bullish_percentage: 0.56,
    bearish_percentage: 0.44,
    average_profit: 1.82,
    average_loss: -1.35,
    trends: [
      { type: "long", strength: "forte", count: 120 },
      { type: "short", strength: "moderado", count: 80 },
    ],
    updated_at: new Date().toISOString(),
  };
  return NextResponse.json(data);
}