const Database = require("better-sqlite3");
const db = new Database(process.env.HOME + "/.omniroute/storage.sqlite");
console.log("=== provider_connections containing iflow ===");
console.log(
  db
    .prepare(
      "SELECT id, provider_id, alias, account_id FROM provider_connections WHERE provider_id LIKE '%iflow%' OR alias LIKE '%iflow%' OR account_id LIKE '%iflow%'"
    )
    .all()
);
