const express = require("express");
const multer = require("multer");
const { getDb } = require("../db/connection");
const {
  manualModules,
  teacherImportModule,
  getFieldDisplayValue,
  getManualModule,
  getImportModuleByTemplateKey,
} = require("../config/manualModules");
const {
  listTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
} = require("../services/teacherService");
const {
  listEntries,
  getEntryById,
  createEntry,
  updateEntry,
  deleteEntry,
} = require("../services/manualEntryService");
const { buildTemplateCsv } = require("../services/csvService");
const { validateCsvImport, importRows } = require("../services/importService");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function normalizeTeacherForm(body) {
  return {
    teacher_name: String(body.teacher_name || "").trim(),
    course_type: String(body.course_type || "").trim(),
    employment_type: String(body.employment_type || "").trim(),
    weekly_hours: Number(body.weekly_hours || 0),
    enabled: body.enabled ? 1 : 0,
  };
}

function validateTeacherForm(payload) {
  if (!payload.teacher_name) {
    return "教师姓名不能为空。";
  }

  if (!payload.course_type) {
    return "课程类型不能为空。";
  }

  if (!payload.employment_type) {
    return "用工类型不能为空。";
  }

  if (!Number.isFinite(payload.weekly_hours) || payload.weekly_hours < 0) {
    return "weekly_hours 必须是大于等于 0 的数字。";
  }

  return "";
}

function normalizeModulePayload(moduleConfig, body) {
  const payload = {};

  moduleConfig.fields.forEach((field) => {
    const rawValue = body[field.name];
    const normalizedValue = String(rawValue ?? "").trim();

    if (field.type === "integer" || field.type === "number") {
      payload[field.name] = normalizedValue === "" ? "" : Number(normalizedValue);
      return;
    }

    if (field.type === "enum" && field.options.includes("0") && field.options.includes("1")) {
      payload[field.name] = normalizedValue === "" ? "" : Number(normalizedValue);
      return;
    }

    payload[field.name] = normalizedValue;
  });

  return payload;
}

function validateModulePayload(moduleConfig, payload) {
  for (const field of moduleConfig.fields) {
    const value = payload[field.name];
    const rawValue = String(value ?? "").trim();

    if (field.required && rawValue === "") {
      return `${field.name} 不能为空。`;
    }

    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      return `${field.name} 必须是 YYYY-MM-DD。`;
    }

    if (field.type === "month" && !/^\d{4}-\d{2}$/.test(rawValue)) {
      return `${field.name} 必须是 YYYY-MM。`;
    }

    if ((field.type === "integer" || field.type === "number") && (!Number.isFinite(value) || value < 0)) {
      return `${field.name} 必须是大于等于 0 的数字。`;
    }

    if ((field.type === "integer" || field.type === "number") && typeof field.max === "number" && value > field.max) {
      return `${field.name} 必须小于等于 ${field.max}。`;
    }

    if (field.type === "enum" && !field.options.includes(String(value))) {
      return `${field.name} 枚举值无效。`;
    }
  }

  return "";
}

function validateModuleBusinessRules(db, moduleConfig, payload, options = {}) {
  if (typeof moduleConfig.customValidate !== "function") {
    return "";
  }

  return moduleConfig.customValidate(payload, { db, source: "form", ...options });
}

function parseImportResult(query) {
  if (query.importStatus !== "success") {
    return null;
  }

  return {
    status: "success",
    fileName: query.fileName || "",
    importedCount: Number(query.importedCount || 0),
    totalRows: Number(query.totalRows || 0),
    errors: [],
  };
}

function buildTeacherPageModel(db, options = {}) {
  return {
    pageTitle: "教师档案",
    activeNav: "teachers",
    teachers: listTeachers(db),
    teacher: options.editTeacher || {
      teacher_id: "",
      teacher_name: "",
      course_type: "",
      employment_type: "full_time",
      weekly_hours: "",
      enabled: 1,
    },
    formMode: options.editTeacher ? "edit" : "create",
    formAction: options.editTeacher
      ? `/teachers/${options.editTeacher.teacher_id}/update`
      : "/teachers/create",
    errorMessage: options.errorMessage || "",
    importResult: options.importResult || null,
    teacherImportModule,
    getFieldDisplayValue,
  };
}

