import { createHash } from "node:crypto";
import type { Entry } from "../../src/domain/model";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ProjectService } from "../../src/application/projects";
import { jsonResource } from "../../src/providers/json";
import { d1Fixture } from "./fixture";
let fixture: Awaited<ReturnType<typeof d1Fixture>>, service: ProjectService;
beforeEach(async () => {
  fixture = await d1Fixture();
  service = new ProjectService(
    fixture.repository,
    jsonResource,
    () => "2026-09-25T10:00:00.000Z",
  );
  await service.create({
    id: "large",
    name: "Large",
    baseLanguage: "en",
    targetLanguages: ["fr"],
  });
});
afterEach(async () => {
  await fixture?.close();
});
it("updates one translation without rewriting the other 4,999 entries", async () => {
  const data = Object.fromEntries(
    Array.from({ length: 5000 }, (_, i) => [`key${i}`, `Value ${i}`]),
  );
  const project = await service.import("large", JSON.stringify(data));
  await service.translate("large", project.entries[0].id, "fr", "Initial");
  await fixture.execute("CREATE TABLE translation_writes (kind TEXT)");
  for (const kind of ["INSERT", "UPDATE", "DELETE"])
    await fixture.execute(
      `CREATE TRIGGER count_${kind} AFTER ${kind} ON translations BEGIN INSERT INTO translation_writes VALUES ('${kind}'); END`,
    );
  await service.translate("large", project.entries[0].id, "fr", "Traduction");
  expect(await fixture.query("SELECT kind FROM translation_writes")).toEqual([
    { kind: "UPDATE" },
  ]);
  expect((await service.get("large")).entries).toHaveLength(5000);
});
it("chunks multi-megabyte Unicode checkpoints and restores them exactly", async () => {
  const value = "😀".repeat(9000);
  const data = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`key${i}`, value]),
  );
  let project = await service.get("large");
  for (const language of ["en", "fr", "ar", "de"])
    project = (
      await service.applyImport(
        "large",
        [
          {
            name: `${language}.json`,
            language,
            confirmed: true,
            text: JSON.stringify(data),
          },
        ],
        "keepExisting",
        project.version,
      )
    ).project;
  const revision = (await fixture.repository.revisions("large"))[0];
  expect(
    new TextEncoder().encode(JSON.stringify(project)).length,
  ).toBeGreaterThan(2_000_000);
  const snapshot = (await fixture.repository.revision("large", revision.id))!;
  for (const entry of snapshot.entries)
    entry.translations.sort((a, b) => a.language.localeCompare(b.language));
  expect(digestEntries(snapshot.entries)).toEqual(
    digestEntries(project.entries),
  );
  expect({ ...snapshot, entries: [] }).toEqual({ ...project, entries: [] });
  await service.translate("large", project.entries[0].id, "fr", "Changed");
  const restored = await service.restore(
    "large",
    revision.id,
    (await service.get("large")).version,
  );
  expect(digestEntries(restored.entries)).toEqual(
    digestEntries(project.entries),
  );
  const sizes = await fixture.query<{ size: number }>(
    "SELECT MAX(length(CAST(text AS BLOB))) AS size FROM revision_chunks",
  );
  expect(sizes[0].size).toBeLessThan(2_000_000);
});

function digestEntries(entries: Entry[]) {
  return entries
    .map((entry) => ({
      ...entry,
      translations: entry.translations
        .map((value) => ({
          ...value,
          value: createHash("sha256").update(value.value).digest("hex"),
        }))
        .sort((a, b) => a.language.localeCompare(b.language)),
    }))
    .sort((a, b) => a.id - b.id);
}
