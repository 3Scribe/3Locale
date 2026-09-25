export const machineProvenance = {
  version: 4,
  sql: `ALTER TABLE translations ADD COLUMN originProvider TEXT;
 ALTER TABLE translations ADD COLUMN originModel TEXT;`,
};
