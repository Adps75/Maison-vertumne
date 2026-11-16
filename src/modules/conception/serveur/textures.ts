import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "conception";

/** Dépose la texture (nouveau chemin à chaque remplacement : le cache du navigateur suit). */
export async function enregistrerTexture(supabase: SupabaseClient, materiauId: string, jpeg: Buffer) {
  const { data: m } = await supabase.from("materiaux").select("texture_path").eq("id", materiauId).single();
  const path = `materiaux/${materiauId}/texture-${crypto.randomUUID().slice(0, 8)}.jpg`;
  const { error: e1 } = await supabase.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
  if (e1) return NextResponse.json({ ok: false, error: `Enregistrement impossible : ${e1.message}` }, { status: 500 });
  const { error: e2 } = await supabase.from("materiaux").update({ texture_path: path }).eq("id", materiauId);
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
  if (m?.texture_path) await supabase.storage.from(BUCKET).remove([m.texture_path]);
  return NextResponse.json({ ok: true, texture_path: path });
}
