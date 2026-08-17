import { updatePrompt, deletePrompt } from "@/lib/workspace/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ errors: ["invalid JSON body"] }, { status: 400 });
  }

  const result = await updatePrompt(id, body);
  return result.ok
    ? Response.json({ item: result.value })
    : Response.json({ errors: result.errors }, { status: result.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const result = await deletePrompt(id);
  return result.ok
    ? Response.json({ ok: true })
    : Response.json({ errors: result.errors }, { status: result.status });
}
