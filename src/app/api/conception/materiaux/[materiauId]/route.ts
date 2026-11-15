import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerAdmin, ErreurNonAutorise } from "@/lib/auth/admin";

const schemaMaj = z.object({ prix_unitaire: z.number().min(0).max(100000).nullable() });

/** Prix unitaire d'un matériau (facultatif, HT). */
export async function PATCH(request: Request, { params }: { params: Promise<{ materiauId: string }> }) {
  try {
    const { supabase } = await exigerAdmin("api");
    const { materiauId } = await params;
    const corps = schemaMaj.safeParse(await request.json().catch(() => null));
    if (!corps.success) return NextResponse.json({ ok: false, error: "Prix invalide." }, { status: 400 });
    const { error } = await supabase.from("materiaux").update({ prix_unitaire: corps.data.prix_unitaire }).eq("id", materiauId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErreurNonAutorise) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
