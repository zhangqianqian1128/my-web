function escapeCsvValue(value) {
  const text = String(value ?? "");

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function getExportHeader(field) {
  return field.label || field.name;
}

function getExportValue(field, value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (field.displayValueMap) {
    return field.displayValueMap[String(value)] ?? value;
  }

  return value;
}

function buildTemplateCsv(moduleConfig) {
  const headers = moduleConfig.fields.map((field) => getExportHeader(field));
  const rows = [
    headers,
    ...moduleConfig.sampleRows.map((row) =>
      moduleConfig.fields.map((field) => getExportValue(field, row[field.name]))
    ),
  ];

  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function parseCsv(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((value) => String(value).trim() !== ""));
}

module.exports = {
  buildTemplateCsv,
  parseCsv,
};
