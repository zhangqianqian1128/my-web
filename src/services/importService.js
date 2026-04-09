const { parseCsv } = require("./csvService");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function getFieldHeaderAliases(field) {
  return Array.from(new Set([field.name, field.label, ...(field.aliases || [])].filter(Boolean)));
}

function mapHeadersToFields(moduleConfig, rawHeaders) {
  const normalizedHeaders = rawHeaders.map((header) => String(header).trim());
  const headerToFieldName = {};

  moduleConfig.fields.forEach((field) => {
    getFieldHeaderAliases(field).forEach((alias) => {
      headerToFieldName[alias] = field.name;
    });
  });

  return normalizedHeaders.map((header) => ({
    rawHeader: header,
    fieldName: headerToFieldName[header] || null,
  }));
}

function normalizeFieldInput(field, rawValue) {
  const value = String(rawValue ?? "").trim();

  if (!value) {
    return value;
  }

  if (field.valueAliases) {
    return field.valueAliases[value] ?? value;
  }

  return value;
}

function normalizeImportValue(field, rawValue) {
  const value = String(rawValue ?? "").trim();

  if (field.type === "integer") {
    return Number.parseInt(value, 10);
  }

  if (field.type === "number") {
    return Number(value);
  }

  if (
    field.type === "enum" &&
    field.options?.includes("0") &&
    field.options?.includes("1") &&
    (value === "0" || value === "1")
  ) {
    return Number(value);
  }

  return value;
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidMonth(value) {
  if (!MONTH_PATTERN.test(value)) {
    return false;
  }

  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function validateField(field, rawValue) {
  const value = String(normalizeFieldInput(field, rawValue) ?? "").trim();

  if (!value) {
    if (field.required) {
      return { valid: false, reason: `${field.name} 为必填字段` };
    }

    return { valid: true, value: "" };
  }

  if (field.type === "date") {
    if (!isValidDate(value)) {
      return { valid: false, reason: `${field.name} 必须是 YYYY-MM-DD 日期格式` };
    }

    return { valid: true, value };
  }

  if (field.type === "month") {
    if (!isValidMonth(value)) {
      return { valid: false, reason: `${field.name} 必须是 YYYY-MM 月份格式` };
    }

    return { valid: true, value };
  }

  if (field.type === "integer") {
    if (!/^-?\d+$/.test(value)) {
      return { valid: false, reason: `${field.name} 必须是整数` };
    }

    const parsed = Number.parseInt(value, 10);

    if (typeof field.min === "number" && parsed < field.min) {
      return { valid: false, reason: `${field.name} 必须大于等于 ${field.min}` };
    }

    if (typeof field.max === "number" && parsed > field.max) {
      return { valid: false, reason: `${field.name} 必须小于等于 ${field.max}` };
    }

    return { valid: true, value: parsed };
  }

  if (field.type === "number") {
    if (!/^-?\d+(\.\d+)?$/.test(value)) {
      return { valid: false, reason: `${field.name} 必须是数字` };
    }

    const parsed = Number(value);

    if (typeof field.min === "number" && parsed < field.min) {
      return { valid: false, reason: `${field.name} 必须大于等于 ${field.min}` };
    }

    if (typeof field.max === "number" && parsed > field.max) {
      return { valid: false, reason: `${field.name} 必须小于等于 ${field.max}` };
    }

    return { valid: true, value: parsed };
  }

  if (field.type === "enum") {
    if (!field.options.includes(value)) {
      return {
        valid: false,
        reason: `${field.name} 枚举值无效，允许值: ${field.options.join(", ")}`,
      };
    }

    return {
      valid: true,
      value: value === "0" || value === "1" ? Number(value) : value,
    };
  }

  return { valid: true, value };
}

function buildConflictKey(moduleConfig, row) {
  return moduleConfig.conflictFields.map((fieldName) => String(row[fieldName] ?? "")).join("::");
}

function validateCsvImport(db, moduleConfig, csvText) {
  const rows = parseCsv(csvText);

  if (rows.length === 0) {
    return {
      ok: false,
      headers: [],
      totalRows: 0,
      errors: [{ line: 1, reason: "CSV 内容为空" }],
      validRows: [],
    };
  }

  const headerMappings = mapHeadersToFields(moduleConfig, rows[0]);
  const headers = headerMappings.map((item) => item.rawHeader);
  const resolvedFieldNames = headerMappings.map((item) => item.fieldName).filter(Boolean);
  const missingHeaders = moduleConfig.fields
    .filter((field) => !resolvedFieldNames.includes(field.name))
    .map((field) => field.label || field.name);

  if (missingHeaders.length > 0) {
    return {
      ok: false,
      headers,
      totalRows: Math.max(rows.length - 1, 0),
      errors: [{ line: 1, reason: `表头缺少字段: ${missingHeaders.join(", ")}` }],
      validRows: [],
    };
  }

  const validRows = [];
  const errors = [];
  const seenConflictKeys = new Map();

  rows.slice(1).forEach((row, index) => {
    const lineNumber = index + 2;

    if (row.length > headers.length) {
      errors.push({ line: lineNumber, reason: "当前行列数多于表头列数" });
      return;
    }

    const rowObject = {};
    headerMappings.forEach((mapping, columnIndex) => {
      if (!mapping.fieldName) {
        return;
      }

      rowObject[mapping.fieldName] = row[columnIndex] ?? "";
    });

    const rowErrors = [];
    const normalizedRow = {};

    moduleConfig.fields.forEach((field) => {
      const result = validateField(field, rowObject[field.name]);

      if (!result.valid) {
        rowErrors.push(result.reason);
        return;
      }

      normalizedRow[field.name] = normalizeImportValue(field, result.value);
    });

    if (rowErrors.length > 0) {
      errors.push({ line: lineNumber, reason: rowErrors.join("；") });
      return;
    }

    if (moduleConfig.conflictFields?.length) {
      const conflictKey = buildConflictKey(moduleConfig, normalizedRow);

      if (seenConflictKeys.has(conflictKey)) {
        errors.push({
          line: lineNumber,
          reason: `CSV 中存在重复主键/唯一键组合，已与第 ${seenConflictKeys.get(conflictKey)} 行冲突`,
        });
        return;
      }

      seenConflictKeys.set(conflictKey, lineNumber);
    }

    if (typeof moduleConfig.customValidate === "function") {
      const customError = moduleConfig.customValidate(normalizedRow, {
        db,
        source: "csv",
        validRows,
      });

      if (customError) {
        errors.push({ line: lineNumber, reason: customError });
        return;
      }
    }

    validRows.push(normalizedRow);
  });

  return {
    ok: errors.length === 0,
    headers,
    totalRows: rows.length - 1,
    errors,
    validRows,
  };
}

function importRows(db, moduleConfig, rows) {
  const fieldNames = moduleConfig.fields.map((field) => field.name);
  const placeholders = fieldNames.map(() => "?").join(", ");
  const conflictFields = moduleConfig.conflictFields.join(", ");
  const updateAssignments = fieldNames
    .filter((fieldName) => !moduleConfig.conflictFields.includes(fieldName))
    .map((fieldName) => `${fieldName} = excluded.${fieldName}`);

  updateAssignments.push("updated_at = CURRENT_TIMESTAMP");

  const statement = db.prepare(
    `INSERT INTO ${moduleConfig.tableName} (
       ${fieldNames.join(", ")},
       updated_at
     ) VALUES (${placeholders}, CURRENT_TIMESTAMP)
     ON CONFLICT (${conflictFields}) DO UPDATE SET ${updateAssignments.join(", ")}`
  );

  let importedCount = 0;

  for (const row of rows) {
    statement.run(...fieldNames.map((fieldName) => row[fieldName]));
    importedCount += 1;
  }

  return { importedCount };
}

module.exports = {
  validateCsvImport,
  importRows,
};
