// 기계가 읽는 명세. 카탈로그에서 생성되므로 툴을 추가하면 자동으로 따라온다.
import { NextResponse } from "next/server";
import { openapi } from "@/lib/x402/catalog";

export const runtime = "nodejs";
export const revalidate = 300;

export function GET() {
  return NextResponse.json(openapi(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
