import { createPrompt } from "@/lib/workspace/mutations";
import { loadWorkspace } from "@/lib/workspace/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const workspace = await loadWorkspace();
  return Response.json({ items: workspace.prompts });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ errors: ["invalid JSON body"] }, { status: 400 });
  }

  const result = await createPrompt(body);
  return result.ok
    ? Response.json({ item: result.value })
    : Response.json({ errors: result.errors }, { status: result.status });
}
