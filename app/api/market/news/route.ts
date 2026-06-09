import { NextResponse } from 'next/server';

export async function GET() {
  const data = {
    items: [
      { id: "cpi-mom", event: "CPI/m (MoM)", impact: "ALTO", time: "14:30", date: "2026-06-09" },
      { id: "fed-powell", event: "Fed Chair Powell", impact: "ALTO", time: "19:00", date: "2026-06-09" },
      { id: "gdp-qoq", event: "GDP (QoQ)", impact: "MÉDIO", time: "08:30", date: "2026-06-10" },
    ],
    updated_at: new Date().toISOString(),
  };
  return NextResponse.json(data);
}