function buildManualPageModel(db, moduleConfig, options = {}) {
  const emptyRecord = { id: "" };
  moduleConfig.fields.forEach((field) => {
    emptyRecord[field.name] = "";
  });

  return {
    pageTitle: moduleConfig.title,
    activeNav: "manual",
    moduleConfig,
    modules: manualModules,
    records: listEntries(db, moduleConfig),
    record: options.editRecord || emptyRecord,
    formMode: options.editRecord ? "edit" : "create",
    formAction: options.editRecord
      ? `/manual/${moduleConfig.slug}/${options.editRecord.id}/update`
      : `/manual/${moduleConfig.slug}/create`,
    errorMessage: options.errorMessage || "",
    importResult: options.importResult || null,
    getFieldDisplayValue,
  };
}

function renderImportErrorPage(res, db, moduleConfig, importResult) {
  if (moduleConfig.templateKey === teacherImportModule.templateKey) {
    res
      .status(400)
      .render("teachers", buildTeacherPageModel(db, { importResult }));
    return;
  }

  res
    .status(400)
    .render("manual-records", buildManualPageModel(db, moduleConfig, { importResult }));
}

router.get("/csv/templates/:templateKey", (req, res) => {
  const moduleConfig = getImportModuleByTemplateKey(req.params.templateKey);

  if (!moduleConfig) {
    res.status(404).send("Unknown template");
    return;
  }

  const csvContent = buildTemplateCsv(moduleConfig);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=\"${moduleConfig.templateKey}-template.csv\"`
  );
  res.send(`\uFEFF${csvContent}`);
});

router.get("/teachers/manage", (req, res) => {
  const db = getDb();
  const editTeacher = req.query.edit ? getTeacherById(db, req.query.edit) : null;
  const importResult = parseImportResult(req.query);
  res.render("teachers", buildTeacherPageModel(db, { editTeacher, importResult }));
});

router.post("/teachers/create", (req, res) => {
  const db = getDb();
  const payload = normalizeTeacherForm(req.body);
  const errorMessage = validateTeacherForm(payload);

  if (errorMessage) {
    res.status(400).render("teachers", buildTeacherPageModel(db, { errorMessage }));
    return;
  }

  createTeacher(db, payload);
  res.redirect("/teachers/manage");
});

router.post("/teachers/:teacherId/update", (req, res) => {
  const db = getDb();
  const payload = normalizeTeacherForm(req.body);
  const errorMessage = validateTeacherForm(payload);
  const editTeacher = { teacher_id: req.params.teacherId, ...payload };

  if (errorMessage) {
    res
      .status(400)
      .render("teachers", buildTeacherPageModel(db, { editTeacher, errorMessage }));
    return;
  }

  updateTeacher(db, req.params.teacherId, payload);
  res.redirect("/teachers/manage");
});

router.post("/teachers/:teacherId/delete", (req, res) => {
  const db = getDb();
  deleteTeacher(db, req.params.teacherId);
  res.redirect("/teachers/manage");
});

router.post("/teachers/import", upload.single("csv_file"), (req, res) => {
  const db = getDb();

  if (!req.file) {
    renderImportErrorPage(res, db, teacherImportModule, {
      status: "error",
      fileName: "",
      totalRows: 0,
      importedCount: 0,
      errors: [{ line: 0, reason: "请选择要上传的 CSV 文件。" }],
    });
    return;
  }

  const validation = validateCsvImport(db, teacherImportModule, req.file.buffer.toString("utf8"));

  if (!validation.ok) {
    renderImportErrorPage(res, db, teacherImportModule, {
      status: "error",
      fileName: req.file.originalname,
      totalRows: validation.totalRows,
      importedCount: 0,
      errors: validation.errors,
    });
    return;
  }

  importRows(db, teacherImportModule, validation.validRows);
  res.redirect(
    `/teachers/manage?importStatus=success&fileName=${encodeURIComponent(
      req.file.originalname
    )}&importedCount=${validation.validRows.length}&totalRows=${validation.totalRows}`
  );
});

router.get("/manual/:moduleSlug", (req, res) => {
  const db = getDb();
  const moduleConfig = getManualModule(req.params.moduleSlug);

  if (!moduleConfig) {
    res.status(404).render("error", {
      pageTitle: "页面不存在",
      activeNav: "",
      message: "未找到对应的手工录入模块。",
    });
    return;
  }

  const editRecord = req.query.edit ? getEntryById(db, moduleConfig, req.query.edit) : null;
  const importResult = parseImportResult(req.query);
  res.render(
    "manual-records",
    buildManualPageModel(db, moduleConfig, { editRecord, importResult })
  );
});

