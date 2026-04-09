const { DatabaseSync } = require("node:sqlite");
const { dbPath } = require("../config/env");

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
  }

  return db;
}

module.exports = { getDb };
