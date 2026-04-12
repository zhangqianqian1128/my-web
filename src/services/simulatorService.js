const { getUtilizationWarningLevel, getSlotWarningLevel } = require("./forecastService");

const WEEKDAY_FIELD_DEFINITIONS = [
  { key: "monday", value: "周一", label: "周一", defaultRatio: "14.29" },
  { key: "tuesday", value: "周二", label: "周二", defaultRatio: "14.29" },
  { key: "wednesday", value: "周三", label: "周三", defaultRatio: "14.29" },
  { key: "thursday", value: "周四", label: "周四", defaultRatio: "14.29" },
  { key: "friday", value: "周五", label: "周五", defaultRatio: "14.28" },
  { key: "saturday", value: "周六", label: "周六", defaultRatio: "14.28" },
  { key: "sunday", value: "周日", label: "周日", defaultRatio: "14.28" },
];

const WEEKDAY_OPTIONS = WEEKDAY_FIELD_DEFINITIONS.map(({ value, label }) => ({ value, label }));

const SUMMARY_GRANULARITY_OPTIONS = [
  { value: "week", label: "按周" },
  { value: "month", label: "按月" },
];

const TEACHER_STAGE_DEFINITIONS = [
  {
    key: "full_time_training",
    typeKey: "full_time",
    typeLabel: "全职",
    stageKey: "training",
    stageLabel: "培训期",
  },
  {
    key: "full_time_rookie",
    typeKey: "full_time",
    typeLabel: "全职",
    stageKey: "rookie",
    stageLabel: "新手期",
  },
  {
    key: "full_time_regular",
    typeKey: "full_time",
    typeLabel: "全职",
    stageKey: "regular",
    stageLabel: "正式期",
  },
  {
    key: "part_time_training",
    typeKey: "part_time",
    typeLabel: "兼职",
    stageKey: "training",
    stageLabel: "培训期",
  },
  {
    key: "part_time_rookie",
    typeKey: "part_time",
    typeLabel: "兼职",
    stageKey: "rookie",
    stageLabel: "新手期",
  },
  {
    key: "part_time_regular",
    typeKey: "part_time",
    typeLabel: "兼职",
    stageKey: "regular",
    stageLabel: "正式期",
  },
];

const severityRank = { red: 0, orange: 1, yellow: 2, green: 3 };
const PERCENTAGE_MAX = 100;

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function safeDivide(numerator, denominator) {
  if (denominator <= 0) {
    return numerator > 0 ? Number.POSITIVE_INFINITY : 0;
  }

  return numerator / denominator;
}

function formatFixed(value, digits = 2) {
  return roundTo(value, digits).toFixed(digits);
}

function normalizePercentString(value, fallback = "0.00", options = {}) {
  const rawValue = String(value ?? "").trim().replace(/[%％]/g, "");

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    return rawValue;
  }

  const shouldUpgradeLegacyFraction = options.upgradeLegacyFraction && parsed >= 0 && parsed <= 1;
  const percentValue = shouldUpgradeLegacyFraction ? parsed * 100 : parsed;
  return formatFixed(percentValue, 2);
}

function toDate(value) {
  const [year, month, day] = String(value)
    .split("-")
    .map((part) => Number(part));

  return new Date(Date.UTC(year, month - 1, day));
}

function formatRangeLabel(startDate, endDate) {
  return `${startDate} ~ ${endDate}`;
}

