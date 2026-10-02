import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only et le secret
vi.mock("server-only", () => ({}));

const SECRET = "test-secret-32-bytes-hex-value-ab";

beforeEach(() => {
  vi.stubEnv("SECRET_LIENS", SECRET);
});

import { genererLienDiagnostic, verifierLienDiagnostic } from "../lien-signe";

describe("lien signé", () => {
  const leadId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const baseUrl = "https://atelierdespres.fr";

  it("génère un lien valide et le vérifie", () => {
    const lien = genererLienDiagnostic(leadId, baseUrl);
    const url = new URL(lien);

    const l = url.searchParams.get("l")!;
    const e = url.searchParams.get("e")!;
    const s = url.searchParams.get("s")!;

    expect(verifierLienDiagnostic(l, e, s)).toBe(leadId);
  });

  it("refuse une signature modifiée", () => {
    const lien = genererLienDiagnostic(leadId, baseUrl);
    const url = new URL(lien);

    const l = url.searchParams.get("l")!;
    const e = url.searchParams.get("e")!;
    const s = url.searchParams.get("s")!;

    expect(verifierLienDiagnostic(l, e, s + "x")).toBeNull();
  });

  it("refuse un lien expiré", () => {
    const lien = genererLienDiagnostic(leadId, baseUrl);
    const url = new URL(lien);

    const l = url.searchParams.get("l")!;
    const s = url.searchParams.get("s")!;

    // Expiration dans le passé
    expect(verifierLienDiagnostic(l, "1000000000", s)).toBeNull();
  });

  it("refuse un leadId modifié", () => {
    const lien = genererLienDiagnostic(leadId, baseUrl);
    const url = new URL(lien);

    const e = url.searchParams.get("e")!;
    const s = url.searchParams.get("s")!;

    expect(verifierLienDiagnostic("autre-id", e, s)).toBeNull();
  });
});
