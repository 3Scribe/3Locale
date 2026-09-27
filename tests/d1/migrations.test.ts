import { expect, it } from "vitest";
import { d1Fixture } from "./fixture";
import { ProjectService } from "../../src/application/projects";
import { jsonResource } from "../../src/providers/json";
it("preserves projects, provenance and full history while adding unclaimed owner storage", async () => {
  const f = await d1Fixture(2);
  try {
    const service = new ProjectService(f.repository, jsonResource);
    const project = await service.create({
      id: crypto.randomUUID(),
      name: "Existing",
      baseLanguage: "en",
      targetLanguages: ["fr"],
    });
    await service.import(project.id, '{"hello":"Hello"}');
    const tables = [
      "projects",
      "project_languages",
      "resource_entries",
      "translations",
      "audit_events",
      "revisions",
      "revision_chunks",
    ];
    const before = await Promise.all(
      tables.map((table) => f.query(`SELECT * FROM ${table}`)),
    );
    await f.applyMigration("0003_community_security.sql");
    expect(
      await Promise.all(
        tables.map((table) => f.query(`SELECT * FROM ${table}`)),
      ),
    ).toEqual(before);
    expect(await f.security.owner()).toBeUndefined();
    expect((await service.get(project.id)).entries).toHaveLength(1);
  } finally {
    await f.close();
  }
});
it("upgrades baseline D1 provenance without changing historical translations", async () => {
  const fixture = await d1Fixture(1);
  try {
    // The base-language foreign key is deferred to the end of a batch.
    await fixture.execute(
      "CREATE TRIGGER seed_languages AFTER INSERT ON projects BEGIN INSERT INTO project_languages VALUES (NEW.id,'en','2026','2026',0); INSERT INTO project_languages VALUES (NEW.id,'fr','2026','2026',1); END",
    );
    await fixture.execute(
      "INSERT INTO projects VALUES ('old','Existing','en','2026','2026',1)",
    );
    await fixture.execute(
      `INSERT INTO resource_entries VALUES ('old',1,'["a.b"]','2026','2026')`,
    );
    await fixture.execute(
      "INSERT INTO translations VALUES ('old',1,'en','Hello',0,'2026','2026','import'),('old',1,'fr','Bonjour',1,'2026','2026','manual')",
    );
    const before = await fixture.query(
      "SELECT * FROM translations ORDER BY language",
    );
    await expect(fixture.repository.check()).rejects.toThrow();
    await fixture.applyMigration("0002_machine_provenance.sql");
    await expect(fixture.repository.check()).resolves.toBeUndefined();
    expect(
      await fixture.query("SELECT * FROM translations ORDER BY language"),
    ).toEqual(
      before.map((row) => ({
        ...(row as object),
        originProvider: null,
        originModel: null,
      })),
    );
    expect(
      (await fixture.repository.get("old"))!.entries[0].translations,
    ).toContainEqual(
      expect.objectContaining({
        value: "Bonjour",
        origin: "manual",
        originProvider: null,
        originModel: null,
        needsReview: true,
      }),
    );
  } finally {
    await fixture.close();
  }
});
