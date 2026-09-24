import { type AuditRecord, type ProjectDetail } from "../domain/model";
export function changes(
  previous: ProjectDetail | undefined,
  next: ProjectDetail,
): AuditRecord[] {
  const events: AuditRecord[] = [];
  if (!previous)
    events.push({
      kind: "project.created",
      next: { name: next.name, baseLanguage: next.baseLanguage },
    });
  for (const language of next.languages)
    if (!previous?.languages.includes(language))
      events.push({ kind: "language.added", language });
  const oldEntries = new Map(
    previous?.entries.map((entry) => [entry.id, entry]) ?? [],
  );
  for (const entry of next.entries) {
    const oldEntry = oldEntries.get(entry.id);
    if (!oldEntry) events.push({ kind: "entry.added", path: entry.path });
    for (const value of entry.translations) {
      const old = oldEntry?.translations.find(
        (item) => item.language === value.language,
      );
      if (!old || old.value !== value.value || old.origin !== value.origin)
        events.push({
          kind:
            value.language === next.baseLanguage
              ? "base.changed"
              : "translation.changed",
          language: value.language,
          path: entry.path,
          previous: old ?? null,
          next: value,
        });
      if (Boolean(old?.needsReview) !== value.needsReview)
        events.push({
          kind: "review.changed",
          language: value.language,
          path: entry.path,
          previous: old?.needsReview ?? false,
          next: value.needsReview,
        });
    }
  }
  return events;
}
