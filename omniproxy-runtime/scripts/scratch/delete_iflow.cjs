const Database = require('better-sqlite3');
const db = new Database(process.env.HOME + '/.omniroute/storage.sqlite');

console.log("Deleting iflow connections...");
const stmt = db.prepare("DELETE FROM provider_connections WHERE provider = 'iflow'");
const info = stmt.run();
console.log(`Deleted ${info.changes} rows.`);
