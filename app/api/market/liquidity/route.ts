import { NextResponse } from 'next/server';

export async function GET() {
  const data = {
    zones: [
      { id: "btc-above", asset: "BTCUSD", level: 68250, direction: "Acima", type: "smart-money" },
      { id: "btc-below", asset: "BTCUSD", level: 66800, direction: "Abaixo", type: "retail" },
    ],
    manipulation_radar: {
      asset: "BTCUSD",
      probability: "elevada",
      event: "stop hunt",
    },
    updated_at: new Date().toISOString(),
  };
  return NextResponse.json(data);
}