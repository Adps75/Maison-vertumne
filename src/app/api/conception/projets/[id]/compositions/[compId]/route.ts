import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

const schemaCorps = z.object({ graine: z.number().int().min(0).max(2_147_483_647) });

/** Enregistre la graine de la proposition gardée. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; compId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { id, compId } = await params;
    const corps = schemaCorps.safeParse(await request.json().catch(() => null));
    if (!corps.success) return NextResponse.json({ ok: false, error: "Graine invalide." }, { status: 400 });
    const { error } = await supabase
      .from("conception_compositions")
      .update({ graine: corps.data.graine })
      .eq("id", compId)
      .eq("projet_id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