function subtractDays(dateString, days) {
  const date = toDate(dateString);
  date.setUTCDate(date.getUTCDate() - Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(startDate, endDate) {
  const diff = toDate(endDate).getTime() - toDate(startDate).getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function computeWeekCount(startDate, endDate) {
  return Math.max(1, Math.ceil(diffDaysInclusive(startDate, endDate) / 7));
}

function computeWeekUnits(startDate, endDate) {
  return roundTo(diffDaysInclusive(startDate, endDate) / 7, 2);
}

function getWeekdayLabelByDate(date) {
  const weekdayMap = {
    0: "周日",
    1: "周一",
    2: "周二",
    3: "周三",
    4: "周四",
    5: "周五",
    6: "周六",
  };

  return weekdayMap[date.getUTCDay()] || "";
}

function buildDefaultSlotRows(rows) {
  if (rows && rows.length > 0) {
    return rows;
  }

  return [
    { dayOfWeek: "周三", startTime: "18:00", endTime: "19:00", ratio: "40.00" },
    { dayOfWeek: "周三", startTime: "19:00", endTime: "20:00", ratio: "30.00" },
    { dayOfWeek: "周六", startTime: "10:00", endTime: "11:00", ratio: "30.00" },
  ];
}

function normalizeTimeString(value) {
  const normalizedValue = String(value ?? "").trim();
  const match = normalizedValue.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    return "";
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return "";
  }

  return `${match[1]}:${match[2]}`;
}

function normalizeWeekdayString(value) {
  const normalizedValue = String(value ?? "").trim();
  const weekdayMap = {
    周一: "周一",
    星期一: "周一",
    周1: "周一",
    星期1: "周一",
    周二: "周二",
    星期二: "周二",
    周2: "周二",
    星期2: "周二",
    周三: "周三",
    星期三: "周三",
    周3: "周三",
    星期3: "周三",
    周四: "周四",
    星期四: "周四",
    周4: "周四",
    星期4: "周四",
    周五: "周五",
    星期五: "周五",
    周5: "周五",
    星期5: "周五",
    周六: "周六",
    星期六: "周六",
    周6: "周六",
    星期6: "周六",
    周日: "周日",
    周天: "周日",
    星期日: "周日",
    星期天: "周日",
    周7: "周日",
    星期7: "周日",
    周0: "周日",
    星期0: "周日",
  };

  return weekdayMap[normalizedValue] || "";
}

function buildTeacherStageKey(typeKey, stageKey) {
  return `${String(typeKey || "").trim()}_${String(stageKey || "").trim()}`;
}

function buildDefaultTeacherStageRows(overrides = {}) {
  return TEACHER_STAGE_DEFINITIONS.map((definition) => ({
    ...definition,
    teacherCount: String(overrides[definition.key]?.teacherCount ?? "0").trim(),
    weeklyClasses: String(overrides[definition.key]?.weeklyClasses ?? "0").trim(),
  }));
}

function buildDefaultWeekdayRatioRows(overrides = {}) {
  return WEEKDAY_FIELD_DEFINITIONS.map((definition) => ({
    key: definition.key,
    dayOfWeek: definition.value,
    label: definition.label,
    ratio: normalizePercentString(
      overrides[definition.key] ?? definition.defaultRatio,
      definition.defaultRatio
    ),
  }));
}

function buildWeekdayRatioRows(rows, fallbackRows = []) {
  const sourceMap = new Map();
  const fallbackMap = new Map();

  (rows || []).forEach((row) => {
    const weekdayKey =
      row?.key ||
      WEEKDAY_FIELD_DEFINITIONS.find(
        (definition) => definition.value === normalizeWeekdayString(row?.dayOfWeek)
      )?.key;

    if (weekdayKey) {
      sourceMap.set(weekdayKey, row);
    }
  });

  (fallbackRows || []).forEach((row) => {
    if (row?.key) {
      fallbackMap.set(row.key, row);
    }
  });

  return WEEKDAY_FIELD_DEFINITIONS.map((definition) => {
    const source = sourceMap.get(definition.key);
    const fallback = fallbackMap.get(definition.key);
    const hasSourceRatio = source && Object.prototype.hasOwnProperty.call(source, "ratio");
    const fallbackRatio = fallback?.ratio ?? definition.defaultRatio;

    return {
      key: definition.key,
      dayOfWeek: definition.value,
      label: definition.label,
      ratio: normalizePercentString(
        hasSourceRatio ? source.ratio : fallbackRatio,
        hasSourceRatio ? "0.00" : fallbackRatio
      ),
    };
  });
}

function buildTeacherStageRows(rows, fallbackRows = []) {
  const sourceMap = new Map();
  const fallbackMap = new Map();

  (rows || []).forEach((row) => {
    const key = buildTeacherStageKey(row?.typeKey ?? row?.type, row?.stageKey ?? row?.stage);
    if (key !== "_") {
      sourceMap.set(key, row);
    }
  });

  (fallbackRows || []).forEach((row) => {
    const key = row?.key || buildTeacherStageKey(row?.typeKey ?? row?.type, row?.stageKey ?? row?.stage);
    if (key !== "_") {
      fallbackMap.set(key, row);
    }
  });

  return TEACHER_STAGE_DEFINITIONS.map((definition) => {
    const source = sourceMap.get(definition.key);
    const fallback = fallbackMap.get(definition.key);

    return {
      ...definition,
      teacherCount: String(source?.teacherCount ?? fallback?.teacherCount ?? "0").trim(),
      weeklyClasses: String(source?.weeklyClasses ?? fallback?.weeklyClasses ?? "0").trim(),
    };
  });
}

function mapLegacyTeacherStageOverrides(courseConfig = {}) {
  const hasLegacyTeacherFields =
    courseConfig.fullTimeTeachers !== undefined ||
    courseConfig.fullTimeWeeklyClasses !== undefined ||
    courseConfig.partTimeTeachers !== undefined ||
    courseConfig.partTimeWeeklyClasses !== undefined;

  if (!hasLegacyTeacherFields) {
    return null;
  }

  return {
    full_time_regular: {
      teacherCount: String(courseConfig.fullTimeTeachers ?? "0").trim(),
      weeklyClasses: String(courseConfig.fullTimeWeeklyClasses ?? "0").trim(),
    },
    part_time_regular: {
      teacherCount: String(courseConfig.partTimeTeachers ?? "0").trim(),
      weeklyClasses: String(courseConfig.partTimeWeeklyClasses ?? "0").trim(),
    },
  };
}

function hydrateTeacherStageRows(courseConfig, fallbackRows) {
  if (Array.isArray(courseConfig?.teacherRows) && courseConfig.teacherRows.length > 0) {
    return buildTeacherStageRows(courseConfig.teacherRows, fallbackRows);
  }

  const legacyOverrides = mapLegacyTeacherStageOverrides(courseConfig);

  if (legacyOverrides) {
    return buildDefaultTeacherStageRows(legacyOverrides);
  }

  return buildTeacherStageRows(fallbackRows, fallbackRows);
}

function hydrateWeekdayRatioRows(courseConfig, fallbackRows) {
  if (Array.isArray(courseConfig?.weekdayRatioRows) && courseConfig.weekdayRatioRows.length > 0) {
    return buildWeekdayRatioRows(courseConfig.weekdayRatioRows, fallbackRows);
  }

  if (Array.isArray(courseConfig?.weekdayRatios) && courseConfig.weekdayRatios.length > 0) {
    return buildWeekdayRatioRows(courseConfig.weekdayRatios, fallbackRows);
  }

  return buildWeekdayRatioRows(fallbackRows, fallbackRows);
}

function buildDefaultSimulatorForm() {
  return {
    formVersion: 4,
    period: {
      startDate: "2026-05-01",
      endDate: "2026-05-28",
      summaryGranularity: "week",
    },
    trial: {
      assignedLeads: "320",
      attendRate: "65.00",
      classSize: "4",
      recruitmentDays: "7",
      trainingDays: "14",
      teacherRows: buildDefaultTeacherStageRows({
        full_time_training: { teacherCount: "0", weeklyClasses: "0" },
        full_time_rookie: { teacherCount: "1", weeklyClasses: "10" },
        full_time_regular: { teacherCount: "3", weeklyClasses: "18" },
        part_time_training: { teacherCount: "0", weeklyClasses: "0" },
        part_time_rookie: { teacherCount: "1", weeklyClasses: "4" },
        part_time_regular: { teacherCount: "2", weeklyClasses: "8" },
      }),
      weekdayRatioRows: buildDefaultWeekdayRatioRows(),
      slotRows: buildDefaultSlotRows(),
    },
    paid: {
      currentStudents: "180",
      renewalDueStudents: "36",
      renewalChurnRate: "20.00",
      salesConvertedStarts: "42",
      ecomStarts: "24",
      studentWeeklyClasses: "2",
      classSize: "6",
      recruitmentDays: "10",
      trainingDays: "21",
      teacherRows: buildDefaultTeacherStageRows({
        full_time_training: { teacherCount: "0", weeklyClasses: "0" },
        full_time_rookie: { teacherCount: "1", weeklyClasses: "8" },
        full_time_regular: { teacherCount: "4", weeklyClasses: "14" },
        part_time_training: { teacherCount: "0", weeklyClasses: "0" },
        part_time_rookie: { teacherCount: "0", weeklyClasses: "0" },
        part_time_regular: { teacherCount: "2", weeklyClasses: "6" },
      }),
      weekdayRatioRows: buildDefaultWeekdayRatioRows(),
      slotRows: buildDefaultSlotRows([
        { dayOfWeek: "周二", startTime: "19:00", endTime: "20:00", ratio: "35.00" },
        { dayOfWeek: "周四", startTime: "19:00", endTime: "20:00", ratio: "35.00" },
        { dayOfWeek: "周六", startTime: "09:00", endTime: "10:00", ratio: "30.00" },
      ]),
    },
  };
}

function hydrateSlotRows(rows, fallbackRows, upgradeLegacyFraction = false) {
  const sourceRows = Array.isArray(rows) ? rows : fallbackRows;

  return sourceRows.map((row, index) => ({
      dayOfWeek:
        normalizeWeekdayString(row?.dayOfWeek ?? fallbackRows[index]?.dayOfWeek) ||
        String(row?.dayOfWeek ?? fallbackRows[index]?.dayOfWeek ?? "").trim(),
      startTime:
        normalizeTimeString(row?.startTime ?? fallbackRows[index]?.startTime) ||
        String(row?.startTime ?? fallbackRows[index]?.startTime ?? "").trim(),
      endTime:
        normalizeTimeString(row?.endTime ?? fallbackRows[index]?.endTime) ||
        String(row?.endTime ?? fallbackRows[index]?.endTime ?? "").trim(),
      ratio: normalizePercentString(row?.ratio ?? fallbackRows[index]?.ratio, "0.00", {
        upgradeLegacyFraction,
      }),
    }));
}

function hydrateSimulatorForm(savedForm) {
  const defaults = buildDefaultSimulatorForm();
  const upgradeLegacyFraction = Number(savedForm?.formVersion || 0) < 2;

  if (!savedForm) {
    return defaults;
  }

  return {
    formVersion: 4,
    period: {
      startDate: String(savedForm.period?.startDate ?? defaults.period.startDate).trim(),
      endDate: String(savedForm.period?.endDate ?? defaults.period.endDate).trim(),
      summaryGranularity: String(
        savedForm.period?.summaryGranularity ?? defaults.period.summaryGranularity
      ).trim(),
    },
    trial: {
      assignedLeads: String(savedForm.trial?.assignedLeads ?? defaults.trial.assignedLeads).trim(),
      attendRate: normalizePercentString(savedForm.trial?.attendRate, defaults.trial.attendRate, {
        upgradeLegacyFraction,
      }),
      classSize: String(savedForm.trial?.classSize ?? defaults.trial.classSize).trim(),
      recruitmentDays: String(
        savedForm.trial?.recruitmentDays ?? defaults.trial.recruitmentDays
      ).trim(),
      trainingDays: String(savedForm.trial?.trainingDays ?? defaults.trial.trainingDays).trim(),
      teacherRows: hydrateTeacherStageRows(savedForm.trial, defaults.trial.teacherRows),
      weekdayRatioRows: hydrateWeekdayRatioRows(savedForm.trial, defaults.trial.weekdayRatioRows),
      slotRows: hydrateSlotRows(
        savedForm.trial?.slotRows,
        defaults.trial.slotRows,
        upgradeLegacyFraction
      ),
    },
    paid: {
      currentStudents: String(
        savedForm.paid?.currentStudents ?? defaults.paid.currentStudents
      ).trim(),
      renewalDueStudents: String(
        savedForm.paid?.renewalDueStudents ?? defaults.paid.renewalDueStudents
      ).trim(),
      renewalChurnRate: normalizePercentString(
        savedForm.paid?.renewalChurnRate,
        defaults.paid.renewalChurnRate,
        { upgradeLegacyFraction }
      ),
      salesConvertedStarts: String(
        savedForm.paid?.salesConvertedStarts ?? defaults.paid.salesConvertedStarts
      ).trim(),
      ecomStarts: String(savedForm.paid?.ecomStarts ?? defaults.paid.ecomStarts).trim(),
      studentWeeklyClasses: String(
        savedForm.paid?.studentWeeklyClasses ?? defaults.paid.studentWeeklyClasses
      ).trim(),
      classSize: String(savedForm.paid?.classSize ?? defaults.paid.classSize).trim(),
      recruitmentDays: String(
        savedForm.paid?.recruitmentDays ?? defaults.paid.recruitmentDays
      ).trim(),
      trainingDays: String(savedForm.paid?.trainingDays ?? defaults.paid.trainingDays).trim(),
      teacherRows: hydrateTeacherStageRows(savedForm.paid, defaults.paid.teacherRows),
      weekdayRatioRows: hydrateWeekdayRatioRows(savedForm.paid, defaults.paid.weekdayRatioRows),
      slotRows: hydrateSlotRows(
        savedForm.paid?.slotRows,
        defaults.paid.slotRows,
        upgradeLegacyFraction
      ),
    },
  };
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined) {
    return [];
  }

  return [value];
}

function normalizeSlotRows(body, prefix) {
  const dayValues = toArray(body[`${prefix}_slot_day[]`] ?? body[`${prefix}_slot_day`]);
  const startValues = toArray(body[`${prefix}_slot_start[]`] ?? body[`${prefix}_slot_start`]);
  const endValues = toArray(body[`${prefix}_slot_end[]`] ?? body[`${prefix}_slot_end`]);
  const ratioValues = toArray(body[`${prefix}_slot_ratio[]`] ?? body[`${prefix}_slot_ratio`]);
  const rowCount = Math.max(
    dayValues.length,
    startValues.length,
    endValues.length,
    ratioValues.length
  );

  const rows = [];

  for (let index = 0; index < rowCount; index += 1) {
    const rawDayOfWeek = String(dayValues[index] ?? "").trim();
    const rawStartTime = String(startValues[index] ?? "").trim();
    const rawEndTime = String(endValues[index] ?? "").trim();
    const ratio = String(ratioValues[index] ?? "").trim();
    const dayOfWeek = normalizeWeekdayString(rawDayOfWeek) || rawDayOfWeek;
    const startTime = normalizeTimeString(rawStartTime) || rawStartTime;
    const endTime = normalizeTimeString(rawEndTime) || rawEndTime;

    if (!dayOfWeek && !startTime && !endTime && !ratio) {
      continue;
    }

    rows.push({
      dayOfWeek,
      startTime,
      endTime,
      ratio,
    });
  }

  return rows;
}

function normalizeTeacherStageRows(body, prefix, fallbackRows) {
  const typeValues = toArray(body[`${prefix}_teacher_type[]`] ?? body[`${prefix}_teacher_type`]);
  const stageValues = toArray(body[`${prefix}_teacher_stage[]`] ?? body[`${prefix}_teacher_stage`]);
  const teacherCountValues = toArray(
    body[`${prefix}_teacher_count[]`] ?? body[`${prefix}_teacher_count`]
  );
  const weeklyClassValues = toArray(
    body[`${prefix}_teacher_weekly_classes[]`] ?? body[`${prefix}_teacher_weekly_classes`]
  );
  const rowCount = Math.max(
    typeValues.length,
    stageValues.length,
    teacherCountValues.length,
    weeklyClassValues.length
  );

  const rows = [];

  for (let index = 0; index < rowCount; index += 1) {
    const typeKey = String(typeValues[index] ?? "").trim();
    const stageKey = String(stageValues[index] ?? "").trim();
    const teacherCount = String(teacherCountValues[index] ?? "").trim();
    const weeklyClasses = String(weeklyClassValues[index] ?? "").trim();

    if (!typeKey || !stageKey) {
      continue;
    }

    rows.push({
      typeKey,
      stageKey,
      teacherCount,
      weeklyClasses,
    });
  }

  return buildTeacherStageRows(rows.length > 0 ? rows : fallbackRows, fallbackRows);
}

function normalizeWeekdayRatioRows(body, prefix, fallbackRows) {
  return buildWeekdayRatioRows(
    WEEKDAY_FIELD_DEFINITIONS.map((definition) => ({
      key: definition.key,
      dayOfWeek: definition.value,
      ratio: String(body[`${prefix}_weekday_ratio_${definition.key}`] ?? "").trim(),
    })),
    fallbackRows
  );
}

function normalizeSimulatorInput(body = {}) {
  const defaults = buildDefaultSimulatorForm();

  return {
    formVersion: 4,
    period: {
      startDate: String(body.start_date ?? defaults.period.startDate).trim(),
      endDate: String(body.end_date ?? defaults.period.endDate).trim(),
      summaryGranularity: String(body.summary_granularity ?? defaults.period.summaryGranularity).trim(),
    },
    trial: {
      assignedLeads: String(body.trial_assigned_leads ?? defaults.trial.assignedLeads).trim(),
      attendRate: String(body.trial_attend_rate ?? defaults.trial.attendRate).trim(),
      classSize: String(body.trial_class_size ?? defaults.trial.classSize).trim(),
      recruitmentDays: String(
        body.trial_recruitment_days ?? defaults.trial.recruitmentDays
      ).trim(),
      trainingDays: String(body.trial_training_days ?? defaults.trial.trainingDays).trim(),
      teacherRows: normalizeTeacherStageRows(body, "trial", defaults.trial.teacherRows),
      weekdayRatioRows: normalizeWeekdayRatioRows(body, "trial", defaults.trial.weekdayRatioRows),
      slotRows: normalizeSlotRows(body, "trial"),
    },
    paid: {
      currentStudents: String(body.paid_current_students ?? defaults.paid.currentStudents).trim(),
      renewalDueStudents: String(
        body.paid_renewal_due_students ?? defaults.paid.renewalDueStudents
      ).trim(),
      renewalChurnRate: String(
        body.paid_renewal_churn_rate ?? defaults.paid.renewalChurnRate
      ).trim(),
      salesConvertedStarts: String(
        body.paid_sales_converted_starts ?? defaults.paid.salesConvertedStarts
      ).trim(),
      ecomStarts: String(body.paid_ecom_starts ?? defaults.paid.ecomStarts).trim(),
      studentWeeklyClasses: String(
        body.paid_student_weekly_classes ?? defaults.paid.studentWeeklyClasses
      ).trim(),
      classSize: String(body.paid_class_size ?? defaults.paid.classSize).trim(),
      recruitmentDays: String(
        body.paid_recruitment_days ?? defaults.paid.recruitmentDays
      ).trim(),
      trainingDays: String(body.paid_training_days ?? defaults.paid.trainingDays).trim(),
      teacherRows: normalizeTeacherStageRows(body, "paid", defaults.paid.teacherRows),
      weekdayRatioRows: normalizeWeekdayRatioRows(body, "paid", defaults.paid.weekdayRatioRows),
      slotRows: normalizeSlotRows(body, "paid"),
    },
  };
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return false;
  }

  const date = toDate(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTimeString(value) {
  return Boolean(normalizeTimeString(value));
}

function parseRequiredNumber(value, label, options = {}) {
  const parsed = Number(value);

  if (value === "" || !Number.isFinite(parsed)) {
    return { ok: false, message: `${label} 必须填写数字。` };
  }

  if (typeof options.min === "number" && parsed < options.min) {
    return { ok: false, message: `${label} 必须大于等于 ${options.min}。` };
  }

  if (typeof options.max === "number" && parsed > options.max) {
    return { ok: false, message: `${label} 必须小于等于 ${options.max}。` };
  }

  return { ok: true, value: parsed };
}

function parseRequiredPercent(value, label, options = {}) {
  const percentLabel = label.includes("占比") || label.includes("率") ? label : `${label} 百分比`;
  const numberResult = parseRequiredNumber(
    String(value ?? "").trim().replace(/[%％]/g, ""),
    percentLabel,
    {
      min: typeof options.min === "number" ? options.min : 0,
      max: typeof options.max === "number" ? options.max : PERCENTAGE_MAX,
    }
  );

  if (!numberResult.ok) {
    return numberResult;
  }

  return {
    ok: true,
    percentValue: roundTo(numberResult.value, 2),
    value: numberResult.value / 100,
  };
}

function parseWeekdayPercent(value, label, options = {}) {
  return parseRequiredPercent(value === "" ? "0" : value, label, options);
}

function validateWeekdayRatioRows(rows, label) {
  if (!rows || rows.length === 0) {
    return `${label} 每周班次占比至少需要配置 1 天。`;
  }

  let ratioSum = 0;

  for (const row of rows) {
    if (!normalizeWeekdayString(row.dayOfWeek)) {
      return `${label} 的周内班次占比配置包含无效周几。`;
    }

    const ratioResult = parseWeekdayPercent(row.ratio, `${label}${row.dayOfWeek}班次占比`, {
      min: 0,
      max: PERCENTAGE_MAX,
    });

    if (!ratioResult.ok) {
      return ratioResult.message;
    }

    ratioSum += ratioResult.percentValue;
  }

  if (ratioSum <= 0) {
    return `${label} 每周班次占比合计必须大于 0%。`;
  }

  if (ratioSum > 100.01) {
    return `${label} 每周班次占比合计不能超过 100%，当前为 ${formatFixed(ratioSum, 2)}%。`;
  }

  return "";
}

function buildWeekdayRatioMap(rows) {
  const ratioMap = new Map(WEEKDAY_OPTIONS.map((option) => [option.value, 0]));

  (rows || []).forEach((row) => {
    const dayOfWeek = normalizeWeekdayString(row.dayOfWeek);
    if (!dayOfWeek) {
      return;
    }

    const parsed = parseWeekdayPercent(row.ratio, `${dayOfWeek}班次占比`);
    ratioMap.set(dayOfWeek, parsed.ok ? parsed.value : 0);
  });

  return ratioMap;
}

function computeWeightedWeekUnits(startDate, endDate, weekdayRatioRows) {
  const ratioMap = buildWeekdayRatioMap(weekdayRatioRows);
  const cursor = toDate(startDate);
  const end = toDate(endDate);
  let total = 0;

  while (cursor.getTime() <= end.getTime()) {
    total += ratioMap.get(getWeekdayLabelByDate(cursor)) || 0;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return roundTo(total, 4);
}

function validateSlotRows(rows, label) {
  if (!rows || rows.length === 0) {
    return `${label} 至少需要配置 1 个热门时段。`;
  }

  let ratioSum = 0;

  for (const row of rows) {
    if (!row.dayOfWeek) {
      return `${label} 的热门时段配置必须填写周几。`;
    }

    if (!normalizeWeekdayString(row.dayOfWeek)) {
      return `${label} 的热门时段周几必须是周一到周日，或使用星期一到星期天的写法。`;
    }

    if (!isValidTimeString(row.startTime) || !isValidTimeString(row.endTime)) {
      return `${label} 的热门时段开始时间和结束时间必须是 HH:MM 或 HH:MM:SS。`;
    }

    if (row.startTime >= row.endTime) {
      return `${label} 的热门时段开始时间必须早于结束时间。`;
    }

    const ratioResult = parseRequiredPercent(row.ratio, `${label} 热门时段占比`, {
      min: 0,
      max: PERCENTAGE_MAX,
    });

    if (!ratioResult.ok) {
      return ratioResult.message;
    }

    ratioSum += ratioResult.value;
  }

  if (ratioSum > 1.000001) {
    return `${label} 热门时段占比合计不能超过 100%，当前为 ${formatFixed(ratioSum * 100, 2)}%。未配置的剩余占比会视为普通时段。`;
  }

  return "";
}

function sumSlotRatios(rows) {
  return roundTo(
    (rows || []).reduce((sum, row) => {
      const parsed = parseRequiredPercent(row.ratio, "热门时段占比");
      return sum + (parsed.ok ? parsed.value : 0);
    }, 0),
    4
  );
}

function validateTeacherStageRows(rows, label) {
  if (!rows || rows.length === 0) {
    return `${label} 至少需要配置 1 行师资。`;
  }

  for (const row of rows) {
    const rowLabel = `${label}：${row.typeLabel}${row.stageLabel}`;

    const teacherCountResult = parseRequiredNumber(row.teacherCount, `${rowLabel}人数`, { min: 0 });
    if (!teacherCountResult.ok) {
      return teacherCountResult.message;
    }

    const weeklyClassesResult = parseRequiredNumber(row.weeklyClasses, `${rowLabel}周课次`, {
      min: 0,
    });
    if (!weeklyClassesResult.ok) {
      return weeklyClassesResult.message;
    }
  }

  return "";
}

function summarizeTeacherStageRows(rows) {
  const totalTeachers = (rows || []).reduce(
    (sum, row) => sum + Math.max(0, Number(row.teacherCount) || 0),
    0
  );
  const weeklySupplyClasses = (rows || []).reduce(
    (sum, row) =>
      sum +
      Math.max(0, Number(row.teacherCount) || 0) * Math.max(0, Number(row.weeklyClasses) || 0),
    0
  );
  const regularFullTimeRow = (rows || []).find(
    (row) => row.typeKey === "full_time" && row.stageKey === "regular"
  );
  const fullTimeWeeklyClasses = (rows || [])
    .filter((row) => row.typeKey === "full_time")
    .map((row) => Math.max(0, Number(row.weeklyClasses) || 0));
  const allWeeklyClasses = (rows || []).map((row) => Math.max(0, Number(row.weeklyClasses) || 0));
  const shortageTeacherBaseline =
    Math.max(0, Number(regularFullTimeRow?.weeklyClasses) || 0) ||
    Math.max(0, ...fullTimeWeeklyClasses) ||
    Math.max(0, ...allWeeklyClasses) ||
    1;

  return {
    totalTeachers,
    weeklySupplyClasses,
    shortageTeacherBaseline,
  };
}

function getTeacherTypeBaseline(rows, typeKey) {
  const regularRow = (rows || []).find((row) => row.typeKey === typeKey && row.stageKey === "regular");
  const regularCapacity = Math.max(0, Number(regularRow?.weeklyClasses) || 0);

  if (regularCapacity > 0) {
    return regularCapacity;
  }

  return Math.max(
    0,
    ...(rows || [])
      .filter((row) => row.typeKey === typeKey)
      .map((row) => Math.max(0, Number(row.weeklyClasses) || 0))
  );
}

function buildStaffingSuggestion(shortageTeacherCount, teacherRows) {
  if (shortageTeacherCount <= 0) {
    return {
      primaryOption: "",
      alternatives: [],
      assumption: "当前暂无明确新增缺口，暂不需要新增全职/兼职组合建议。",
    };
  }

  const fullTimeBaseline = getTeacherTypeBaseline(teacherRows, "full_time");
  const partTimeBaseline = getTeacherTypeBaseline(teacherRows, "part_time");

  if (fullTimeBaseline <= 0 && partTimeBaseline <= 0) {
    return {
      primaryOption: "",
      alternatives: [],
      assumption: "当前全职和兼职周课次基准都为 0，暂时无法按现有口径折算招聘组合。",
    };
  }

  const alternatives = [];
  let primaryOption = "";

  if (fullTimeBaseline > 0) {
    primaryOption = `${shortageTeacherCount} 个全职`;
  } else {
    primaryOption = `${Math.ceil(shortageTeacherCount)} 个兼职`;
  }

  if (fullTimeBaseline > 0 && partTimeBaseline > 0) {
    const allPartTimeCount = Math.ceil((shortageTeacherCount * fullTimeBaseline) / partTimeBaseline);
    alternatives.push(`${allPartTimeCount} 个兼职`);

    if (shortageTeacherCount >= 2) {
      const mixedPartTimeCount = Math.ceil(
        ((shortageTeacherCount - 1) * fullTimeBaseline) / partTimeBaseline
      );
      alternatives.unshift(`1 个全职 + ${mixedPartTimeCount} 个兼职`);
    }
  }

  if (!primaryOption && partTimeBaseline > 0) {
    primaryOption = `${Math.ceil(shortageTeacherCount)} 个兼职`;
  }

  return {
    primaryOption,
    alternatives: alternatives.filter((option, index, array) => option && array.indexOf(option) === index),
    assumption:
      fullTimeBaseline > 0 && partTimeBaseline > 0
        ? `按当前“全职 ${fullTimeBaseline} 班/周、兼职 ${partTimeBaseline} 班/周”的正式期口径折算，仅用于快速试算。`
        : fullTimeBaseline > 0
          ? `按当前“全职 ${fullTimeBaseline} 班/周”的正式期口径折算，仅用于快速试算。`
          : `按当前“兼职 ${partTimeBaseline} 班/周”的正式期口径折算，仅用于快速试算。`,
  };
}

function validateSimulatorForm(form, courseMode = "all") {
  if (!isValidDateString(form.period.startDate) || !isValidDateString(form.period.endDate)) {
    return "预测周期的开始日期和结束日期必须是有效日期。";
  }

  if (toDate(form.period.endDate) < toDate(form.period.startDate)) {
    return "结束日期不能早于开始日期。";
  }

  if (!SUMMARY_GRANULARITY_OPTIONS.some((option) => option.value === form.period.summaryGranularity)) {
    return "汇总维度无效。";
  }

  const courseModes =
    courseMode === "trial" || courseMode === "paid" ? [courseMode] : ["trial", "paid"];

  for (const activeCourseMode of courseModes) {
    const numberChecks =
      activeCourseMode === "trial"
        ? [
            [form.trial.assignedLeads, "体验课：预测周期分配线索数", { min: 0 }],
            [form.trial.classSize, "体验课：每班级人数", { min: 1 }],
            [form.trial.recruitmentDays, "体验课：老师招聘周期", { min: 0 }],
            [form.trial.trainingDays, "体验课：老师入职培训周期", { min: 0 }],
          ]
        : [
            [form.paid.currentStudents, "正价课：当前总在课人数", { min: 0 }],
            [form.paid.renewalDueStudents, "正价课：其中本期待续费人数", { min: 0 }],
            [form.paid.salesConvertedStarts, "正价课：预测周期销售转化入课人数", { min: 0 }],
            [form.paid.ecomStarts, "正价课：预测周期电商新签入课人数", { min: 0 }],
            [form.paid.studentWeeklyClasses, "正价课：每生周课次", { min: 0 }],
            [form.paid.classSize, "正价课：班级人数", { min: 1 }],
            [form.paid.recruitmentDays, "正价课：老师招聘周期", { min: 0 }],
            [form.paid.trainingDays, "正价课：老师入职培训周期", { min: 0 }],
          ];

    for (const [value, label, options] of numberChecks) {
      const result = parseRequiredNumber(value, label, options);
      if (!result.ok) {
        return result.message;
      }
    }

    const percentChecks =
      activeCourseMode === "trial"
        ? [[form.trial.attendRate, "体验课：预测周期到课率", { min: 0, max: PERCENTAGE_MAX }]]
        : [[form.paid.renewalChurnRate, "正价课：续费流失率", { min: 0, max: PERCENTAGE_MAX }]];

    for (const [value, label, options] of percentChecks) {
      const result = parseRequiredPercent(value, label, options);
      if (!result.ok) {
        return result.message;
      }
    }

    const teacherError =
      activeCourseMode === "trial"
        ? validateTeacherStageRows(form.trial.teacherRows, "体验课师资配置")
        : validateTeacherStageRows(form.paid.teacherRows, "正价课师资配置");
    if (teacherError) {
      return teacherError;
    }

    const weekdayRatioError =
      activeCourseMode === "trial"
        ? validateWeekdayRatioRows(form.trial.weekdayRatioRows, "体验课")
        : validateWeekdayRatioRows(form.paid.weekdayRatioRows, "正价课");
    if (weekdayRatioError) {
      return weekdayRatioError;
    }

    const slotError =
      activeCourseMode === "trial"
        ? validateSlotRows(form.trial.slotRows, "体验课")
        : validateSlotRows(form.paid.slotRows, "正价课");
    if (slotError) {
      return slotError;
    }
  }

  return "";
}

function buildOverallWarningMessage(type, warningLevel, shortageTeacherCount, gapClasses) {
  const missingClasses = Math.abs(Number(gapClasses || 0));
  const missingClassesDisplay = Number.isInteger(missingClasses)
    ? String(missingClasses)
    : formatFixed(missingClasses, 2);

  if (warningLevel === "red") {
    return `${type}师资不足，预计缺 ${shortageTeacherCount} 名老师，缺口 ${missingClassesDisplay} 个班次`;
  }

  if (warningLevel === "orange") {
    return `${type}师资接近上限，建议提前储备老师`;
  }

  if (warningLevel === "yellow") {
    return `${type}师资利用率较高，建议关注后续排班`;
  }

  return `${type}师资供给充足，暂无明显风险`;
}

function buildSlotWarningMessage(warningLevel, shortageTeacherCount) {
  if (warningLevel === "red") {
    return `该时段供给不足，预计缺 ${shortageTeacherCount} 名老师`;
  }

  if (warningLevel === "orange") {
    return "该时段已接近满载，建议预留冗余老师";
  }

  if (warningLevel === "yellow") {
    return "该时段利用率较高，建议重点关注";
  }

  return "该时段供给正常";
}

function computeSlotRows(
  courseLabel,
  courseType,
  slotRows,
  weeklyRequiredClasses,
  totalAvailableTeachers
) {
  return slotRows.map((row) => {
    const ratio = parseRequiredPercent(row.ratio, `${courseLabel} 热门时段占比`).value;
    const requiredTeachers = Math.ceil(weeklyRequiredClasses * ratio);
    const availableTeachers = Number(totalAvailableTeachers || 0);
    const slotGap = availableTeachers - requiredTeachers;
    const slotUtilization = safeDivide(requiredTeachers, availableTeachers);
    const warningLevel = getSlotWarningLevel(slotGap, slotUtilization);
    const shortageTeacherCount = slotGap >= 0 ? 0 : Math.abs(slotGap);

    return {
      courseType,
      courseLabel,
      dayOfWeek: row.dayOfWeek,
      timeRange: `${row.startTime}-${row.endTime}`,
      ratio,
      ratioDisplay: `${formatFixed(ratio * 100, 2)}%`,
      weeklyRequiredClasses,
      requiredTeachers,
      availableTeachers,
      slotGap,
      shortageTeacherCount,
      slotUtilization,
      warningLevel,
      warningMessage: buildSlotWarningMessage(warningLevel, shortageTeacherCount),
    };
  });
}

function pickHighestSlotWarning(slotRows) {
  if (!slotRows || slotRows.length === 0) {
    return null;
  }

  return slotRows
    .slice()
    .sort((left, right) => {
      const leftRank = severityRank[left.warningLevel] ?? 99;
      const rightRank = severityRank[right.warningLevel] ?? 99;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (right.shortageTeacherCount !== left.shortageTeacherCount) {
        return right.shortageTeacherCount - left.shortageTeacherCount;
      }

      return left.timeRange.localeCompare(right.timeRange);
    })[0];
}

function getCourseMeta(courseMode) {
  if (courseMode === "paid") {
    return {
      key: "paid",
      label: "正价课",
      pageTitle: "正价课师资预警",
      pageEyebrow: "正价课预警",
      pageHeading: "正价课师资轻量预测器",
      pageDescription: "聚焦“正价课师资是否够用”的快速试算。输入关键参数后，直接看正价课整体预警和热门时段风险。",
      formAction: "/forecast/simulator/paid",
      resultTitle: "正价课结果表",
      slotTitle: "正价课热门时段结果表",
      tabLabel: "正价课师资预警",
    };
  }

  return {
    key: "trial",
    label: "体验课",
    pageTitle: "体验课师资预警",
    pageEyebrow: "体验课预警",
    pageHeading: "体验课师资轻量预测器",
    pageDescription: "聚焦“体验课师资是否够用”的快速试算。输入关键参数后，直接看体验课整体预警和热门时段风险。",
    formAction: "/forecast/simulator/trial",
    resultTitle: "体验课结果表",
    slotTitle: "体验课热门时段结果表",
    tabLabel: "体验课师资预警",
  };
}

function calculateSimulatorResults(form) {
  const weekCount = computeWeekCount(form.period.startDate, form.period.endDate);
  const calendarWeekUnits = computeWeekUnits(form.period.startDate, form.period.endDate);
  const dayCount = diffDaysInclusive(form.period.startDate, form.period.endDate);
  const trialWeekUnits = computeWeightedWeekUnits(
    form.period.startDate,
    form.period.endDate,
    form.trial.weekdayRatioRows
  );
  const paidWeekUnits = computeWeightedWeekUnits(
    form.period.startDate,
    form.period.endDate,
    form.paid.weekdayRatioRows
  );

  const trialAssignedLeads = Number(form.trial.assignedLeads);
  const trialAttendRate = parseRequiredPercent(form.trial.attendRate, "体验课到课率").value;
  const trialClassSize = Number(form.trial.classSize);
  const trialRecruitmentDays = Number(form.trial.recruitmentDays);
  const trialTrainingDays = Number(form.trial.trainingDays);
  const trialTeacherSummary = summarizeTeacherStageRows(form.trial.teacherRows);

  const trialArrivals = roundTo(trialAssignedLeads * trialAttendRate, 2);
  const trialRequiredClasses = trialArrivals > 0 ? Math.ceil(trialArrivals / trialClassSize) : 0;
  const trialSupplyClasses = roundTo(trialTeacherSummary.weeklySupplyClasses * trialWeekUnits, 2);
  const trialGapClasses = roundTo(trialSupplyClasses - trialRequiredClasses, 2);
  const trialWeeklyRequiredClasses =
    trialRequiredClasses > 0 && trialWeekUnits > 0 ? Math.ceil(trialRequiredClasses / trialWeekUnits) : 0;
  const trialSlotRatioSum = sumSlotRatios(form.trial.slotRows);
  const trialUtilization = safeDivide(trialRequiredClasses, trialSupplyClasses);
  const trialWarningLevel = getUtilizationWarningLevel(trialUtilization);
  const trialGapTeachers =
    trialGapClasses >= 0
      ? 0
      : Math.ceil(Math.abs(trialGapClasses) / trialTeacherSummary.shortageTeacherBaseline);

  const paidCurrentStudents = Number(form.paid.currentStudents);
  const paidRenewalDueStudents = Number(form.paid.renewalDueStudents);
  const paidRenewalChurnRate = parseRequiredPercent(
    form.paid.renewalChurnRate,
    "正价课续费流失率"
  ).value;
  const paidSalesConvertedStarts = Number(form.paid.salesConvertedStarts);
  const paidEcomStarts = Number(form.paid.ecomStarts);
  const paidStudentWeeklyClasses = Number(form.paid.studentWeeklyClasses);
  const paidClassSize = Number(form.paid.classSize);
  const paidRecruitmentDays = Number(form.paid.recruitmentDays);
  const paidTrainingDays = Number(form.paid.trainingDays);
  const paidTeacherSummary = summarizeTeacherStageRows(form.paid.teacherRows);

  const renewalLostStudents = roundTo(paidRenewalDueStudents * paidRenewalChurnRate, 2);
  const paidProjectedStudents = roundTo(
    paidCurrentStudents - renewalLostStudents + paidSalesConvertedStarts + paidEcomStarts,
    2
  );
  const paidRequiredClasses =
    paidProjectedStudents > 0
      ? Math.ceil((paidProjectedStudents * paidStudentWeeklyClasses * paidWeekUnits) / paidClassSize)
      : 0;
  const paidSupplyClasses = roundTo(paidTeacherSummary.weeklySupplyClasses * paidWeekUnits, 2);
  const paidGapClasses = roundTo(paidSupplyClasses - paidRequiredClasses, 2);
  const paidWeeklyRequiredClasses =
    paidRequiredClasses > 0 && paidWeekUnits > 0 ? Math.ceil(paidRequiredClasses / paidWeekUnits) : 0;
  const paidSlotRatioSum = sumSlotRatios(form.paid.slotRows);
  const paidUtilization = safeDivide(paidRequiredClasses, paidSupplyClasses);
  const paidWarningLevel = getUtilizationWarningLevel(paidUtilization);
  const paidGapTeachers =
    paidGapClasses >= 0
      ? 0
      : Math.ceil(Math.abs(paidGapClasses) / paidTeacherSummary.shortageTeacherBaseline);

  const trialSlotRows = computeSlotRows(
    "体验课",
    "trial",
    form.trial.slotRows,
    trialWeeklyRequiredClasses,
    trialTeacherSummary.totalTeachers
  );
  const paidSlotRows = computeSlotRows(
    "正价课",
    "paid",
    form.paid.slotRows,
    paidWeeklyRequiredClasses,
    paidTeacherSummary.totalTeachers
  );
  const allSlotRows = [...trialSlotRows, ...paidSlotRows];
  const highestSlotWarning = pickHighestSlotWarning(allSlotRows);
  const trialShortageStartDate = form.period.startDate;
  const paidShortageStartDate = form.period.startDate;
  const trialLeadDays = trialRecruitmentDays + trialTrainingDays;
  const paidLeadDays = paidRecruitmentDays + paidTrainingDays;
  const trialRecruitStartDate = subtractDays(trialShortageStartDate, trialLeadDays);
  const paidRecruitStartDate = subtractDays(paidShortageStartDate, paidLeadDays);
  const trialStaffingSuggestion = buildStaffingSuggestion(trialGapTeachers, form.trial.teacherRows);
  const paidStaffingSuggestion = buildStaffingSuggestion(paidGapTeachers, form.paid.teacherRows);

  return {
    cycleSummary: {
      startDate: form.period.startDate,
      endDate: form.period.endDate,
      rangeLabel: formatRangeLabel(form.period.startDate, form.period.endDate),
      weekCount,
      calendarWeekUnits,
      calendarWeekUnitsDisplay: formatFixed(calendarWeekUnits, 2),
      dayCount,
      summaryGranularity: form.period.summaryGranularity,
    },
    notes: [
      `当前轻量版先按整体预测周期汇总输出，本次预测周期共 ${dayCount} 天，日历折算为 ${formatFixed(calendarWeekUnits, 2)} 周。`,
      "正价课预计承载人数按“当前在课底盘 - 续费流失人数 + 预测新增入课人数”计算，避免把待续费学员重复计入。",
      "热门时段按周均需求老师数试算，不直接拿整个预测周期总班次数与单周老师供给比较。",
      "未配置的剩余时段占比会视为普通时段，当前不单独展开预测。",
      "整体结果会按“周一到周日班次占比”折算有效周数；若某天未填写占比，默认视为 0%。",
      "当前轻量版仍未单独录入老师在周一到周日的不同供给能力，因此整体供给先按班次占比近似拆分，不等同于真实排班能力。",
      "热门时段供给当前按“该课程类型所有老师均可参与该时段供给”进行快速试算，这不是实际排班能力。",
    ],
    trial: {
      arrivals: trialArrivals,
      requiredClasses: trialRequiredClasses,
      weeklyRequiredClasses: trialWeeklyRequiredClasses,
      slotRatioSum: trialSlotRatioSum,
      slotRatioSumDisplay: `${formatFixed(trialSlotRatioSum * 100, 2)}%`,
      remainingOrdinaryRatio: roundTo(Math.max(0, 1 - trialSlotRatioSum), 2),
      remainingOrdinaryRatioDisplay: `${formatFixed(
        Math.max(0, 1 - trialSlotRatioSum) * 100,
        2
      )}%`,
      supplyClasses: trialSupplyClasses,
      gapClasses: trialGapClasses,
      shortageTeacherCount: trialGapTeachers,
      shortageStartDate: trialShortageStartDate,
      recruitmentDays: trialRecruitmentDays,
      trainingDays: trialTrainingDays,
      teacherRows: form.trial.teacherRows,
      weekdayRatioRows: form.trial.weekdayRatioRows,
      totalTeachers: trialTeacherSummary.totalTeachers,
      weeklySupplyClasses: trialTeacherSummary.weeklySupplyClasses,
      weekUnits: trialWeekUnits,
      weekUnitsDisplay: formatFixed(trialWeekUnits, 2),
      recruitLeadDays: trialLeadDays,
      latestRecruitStartDate: trialRecruitStartDate,
      staffingSuggestion: trialStaffingSuggestion,
      utilization: trialUtilization,
      warningLevel: trialWarningLevel,
      warningMessage: buildOverallWarningMessage(
        "体验课",
        trialWarningLevel,
        trialGapTeachers,
        trialGapClasses
      ),
      hiringMessage:
        trialWarningLevel === "red" || trialWarningLevel === "orange"
          ? `若预计在 ${trialShortageStartDate} 出现缺口，需至少提前 ${trialLeadDays} 天启动招聘，其中招聘 ${trialRecruitmentDays} 天、培训 ${trialTrainingDays} 天；最晚建议在 ${trialRecruitStartDate} 前启动。`
          : `当前暂无明确新增招聘缺口；如需为旺季预留冗余，建议仍按“招聘 ${trialRecruitmentDays} 天 + 培训 ${trialTrainingDays} 天”至少提前 ${trialLeadDays} 天准备。`,
    },
    paid: {
      renewalLostStudents,
      newProjectedStarts: roundTo(paidSalesConvertedStarts + paidEcomStarts, 2),
      projectedStudents: paidProjectedStudents,
      requiredClasses: paidRequiredClasses,
      weeklyRequiredClasses: paidWeeklyRequiredClasses,
      slotRatioSum: paidSlotRatioSum,
      slotRatioSumDisplay: `${formatFixed(paidSlotRatioSum * 100, 2)}%`,
      remainingOrdinaryRatio: roundTo(Math.max(0, 1 - paidSlotRatioSum), 2),
      remainingOrdinaryRatioDisplay: `${formatFixed(
        Math.max(0, 1 - paidSlotRatioSum) * 100,
        2
      )}%`,
      supplyClasses: paidSupplyClasses,
      gapClasses: paidGapClasses,
      shortageTeacherCount: paidGapTeachers,
      shortageStartDate: paidShortageStartDate,
      recruitmentDays: paidRecruitmentDays,
      trainingDays: paidTrainingDays,
      teacherRows: form.paid.teacherRows,
      weekdayRatioRows: form.paid.weekdayRatioRows,
      totalTeachers: paidTeacherSummary.totalTeachers,
      weeklySupplyClasses: paidTeacherSummary.weeklySupplyClasses,
      weekUnits: paidWeekUnits,
      weekUnitsDisplay: formatFixed(paidWeekUnits, 2),
      recruitLeadDays: paidLeadDays,
      latestRecruitStartDate: paidRecruitStartDate,
      staffingSuggestion: paidStaffingSuggestion,
      utilization: paidUtilization,
      warningLevel: paidWarningLevel,
      warningMessage: buildOverallWarningMessage(
        "正价课",
        paidWarningLevel,
        paidGapTeachers,
        paidGapClasses
      ),
      hiringMessage:
        paidWarningLevel === "red" || paidWarningLevel === "orange"
          ? `若预计在 ${paidShortageStartDate} 出现缺口，需至少提前 ${paidLeadDays} 天启动招聘，其中招聘 ${paidRecruitmentDays} 天、培训 ${paidTrainingDays} 天；最晚建议在 ${paidRecruitStartDate} 前启动。`
          : `当前暂无明确新增招聘缺口；如需为后续开班预留冗余，建议仍按“招聘 ${paidRecruitmentDays} 天 + 培训 ${paidTrainingDays} 天”至少提前 ${paidLeadDays} 天准备。`,
    },
    slotRows: allSlotRows.sort((left, right) => {
      const leftRank = severityRank[left.warningLevel] ?? 99;
      const rightRank = severityRank[right.warningLevel] ?? 99;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (right.shortageTeacherCount !== left.shortageTeacherCount) {
        return right.shortageTeacherCount - left.shortageTeacherCount;
      }

      if (left.courseType !== right.courseType) {
        return left.courseType.localeCompare(right.courseType);
      }

      return left.dayOfWeek.localeCompare(right.dayOfWeek);
    }),
    highestSlotWarning,
  };
}

function buildSimulatorViewModel(options = {}) {
  const courseMode = options.courseMode === "paid" ? "paid" : "trial";
  const simulatorForm = options.simulatorForm || buildDefaultSimulatorForm();
  const result = options.result || null;
  const courseMeta = getCourseMeta(courseMode);
  const slotRows = result ? result.slotRows.filter((row) => row.courseType === courseMode) : [];
  const predictorTabs = [
    {
      key: "trial",
      label: "体验课师资预警",
      href: "/forecast/simulator/trial",
    },
    {
      key: "paid",
      label: "正价课师资预警",
      href: "/forecast/simulator/paid",
    },
    {
      key: "headteacher",
      label: "班主任预警",
      href: "/forecast/headteacher-simulator",
    },
  ];

  return {
    pageTitle: courseMeta.pageTitle,
    activeNav: "simulator",
    simulatorForm,
    errorMessage: options.errorMessage || "",
    result,
    showSettingsExpanded:
      typeof options.showSettingsExpanded === "boolean"
        ? options.showSettingsExpanded
        : !result || Boolean(options.errorMessage),
    courseMode,
    courseMeta,
    slotRows,
    highestSlotWarningByCourse: pickHighestSlotWarning(slotRows),
    predictorTabs,
    activePredictorTab: courseMode,
    courseTabs: predictorTabs,
    weekdayOptions: WEEKDAY_OPTIONS,
    summaryGranularityOptions: SUMMARY_GRANULARITY_OPTIONS,
    teacherStageDefinitions: TEACHER_STAGE_DEFINITIONS,
  };
}

module.exports = {
  buildDefaultSimulatorForm,
  hydrateSimulatorForm,
  buildSimulatorViewModel,
  normalizeSimulatorInput,
  validateSimulatorForm,
  calculateSimulatorResults,
  WEEKDAY_OPTIONS,
  SUMMARY_GRANULARITY_OPTIONS,
};
