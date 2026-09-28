import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrations";
import { SqlSecurityRepository } from "./security";
export class SqliteSecurityRepository extends SqlSecurityRepository {
  private database: DatabaseSync;
  constructor(path: string) {
    const db = new DatabaseSync(path);
    try {
      db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
      migrate(db);
    } catch (error) {
      db.close();
      throw error;
    }
    super({
      async rows<T>(sql: string, values = []) {
        return db.prepare(sql).all(...values) as T[];
      },
    });
    this.database = db;
  }
  close() {
    this.database.close();
  }
}
