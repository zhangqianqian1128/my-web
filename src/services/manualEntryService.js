function listEntries(db, moduleConfig) {
  const columns = ["id", ...moduleConfig.fields.map((field) => field.name)].join(", ");

  return db
    .prepare(
      `SELECT ${columns}
       FROM ${moduleConfig.tableName}
       ORDER BY ${moduleConfig.orderBy}`
    )
    .all();
}

function getEntryById(db, moduleConfig, id) {
  const columns = ["id", ...moduleConfig.fields.map((field) => field.name)].join(", ");

  return db
    .prepare(
      `SELECT ${columns}
       FROM ${moduleConfig.tableName}
       WHERE id = ?`
    )
    .get(Number(id));
}

function createEntry(db, moduleConfig, payload) {
  const fieldNames = moduleConfig.fields.map((field) => field.name);
  const placeholders = fieldNames.map(() => "?").join(", ");
  const values = fieldNames.map((name) => payload[name]);

  return db
    .prepare(
      `INSERT INTO ${moduleConfig.tableName} (
         ${fieldNames.join(", ")},
         updated_at
       ) VALUES (${placeholders}, CURRENT_TIMESTAMP)`
    )
    .run(...values);
}

function updateEntry(db, moduleConfig, id, payload) {
  const assignments = moduleConfig.fields.map((field) => `${field.name} = ?`).join(", ");
  const values = moduleConfig.fields.map((field) => payload[field.name]);

  return db
    .prepare(
      `UPDATE ${moduleConfig.tableName}
       SET ${assignments},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(...values, Number(id));
}

function deleteEntry(db, moduleConfig, id) {
  return db.prepare(`DELETE FROM ${moduleConfig.tableName} WHERE id = ?`).run(Number(id));
}

module.exports = {
  listEntries,
  getEntryById,
  createEntry,
  updateEntry,
  deleteEntry,
};
