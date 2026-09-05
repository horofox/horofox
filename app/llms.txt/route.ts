// 모델이 읽는 설명서. 사람용 README 와 달리 "왜 돈을 낼 만한가"를 앞에 둔다.
import { llmsTxt } from "@/lib/x402/catalog";

export const runtime = "nodejs";
export const revalidate = 300;

export function GET() {
  return new Response(llmsTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
