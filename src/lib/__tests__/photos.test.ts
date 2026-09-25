import { describe, it, expect } from "vitest";
import { cheminAppartientAuLead } from "../validation/photos";

const LEAD_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const PHOTO_UUID = "11223344-5566-7788-99aa-bbccddeeff00";

describe("cheminAppartientAuLead", () => {
  it("accepte un chemin valide", () => {
    expect(
      cheminAppartientAuLead(`leads/${LEAD_ID}/${PHOTO_UUID}.jpg`, LEAD_ID),
    ).toBe(true);
  });

  it("refuse un lead différent", () => {
    const autreLead = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    expect(
      cheminAppartientAuLead(`leads/${LEAD_ID}/${PHOTO_UUID}.jpg`, autreLead),
    ).toBe(false);
  });

  it("refuse un chemin avec '..'", () => {
    expect(
      cheminAppartientAuLead(`leads/${LEAD_ID}/../${PHOTO_UUID}.jpg`, LEAD_ID),
    ).toBe(false);
  });

  it("refuse une extension différente", () => {
    expect(
      cheminAppartientAuLead(`leads/${LEAD_ID}/${PHOTO_UUID}.png`, LEAD_ID),
    ).toBe(false);
  });

  it("refuse un segment supplémentaire", () => {
    expect(
      cheminAppartientAuLead(
        `leads/${LEAD_ID}/sous-dossier/${PHOTO_UUID}.jpg`,
        LEAD_ID,
      ),
    ).toBe(false);
  });

  it("refuse un chemin sans préfixe leads/", () => {
    expect(
      cheminAppartientAuLead(`autre/${LEAD_ID}/${PHOTO_UUID}.jpg`, LEAD_ID),
    ).toBe(false);
  });

  it("refuse un UUID mal formé", () => {
    expect(
      cheminAppartientAuLead(`leads/${LEAD_ID}/not-a-uuid.jpg`, LEAD_ID),
    ).toBe(false);
  });
});
