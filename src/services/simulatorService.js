const { getUtilizationWarningLevel, getSlotWarningLevel } = require("./forecastService");

const WEEKDAY_OPTIONS = [
  { value: "周一", label: "周一" },
  { value: "周二", label: "周二" },
  { value: "周三", label: "周三" },
  { value: "周四", label: "周四" },
  { value: "周五", label: "周五" },
  { value: "周六", label: "周六" },
  { value: "周日", label: "周日" },
];

const SUMMARY_GRANULARITY_OPTIONS = [
  { value: "week", label: "按周" },
  { value: "month", label: "按月" },
];

const severityRank = { red: 0, orange: 1, yellow: 2, green: 3 };

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

function buildDefaultSlotRows(rows) {
  if (rows && rows.length > 0) {
    return rows;
  }

  return [
    { dayOfWeek: "周三", startTime: "18:00", endTime: "19:00", ratio: "0.40" },
    { dayOfWeek: "周三", startTime: "19:00", endTime: "20:00", ratio: "0.30" },
    { dayOfWeek: "周六", startTime: "10:00", endTime: "11:00", ratio: "0.30" },
  ];
}

function buildDefaultSimulatorForm() {
  return {
    period: {
      startDate: "2026-05-01",
      endDate: "2026-05-28",
      summaryGranularity: "week",
    },
    trial: {
      assignedLeads: "320",
      attendRate: "0.65",
      classSize: "4",
      recruitmentDays: "7",
      trainingDays: "14",
      fullTimeTeachers: "3",
      fullTimeWeeklyClasses: "18",
      partTimeTeachers: "2",
      partTimeWeeklyClasses: "8",
      slotRows: buildDefaultSlotRows(),
    },
    paid: {
      currentStudents: "180",
      renewalDueStudents: "36",
      renewalChurnRate: "0.20",
      salesConvertedStarts: "42",
      ecomStarts: "24",
      studentWeeklyClasses: "2",
      classSize: "6",
      recruitmentDays: "10",
      trainingDays: "21",
      fullTimeTeachers: "4",
      fullTimeWeeklyClasses: "14",
      partTimeTeachers: "2",
      partTimeWeeklyClasses: "6",
      slotRows: buildDefaultSlotRows([
        { dayOfWeek: "周二", startTime: "19:00", endTime: "20:00", ratio: "0.35" },
        { dayOfWeek: "周四", startTime: "19:00", endTime: "20:00", ratio: "0.35" },
        { dayOfWeek: "周六", startTime: "09:00", endTime: "10:00", ratio: "0.30" },
      ]),
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

function normalizeSlotRows(body, prefix, fallbackRows) {
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
    const dayOfWeek = String(dayValues[index] ?? "").trim();
    const startTime = String(startValues[index] ?? "").trim();
    const endTime = String(endValues[index] ?? "").trim();
    const ratio = String(ratioValues[index] ?? "").trim();

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

  return buildDefaultSlotRows(rows.length > 0 ? rows : fallbackRows);
}

function normalizeSimulatorInput(body = {}) {
  const defaults = buildDefaultSimulatorForm();

  return {
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
      fullTimeTeachers: String(body.trial_full_time_teachers ?? defaults.trial.fullTimeTeachers).trim(),
      fullTimeWeeklyClasses: String(
        body.trial_full_time_weekly_classes ?? defaults.trial.fullTimeWeeklyClasses
      ).trim(),
      partTimeTeachers: String(body.trial_part_time_teachers ?? defaults.trial.partTimeTeachers).trim(),
      partTimeWeeklyClasses: String(
        body.trial_part_time_weekly_classes ?? defaults.trial.partTimeWeeklyClasses
      ).trim(),
      slotRows: normalizeSlotRows(body, "trial", defaults.trial.slotRows),
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
      fullTimeTeachers: String(body.paid_full_time_teachers ?? defaults.paid.fullTimeTeachers).trim(),
      fullTimeWeeklyClasses: String(
        body.paid_full_time_weekly_classes ?? defaults.paid.fullTimeWeeklyClasses
      ).trim(),
      partTimeTeachers: String(body.paid_part_time_teachers ?? defaults.paid.partTimeTeachers).trim(),
      partTimeWeeklyClasses: String(
        body.paid_part_time_weekly_classes ?? defaults.paid.partTimeWeeklyClasses
      ).trim(),
      slotRows: normalizeSlotRows(body, "paid", defaults.paid.slotRows),
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
  return /^\d{2}:\d{2}$/.test(String(value || ""));
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

function validateSlotRows(rows, label) {
  if (!rows || rows.length === 0) {
    return `${label} 至少需要配置 1 个热门时段。`;
  }

  let ratioSum = 0;

  for (const row of rows) {
    if (!row.dayOfWeek) {
      return `${label} 的热门时段配置必须填写周几。`;
    }

    if (!isValidTimeString(row.startTime) || !isValidTimeString(row.endTime)) {
      return `${label} 的热门时段开始时间和结束时间必须是 HH:MM。`;
    }

    if (row.startTime >= row.endTime) {
      return `${label} 的热门时段开始时间必须早于结束时间。`;
    }

    const ratioResult = parseRequiredNumber(row.ratio, `${label} 热门时段占比`, {
      min: 0,
      max: 1,
    });

    if (!ratioResult.ok) {
      return ratioResult.message;
    }

    ratioSum += ratioResult.value;
  }

  if (ratioSum > 1.000001) {
    return `${label} 热门时段占比合计不能超过 1，当前为 ${roundTo(ratioSum, 2)}。未配置的剩余占比会视为普通时段。`;
  }

  return "";
}

function sumSlotRatios(rows) {
  return roundTo(
    (rows || []).reduce((sum, row) => sum + Number(row.ratio || 0), 0),
    2
  );
}

function validateSimulatorForm(form) {
  if (!isValidDateString(form.period.startDate) || !isValidDateString(form.period.endDate)) {
    return "预测周期的开始日期和结束日期必须是有效日期。";
  }

  if (toDate(form.period.endDate) < toDate(form.period.startDate)) {
    return "结束日期不能早于开始日期。";
  }

  if (!SUMMARY_GRANULARITY_OPTIONS.some((option) => option.value === form.period.summaryGranularity)) {
    return "汇总维度无效。";
  }

  const numberChecks = [
    [form.trial.assignedLeads, "体验课：预测周期分配线索数", { min: 0 }],
    [form.trial.attendRate, "体验课：预测周期到课率", { min: 0, max: 1 }],
    [form.trial.classSize, "体验课：每班级人数", { min: 1 }],
    [form.trial.recruitmentDays, "体验课：老师招聘周期", { min: 0 }],
    [form.trial.trainingDays, "体验课：老师入职培训周期", { min: 0 }],
    [form.trial.fullTimeTeachers, "体验课：全职老师数", { min: 0 }],
    [form.trial.fullTimeWeeklyClasses, "体验课：全职单师周带班数", { min: 1 }],
    [form.trial.partTimeTeachers, "体验课：兼职老师数", { min: 0 }],
    [form.trial.partTimeWeeklyClasses, "体验课：兼职单师周带班数", { min: 0 }],
    [form.paid.currentStudents, "正价课：当前总在课人数", { min: 0 }],
    [form.paid.renewalDueStudents, "正价课：其中本期待续费人数", { min: 0 }],
    [form.paid.renewalChurnRate, "正价课：续费流失率", { min: 0, max: 1 }],
    [form.paid.salesConvertedStarts, "正价课：预测周期销售转化入课人数", { min: 0 }],
    [form.paid.ecomStarts, "正价课：预测周期电商新签入课人数", { min: 0 }],
    [form.paid.studentWeeklyClasses, "正价课：每生周课次", { min: 0 }],
    [form.paid.classSize, "正价课：班级人数", { min: 1 }],
    [form.paid.recruitmentDays, "正价课：老师招聘周期", { min: 0 }],
    [form.paid.trainingDays, "正价课：老师入职培训周期", { min: 0 }],
    [form.paid.fullTimeTeachers, "正价课：全职老师数", { min: 0 }],
    [form.paid.fullTimeWeeklyClasses, "正价课：全职单师周带班数", { min: 1 }],
    [form.paid.partTimeTeachers, "正价课：兼职老师数", { min: 0 }],
    [form.paid.partTimeWeeklyClasses, "正价课：兼职单师周带班数", { min: 0 }],
  ];

  for (const [value, label, options] of numberChecks) {
    const result = parseRequiredNumber(value, label, options);
    if (!result.ok) {
      return result.message;
    }
  }

  const trialSlotError = validateSlotRows(form.trial.slotRows, "体验课");
  if (trialSlotError) {
    return trialSlotError;
  }

  const paidSlotError = validateSlotRows(form.paid.slotRows, "正价课");
  if (paidSlotError) {
    return paidSlotError;
  }

  return "";
}

function buildOverallWarningMessage(type, warningLevel, shortageTeacherCount, gapClasses) {
  const missingClasses = Math.abs(Number(gapClasses || 0));

  if (warningLevel === "red") {
    return `${type}师资不足，预计缺 ${shortageTeacherCount} 名老师，缺口 ${missingClasses} 个班次`;
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
    const ratio = Number(row.ratio || 0);
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
      ratio: roundTo(ratio, 2),
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

  const trialAssignedLeads = Number(form.trial.assignedLeads);
  const trialAttendRate = Number(form.trial.attendRate);
  const trialClassSize = Number(form.trial.classSize);
  const trialRecruitmentDays = Number(form.trial.recruitmentDays);
  const trialTrainingDays = Number(form.trial.trainingDays);
  const trialFullTimeTeachers = Number(form.trial.fullTimeTeachers);
  const trialFullTimeWeeklyClasses = Number(form.trial.fullTimeWeeklyClasses);
  const trialPartTimeTeachers = Number(form.trial.partTimeTeachers);
  const trialPartTimeWeeklyClasses = Number(form.trial.partTimeWeeklyClasses);

  const trialArrivals = roundTo(trialAssignedLeads * trialAttendRate, 2);
  const trialRequiredClasses = trialArrivals > 0 ? Math.ceil(trialArrivals / trialClassSize) : 0;
  const trialSupplyClasses =
    (trialFullTimeTeachers * trialFullTimeWeeklyClasses +
      trialPartTimeTeachers * trialPartTimeWeeklyClasses) *
    weekCount;
  const trialGapClasses = trialSupplyClasses - trialRequiredClasses;
  const trialWeeklyRequiredClasses =
    trialRequiredClasses > 0 ? Math.ceil(trialRequiredClasses / weekCount) : 0;
  const trialSlotRatioSum = sumSlotRatios(form.trial.slotRows);
  const trialUtilization = safeDivide(trialRequiredClasses, trialSupplyClasses);
  const trialWarningLevel = getUtilizationWarningLevel(trialUtilization);
  const trialGapTeachers =
    trialGapClasses >= 0 ? 0 : Math.ceil(Math.abs(trialGapClasses) / trialFullTimeWeeklyClasses);

  const paidCurrentStudents = Number(form.paid.currentStudents);
  const paidRenewalDueStudents = Number(form.paid.renewalDueStudents);
  const paidRenewalChurnRate = Number(form.paid.renewalChurnRate);
  const paidSalesConvertedStarts = Number(form.paid.salesConvertedStarts);
  const paidEcomStarts = Number(form.paid.ecomStarts);
  const paidStudentWeeklyClasses = Number(form.paid.studentWeeklyClasses);
  const paidClassSize = Number(form.paid.classSize);
  const paidRecruitmentDays = Number(form.paid.recruitmentDays);
  const paidTrainingDays = Number(form.paid.trainingDays);
  const paidFullTimeTeachers = Number(form.paid.fullTimeTeachers);
  const paidFullTimeWeeklyClasses = Number(form.paid.fullTimeWeeklyClasses);
  const paidPartTimeTeachers = Number(form.paid.partTimeTeachers);
  const paidPartTimeWeeklyClasses = Number(form.paid.partTimeWeeklyClasses);

  const renewalLostStudents = roundTo(paidRenewalDueStudents * paidRenewalChurnRate, 2);
  const paidProjectedStudents = roundTo(
    paidCurrentStudents - renewalLostStudents + paidSalesConvertedStarts + paidEcomStarts,
    2
  );
  const paidRequiredClasses =
    paidProjectedStudents > 0
      ? Math.ceil((paidProjectedStudents * paidStudentWeeklyClasses * weekCount) / paidClassSize)
      : 0;
  const paidSupplyClasses =
    (paidFullTimeTeachers * paidFullTimeWeeklyClasses +
      paidPartTimeTeachers * paidPartTimeWeeklyClasses) *
    weekCount;
  const paidGapClasses = paidSupplyClasses - paidRequiredClasses;
  const paidWeeklyRequiredClasses =
    paidRequiredClasses > 0 ? Math.ceil(paidRequiredClasses / weekCount) : 0;
  const paidSlotRatioSum = sumSlotRatios(form.paid.slotRows);
  const paidUtilization = safeDivide(paidRequiredClasses, paidSupplyClasses);
  const paidWarningLevel = getUtilizationWarningLevel(paidUtilization);
  const paidGapTeachers =
    paidGapClasses >= 0 ? 0 : Math.ceil(Math.abs(paidGapClasses) / paidFullTimeWeeklyClasses);

  const trialSlotRows = computeSlotRows(
    "体验课",
    "trial",
    form.trial.slotRows,
    trialWeeklyRequiredClasses,
    trialFullTimeTeachers + trialPartTimeTeachers
  );
  const paidSlotRows = computeSlotRows(
    "正价课",
    "paid",
    form.paid.slotRows,
    paidWeeklyRequiredClasses,
    paidFullTimeTeachers + paidPartTimeTeachers
  );
  const allSlotRows = [...trialSlotRows, ...paidSlotRows];
  const highestSlotWarning = pickHighestSlotWarning(allSlotRows);
  const trialShortageStartDate = form.period.startDate;
  const paidShortageStartDate = form.period.startDate;
  const trialLeadDays = trialRecruitmentDays + trialTrainingDays;
  const paidLeadDays = paidRecruitmentDays + paidTrainingDays;
  const trialRecruitStartDate = subtractDays(trialShortageStartDate, trialLeadDays);
  const paidRecruitStartDate = subtractDays(paidShortageStartDate, paidLeadDays);

  return {
    cycleSummary: {
      startDate: form.period.startDate,
      endDate: form.period.endDate,
      rangeLabel: formatRangeLabel(form.period.startDate, form.period.endDate),
      weekCount,
      dayCount: diffDaysInclusive(form.period.startDate, form.period.endDate),
      summaryGranularity: form.period.summaryGranularity,
    },
    notes: [
      `当前轻量版先按整体预测周期汇总输出，预测周期共 ${weekCount} 周。`,
      "正价课预计承载人数按“当前在课底盘 - 续费流失人数 + 预测新增入课人数”计算，避免把待续费学员重复计入。",
      "热门时段按周均需求老师数试算，不直接拿整个预测周期总班次数与单周老师供给比较。",
      "未配置的剩余时段占比会视为普通时段，当前不单独展开预测。",
      "热门时段供给当前按“该课程类型所有老师均可参与该时段供给”进行快速试算，这不是实际排班能力。",
    ],
    trial: {
      arrivals: trialArrivals,
      requiredClasses: trialRequiredClasses,
      weeklyRequiredClasses: trialWeeklyRequiredClasses,
      slotRatioSum: trialSlotRatioSum,
      remainingOrdinaryRatio: roundTo(Math.max(0, 1 - trialSlotRatioSum), 2),
      supplyClasses: trialSupplyClasses,
      gapClasses: trialGapClasses,
      shortageTeacherCount: trialGapTeachers,
      shortageStartDate: trialShortageStartDate,
      recruitmentDays: trialRecruitmentDays,
      trainingDays: trialTrainingDays,
      recruitLeadDays: trialLeadDays,
      latestRecruitStartDate: trialRecruitStartDate,
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
      remainingOrdinaryRatio: roundTo(Math.max(0, 1 - paidSlotRatioSum), 2),
      supplyClasses: paidSupplyClasses,
      gapClasses: paidGapClasses,
      shortageTeacherCount: paidGapTeachers,
      shortageStartDate: paidShortageStartDate,
      recruitmentDays: paidRecruitmentDays,
      trainingDays: paidTrainingDays,
      recruitLeadDays: paidLeadDays,
      latestRecruitStartDate: paidRecruitStartDate,
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

  return {
    pageTitle: courseMeta.pageTitle,
    activeNav: "simulator",
    simulatorForm,
    errorMessage: options.errorMessage || "",
    result,
    courseMode,
    courseMeta,
    slotRows,
    highestSlotWarningByCourse: pickHighestSlotWarning(slotRows),
    courseTabs: [
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
    ],
    weekdayOptions: WEEKDAY_OPTIONS,
    summaryGranularityOptions: SUMMARY_GRANULARITY_OPTIONS,
  };
}

module.exports = {
  buildDefaultSimulatorForm,
  buildSimulatorViewModel,
  normalizeSimulatorInput,
  validateSimulatorForm,
  calculateSimulatorResults,
  WEEKDAY_OPTIONS,
  SUMMARY_GRANULARITY_OPTIONS,
};
