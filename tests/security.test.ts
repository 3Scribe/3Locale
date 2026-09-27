import { SqliteSecurityRepository } from "../src/persistence/security.sqlite";
import { securityContract } from "./contracts/security";
securityContract("SQLite", async () => {
  const security = new SqliteSecurityRepository(":memory:");
  return {
    security,
    async close() {
      security.close();
    },
  };
});
