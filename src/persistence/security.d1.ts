import { SqlSecurityRepository } from "./security";
export class D1SecurityRepository extends SqlSecurityRepository {
  constructor(db: D1Database) {
    super({
      async rows<T>(sql: string, values = []) {
        return (
          await db
            .prepare(sql)
            .bind(...values)
            .all<T>()
        ).results;
      },
    });
  }
}
