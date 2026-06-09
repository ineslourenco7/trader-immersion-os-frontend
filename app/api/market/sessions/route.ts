import { NextResponse } from 'next/server';

export async function GET() {
  const data = {
    active_session: {
      id: "sess-123",
      started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      asset: "XAU/USD",
      status: "in_progress",
      risk_level: "medium",
    },
    recent_sessions: [
      { id: "sess-122", ended_at: new Date(Date.now() - 7200000).toISOString(), result: "profit", pnl_pct: 0.85 },
      { id: "sess-121", ended_at: new Date(Date.now() - 10800000).toISOString(), result: "loss", pnl_pct: -0.20 },
    ],
    updated_at: new Date().toISOString(),
  };
  return NextResponse.json(data);
}