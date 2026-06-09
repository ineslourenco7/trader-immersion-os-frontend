import { NextResponse } from 'next/server';

export async function GET() {
  const data = {
    status: "ok",
    version: "1.0.0",
    environment: "production",
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(data);
}