router.post("/manual/:moduleSlug/create", (req, res) => {
  const db = getDb();
  const moduleConfig = getManualModule(req.params.moduleSlug);

  if (!moduleConfig) {
    res.status(404).send("Unknown module");
    return;
  }

  const payload = normalizeModulePayload(moduleConfig, req.body);
  const errorMessage =
    validateModulePayload(moduleConfig, payload) ||
    validateModuleBusinessRules(db, moduleConfig, payload, { mode: "create" });

  if (errorMessage) {
    res
      .status(400)
      .render("manual-records", buildManualPageModel(db, moduleConfig, { errorMessage }));
    return;
  }

  try {
    createEntry(db, moduleConfig, payload);
    res.redirect(`/manual/${moduleConfig.slug}`);
  } catch (error) {
    res.status(400).render(
      "manual-records",
      buildManualPageModel(db, moduleConfig, {
        errorMessage: "新增失败，可能是主键或唯一键重复。",
      })
    );
  }
});

router.post("/manual/:moduleSlug/:id/update", (req, res) => {
  const db = getDb();
  const moduleConfig = getManualModule(req.params.moduleSlug);

  if (!moduleConfig) {
    res.status(404).send("Unknown module");
    return;
  }

  const payload = normalizeModulePayload(moduleConfig, req.body);
  const errorMessage =
    validateModulePayload(moduleConfig, payload) ||
    validateModuleBusinessRules(db, moduleConfig, payload, {
      mode: "edit",
      recordId: req.params.id,
    });
  const editRecord = { id: req.params.id, ...payload };

  if (errorMessage) {
    res
      .status(400)
      .render(
        "manual-records",
        buildManualPageModel(db, moduleConfig, { editRecord, errorMessage })
      );
    return;
  }

  try {
    updateEntry(db, moduleConfig, req.params.id, payload);
    res.redirect(`/manual/${moduleConfig.slug}`);
  } catch (error) {
    res.status(400).render(
      "manual-records",
      buildManualPageModel(db, moduleConfig, {
        editRecord,
        errorMessage: "更新失败，可能是主键或唯一键重复。",
      })
    );
  }
});

router.post("/manual/:moduleSlug/:id/delete", (req, res) => {
  const db = getDb();
  const moduleConfig = getManualModule(req.params.moduleSlug);

  if (!moduleConfig) {
    res.status(404).send("Unknown module");
    return;
  }

  deleteEntry(db, moduleConfig, req.params.id);
  res.redirect(`/manual/${moduleConfig.slug}`);
});

router.post("/manual/:moduleSlug/import", upload.single("csv_file"), (req, res) => {
  const db = getDb();
  const moduleConfig = getManualModule(req.params.moduleSlug);

  if (!moduleConfig) {
    res.status(404).send("Unknown module");
    return;
  }

  if (!req.file) {
    renderImportErrorPage(res, db, moduleConfig, {
      status: "error",
      fileName: "",
      totalRows: 0,
      importedCount: 0,
      errors: [{ line: 0, reason: "请选择要上传的 CSV 文件。" }],
    });
    return;
  }

  const validation = validateCsvImport(db, moduleConfig, req.file.buffer.toString("utf8"));

  if (!validation.ok) {
    renderImportErrorPage(res, db, moduleConfig, {
      status: "error",
      fileName: req.file.originalname,
      totalRows: validation.totalRows,
      importedCount: 0,
      errors: validation.errors,
    });
    return;
  }

  try {
    importRows(db, moduleConfig, validation.validRows);
    res.redirect(
      `/manual/${moduleConfig.slug}?importStatus=success&fileName=${encodeURIComponent(
        req.file.originalname
      )}&importedCount=${validation.validRows.length}&totalRows=${validation.totalRows}`
    );
  } catch (error) {
    renderImportErrorPage(res, db, moduleConfig, {
      status: "error",
      fileName: req.file.originalname,
      totalRows: validation.totalRows,
      importedCount: 0,
      errors: [{ line: 0, reason: `导入失败：${error.message}` }],
    });
  }
});

module.exports = router;
