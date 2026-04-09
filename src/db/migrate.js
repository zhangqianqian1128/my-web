const fs = require("node:fs");
const path = require("node:path");
const { dbPath } = require("../config/env");
const { defaultSlotCodes } = require("../config/slotCodes");
const { getDb } = require("./connection");

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);

  return Boolean(row);
}

function getTableColumns(db, tableName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => column.name);
}

function makeBackupName(tableName) {
  return `${tableName}_legacy_backup_${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
}

function renameTableToBackup(db, tableName) {
  const backupName = makeBackupName(tableName);
  db.exec(`ALTER TABLE ${tableName} RENAME TO ${backupName}`);
  return backupName;
}

function createTeacherSlotAvailabilityTable(db) {
  db.exec(`
    CREATE TABLE teacher_slot_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES teachers(teacher_id),
      stat_date TEXT NOT NULL,
      slot_code TEXT NOT NULL,
      available_flag INTEGER NOT NULL DEFAULT 1 CHECK(available_flag IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (teacher_id, stat_date, slot_code)
    );
    CREATE INDEX IF NOT EXISTS idx_teacher_slot_availability_date_slot
    ON teacher_slot_availability (stat_date, slot_code);
    CREATE INDEX IF NOT EXISTS idx_teacher_slot_availability_teacher_date
    ON teacher_slot_availability (teacher_id, stat_date);
  `);
}

function createSlotRatioConfigTable(db) {
  db.exec(`
    CREATE TABLE slot_ratio_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_type TEXT NOT NULL CHECK(course_type IN ('trial', 'paid')),
      slot_code TEXT NOT NULL,
      ratio REAL NOT NULL DEFAULT 0 CHECK(ratio >= 0 AND ratio <= 1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (course_type, slot_code)
    );
    CREATE INDEX IF NOT EXISTS idx_slot_ratio_config_course_type
    ON slot_ratio_config (course_type);
  `);
}

function buildLegacyAvailabilitySlots(count) {
  const slotCodes = [];
  const safeCount = Math.max(0, Number(count || 0));

  for (let index = 0; index < safeCount; index += 1) {
    slotCodes.push(defaultSlotCodes[index] || `LEGACY_SLOT_${String(index + 1).padStart(2, "0")}`);
  }

  return slotCodes;
}

function migrateTeacherSlotAvailability(db) {
  if (!tableExists(db, "teacher_slot_availability")) {
    return;
  }

  const currentColumns = getTableColumns(db, "teacher_slot_availability");
  const isNewShape =
    currentColumns.includes("teacher_id") &&
    currentColumns.includes("stat_date") &&
    currentColumns.includes("slot_code") &&
    currentColumns.includes("available_flag") &&
    !currentColumns.includes("available_slots");

  if (isNewShape) {
    return;
  }

  const backupName = renameTableToBackup(db, "teacher_slot_availability");
  createTeacherSlotAvailabilityTable(db);

  if (!currentColumns.includes("available_slots")) {
    console.warn(
      `[migrate] teacher_slot_availability 检测到非预期旧结构，已备份到 ${backupName}，请检查后按新模板重新导入。`
    );
    return;
  }

  const legacyRows = db
    .prepare(`SELECT teacher_id, stat_date, available_slots, created_at, updated_at FROM ${backupName}`)
    .all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO teacher_slot_availability (
      teacher_id,
      stat_date,
      slot_code,
      available_flag,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  legacyRows.forEach((row) => {
    buildLegacyAvailabilitySlots(row.available_slots).forEach((slotCode) => {
      insert.run(
        row.teacher_id,
        row.stat_date,
        slotCode,
        1,
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString()
      );
    });
  });

  console.warn(
    `[migrate] teacher_slot_availability 已从 available_slots 聚合结构升级为 slot_code 明细结构，原始表备份为 ${backupName}。`
  );
}

function migrateSlotRatioConfig(db) {
  if (!tableExists(db, "slot_ratio_config")) {
    return;
  }

  const currentColumns = getTableColumns(db, "slot_ratio_config");
  const isNewShape =
    currentColumns.includes("course_type") &&
    currentColumns.includes("slot_code") &&
    currentColumns.includes("ratio") &&
    !currentColumns.includes("config_key") &&
    !currentColumns.includes("ratio_value");

  if (isNewShape) {
    return;
  }

  const backupName = renameTableToBackup(db, "slot_ratio_config");
  createSlotRatioConfigTable(db);

  if (!currentColumns.includes("config_key") || !currentColumns.includes("ratio_value")) {
    console.warn(
      `[migrate] slot_ratio_config 检测到非预期旧结构，已备份到 ${backupName}，请检查后按新模板重新导入。`
    );
    return;
  }

  const legacyRows = db
    .prepare(
      `SELECT config_key, course_type, ratio_value, created_at, updated_at FROM ${backupName}`
    )
    .all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO slot_ratio_config (
      course_type,
      slot_code,
      ratio,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `);

  legacyRows.forEach((row) => {
    if (row.course_type !== "trial" && row.course_type !== "paid") {
      return;
    }

    insert.run(
      row.course_type,
      row.config_key,
      Math.min(Math.max(Number(row.ratio_value || 0), 0), 1),
      row.created_at || new Date().toISOString(),
      row.updated_at || row.created_at || new Date().toISOString()
    );
  });

  console.warn(
    `[migrate] slot_ratio_config 已从 config_key + ratio_value 升级为 course_type + slot_code + ratio，原始表备份为 ${backupName}。`
  );
}

function migrate() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = getDb();
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  migrateTeacherSlotAvailability(db);
  migrateSlotRatioConfig(db);
  db.exec(schemaSql);

  return db;
}

module.exports = { migrate };
