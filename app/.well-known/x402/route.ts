// 에이전트용 발견 매니페스트. 살아 있는 x402 서비스가 공통으로 두는 경로다.
import { NextResponse } from "next/server";
import { manifest } from "@/lib/x402/catalog";

export const runtime = "nodejs";
export const revalidate = 300;

export function GET() {
  return NextResponse.json(manifest(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
