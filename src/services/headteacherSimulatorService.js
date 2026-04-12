const { getUtilizationWarningLevel } = require("./forecastService");

const NEW_TOGGLE_OPTIONS = [
  { value: "是", label: "是" },
  { value: "否", label: "否" },
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
  return formatFixed(shouldUpgradeLegacyFraction ? parsed * 100 : parsed, 2);
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

function isValidMonthString(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) {
    return false;
  }

  const [year, month] = String(value)
    .split("-")
    .map((part) => Number(part));

  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

function addMonths(monthString, offset) {
  const [year, month] = String(monthString)
    .split("-")
    .map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
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
  const numberResult = parseRequiredNumber(
    String(value ?? "").trim().replace(/[%％]/g, ""),
    label,
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

function buildDefaultHeadteacherRows(rows) {
  if (rows && rows.length > 0) {
    return rows;
  }

  return [
    {
      name: "李老师",
      currentStudents: "235",
      serviceLimit: "250",
      canTakeNew: "是",
      newCapacity: "20",
      notes: "成熟班主任",
    },
    {
      name: "周老师",
      currentStudents: "220",
      serviceLimit: "250",
      canTakeNew: "否",
      newCapacity: "0",
      notes: "本月以稳班为主",
    },
    {
      name: "陈老师",
      currentStudents: "185",
      serviceLimit: "250",
      canTakeNew: "是",
      newCapacity: "35",
      notes: "可承担接新",
    },
    {
      name: "王老师",
      currentStudents: "120",
      serviceLimit: "250",
      canTakeNew: "是",
      newCapacity: "25",
      notes: "新到岗，接新爬坡中",
    },
  ];
}

function buildDefaultHeadteacherSimulatorForm() {
  return {
    formVersion: 2,
    period: {
      forecastMonth: "2026-05",
    },
    students: {
      currentTotalStudents: "860",
      renewalDueStudents: "90",
      renewalChurnRate: "50.00",
      monthlyEcomNewStudents: "70",
      monthlySalesNewStudents: "55",
    },
    team: {
      defaultServiceLimit: "250",
      defaultNewIntakeLimit: "30",
      rows: buildDefaultHeadteacherRows(),
    },
  };
}

function hydrateHeadteacherSimulatorForm(savedForm) {
  const defaults = buildDefaultHeadteacherSimulatorForm();
  const upgradeLegacyFraction = Number(savedForm?.formVersion || 0) < 2;

  if (!savedForm) {
    return defaults;
  }

  return {
    formVersion: 2,
    period: {
      forecastMonth: String(savedForm.period?.forecastMonth ?? defaults.period.forecastMonth).trim(),
    },
    students: {
      currentTotalStudents: String(
        savedForm.students?.currentTotalStudents ?? defaults.students.currentTotalStudents
      ).trim(),
      renewalDueStudents: String(
        savedForm.students?.renewalDueStudents ?? defaults.students.renewalDueStudents
      ).trim(),
      renewalChurnRate: normalizePercentString(
        savedForm.students?.renewalChurnRate,
        defaults.students.renewalChurnRate,
        { upgradeLegacyFraction }
      ),
      monthlyEcomNewStudents: String(
        savedForm.students?.monthlyEcomNewStudents ?? defaults.students.monthlyEcomNewStudents
      ).trim(),
      monthlySalesNewStudents: String(
        savedForm.students?.monthlySalesNewStudents ?? defaults.students.monthlySalesNewStudents
      ).trim(),
    },
    team: {
      defaultServiceLimit: String(
        savedForm.team?.defaultServiceLimit ?? defaults.team.defaultServiceLimit
      ).trim(),
      defaultNewIntakeLimit: String(
        savedForm.team?.defaultNewIntakeLimit ?? defaults.team.defaultNewIntakeLimit
      ).trim(),
      rows: buildDefaultHeadteacherRows(
        (savedForm.team?.rows || defaults.team.rows).map((row, index) => ({
          name: String(row?.name ?? defaults.team.rows[index]?.name ?? "").trim(),
          currentStudents: String(
            row?.currentStudents ?? defaults.team.rows[index]?.currentStudents ?? ""
          ).trim(),
          serviceLimit: String(
            row?.serviceLimit ?? defaults.team.rows[index]?.serviceLimit ?? ""
          ).trim(),
          canTakeNew: String(row?.canTakeNew ?? defaults.team.rows[index]?.canTakeNew ?? "否").trim(),
          newCapacity: String(
            row?.newCapacity ?? defaults.team.rows[index]?.newCapacity ?? ""
          ).trim(),
          notes: String(row?.notes ?? defaults.team.rows[index]?.notes ?? "").trim(),
        }))
      ),
    },
  };
}

function normalizeHeadteacherRows(body, fallbackRows) {
  const nameValues = toArray(body["ht_name[]"] ?? body.ht_name);
  const currentStudentsValues = toArray(
    body["ht_current_students[]"] ?? body.ht_current_students
  );
  const serviceLimitValues = toArray(body["ht_service_limit[]"] ?? body.ht_service_limit);
  const canTakeNewValues = toArray(body["ht_can_take_new[]"] ?? body.ht_can_take_new);
  const newCapacityValues = toArray(body["ht_new_capacity[]"] ?? body.ht_new_capacity);
  const noteValues = toArray(body["ht_notes[]"] ?? body.ht_notes);
  const rowCount = Math.max(
    nameValues.length,
    currentStudentsValues.length,
    serviceLimitValues.length,
    canTakeNewValues.length,
    newCapacityValues.length,
    noteValues.length
  );

  const rows = [];

  for (let index = 0; index < rowCount; index += 1) {
    const name = String(nameValues[index] ?? "").trim();
    const currentStudents = String(currentStudentsValues[index] ?? "").trim();
    const serviceLimit = String(serviceLimitValues[index] ?? "").trim();
    const canTakeNew = String(canTakeNewValues[index] ?? "").trim();
    const newCapacity = String(newCapacityValues[index] ?? "").trim();
    const notes = String(noteValues[index] ?? "").trim();

    if (!name && !currentStudents && !serviceLimit && !canTakeNew && !newCapacity && !notes) {
      continue;
    }

    rows.push({
      name,
      currentStudents,
      serviceLimit,
      canTakeNew: canTakeNew || "否",
      newCapacity,
      notes,
    });
  }

  return buildDefaultHeadteacherRows(rows.length > 0 ? rows : fallbackRows);
}

function normalizeHeadteacherSimulatorInput(body = {}) {
  const defaults = buildDefaultHeadteacherSimulatorForm();

  return {
    formVersion: 2,
    period: {
      forecastMonth: String(body.forecast_month ?? defaults.period.forecastMonth).trim(),
    },
    students: {
      currentTotalStudents: String(
        body.current_total_students ?? defaults.students.currentTotalStudents
      ).trim(),
      renewalDueStudents: String(
        body.renewal_due_students ?? defaults.students.renewalDueStudents
      ).trim(),
      renewalChurnRate: String(
        body.renewal_churn_rate ?? defaults.students.renewalChurnRate
      ).trim(),
      monthlyEcomNewStudents: String(
        body.monthly_ecom_new_students ?? defaults.students.monthlyEcomNewStudents
      ).trim(),
      monthlySalesNewStudents: String(
        body.monthly_sales_new_students ?? defaults.students.monthlySalesNewStudents
      ).trim(),
    },
    team: {
      defaultServiceLimit: String(
        body.default_service_limit ?? defaults.team.defaultServiceLimit
      ).trim(),
      defaultNewIntakeLimit: String(
        body.default_new_intake_limit ?? defaults.team.defaultNewIntakeLimit
      ).trim(),
      rows: normalizeHeadteacherRows(body, defaults.team.rows),
    },
  };
}

function validateHeadteacherSimulatorForm(form) {
  if (!isValidMonthString(form.period.forecastMonth)) {
    return "预测月份必须是 YYYY-MM。";
  }

  const checks = [
    [form.students.currentTotalStudents, "当前总服务学员去重数", { min: 0 }],
    [form.students.renewalDueStudents, "本月到期续费人数", { min: 0 }],
    [form.students.monthlyEcomNewStudents, "预计本月电商新增学员数", { min: 0 }],
    [form.students.monthlySalesNewStudents, "预计本月新签转正学员数", { min: 0 }],
    [form.team.defaultServiceLimit, "单个班主任默认服务人数上限", { min: 1 }],
    [form.team.defaultNewIntakeLimit, "单个新班主任默认月接新上限", { min: 1 }],
  ];

  for (const [value, label, options] of checks) {
    const result = parseRequiredNumber(value, label, options);
    if (!result.ok) {
      return result.message;
    }
  }

  const renewalRateResult = parseRequiredPercent(form.students.renewalChurnRate, "续费流失率", {
    min: 0,
    max: PERCENTAGE_MAX,
  });

  if (!renewalRateResult.ok) {
    return renewalRateResult.message;
  }

  if (!form.team.rows || form.team.rows.length === 0) {
    return "至少需要配置 1 位班主任。";
  }

  for (const row of form.team.rows) {
    if (!row.name) {
      return "班主任姓名不能为空。";
    }

    if (!NEW_TOGGLE_OPTIONS.some((option) => option.value === row.canTakeNew)) {
      return `班主任 ${row.name} 的“本月是否接新”填写无效。`;
    }

    const rowChecks = [
      [row.currentStudents, `班主任 ${row.name} 的当前服务学员数`, { min: 0 }],
      [row.serviceLimit, `班主任 ${row.name} 的服务人数上限`, { min: 1 }],
      [row.newCapacity, `班主任 ${row.name} 的本月可接新人数`, { min: 0 }],
    ];

    for (const [value, label, options] of rowChecks) {
      const result = parseRequiredNumber(value, label, options);
      if (!result.ok) {
        return result.message;
      }
    }
  }

  return "";
}

function getMoreSevereLevel(leftLevel, rightLevel) {
  return (severityRank[leftLevel] ?? 99) <= (severityRank[rightLevel] ?? 99) ? leftLevel : rightLevel;
}

function getDominantRisk(serviceGapStudents, newIntakeGapStudents) {
  if (newIntakeGapStudents > serviceGapStudents) {
    return "new-intake";
  }

  if (serviceGapStudents > newIntakeGapStudents) {
    return "service";
  }

  return "balanced";
}

function buildMonthlyWarningMessage(row) {
  const dominantRisk = getDominantRisk(row.serviceGapStudents, row.newIntakeGapStudents);

  if (row.warningLevel === "red") {
    const base = `班主任承接不足，预计缺 ${row.requiredHeadteachers} 名班主任，本月需关注到岗安排`;

    if (dominantRisk === "new-intake") {
      return `${base}。当前主要风险来自接新能力不足`;
    }

    if (dominantRisk === "service") {
      return `${base}。当前主要风险来自整体服务容量不足`;
    }

    return `${base}。当前服务容量与接新能力都需要关注`;
  }

  if (row.warningLevel === "orange") {
    if (dominantRisk === "new-intake") {
      return "班主任承接已接近上限，建议提前储备可接新的班主任";
    }

    if (dominantRisk === "service") {
      return "班主任承接已接近上限，建议提前储备成熟班主任";
    }

    return "班主任承接已接近上限，建议提前储备人员";
  }

  if (row.warningLevel === "yellow") {
    return "班主任负载较高，建议关注后续增长";
  }

  return "当前班主任容量充足，暂无明显风险";
}

function buildRowArrivalAdvice(row, index, monthRows) {
  const firstRow = monthRows[0];

  if (index === 0 && row.warningLevel === "red") {
    return "本月到岗";
  }

  if (
    index === 1 &&
    firstRow &&
    firstRow.warningLevel === "orange" &&
    row.warningLevel === "red"
  ) {
    return "下月初到岗";
  }

  if (row.warningLevel === "red") {
    return `${row.monthLabel} 前到岗`;
  }

  if (row.warningLevel === "orange") {
    return "建议提前储备";
  }

  return "暂不需要新增到岗";
}

function buildOverallArrivalRecommendation(monthRows) {
  const firstRow = monthRows[0];
  const secondRow = monthRows[1];
  const firstRedRow = monthRows.find((row) => row.warningLevel === "red");
  const peakRow = monthRows.reduce((maxRow, row) => {
    if (!maxRow) {
      return row;
    }

    if ((severityRank[row.warningLevel] ?? 99) < (severityRank[maxRow.warningLevel] ?? 99)) {
      return row;
    }

    if (row.requiredHeadteachers > maxRow.requiredHeadteachers) {
      return row;
    }

    return maxRow;
  }, null);
  const dominantRisk = peakRow
    ? getDominantRisk(peakRow.serviceGapStudents, peakRow.newIntakeGapStudents)
    : "balanced";

  let timing = "暂不需要新增到岗";
  let message = "当前班主任容量基本可承接，本月暂不需要新增到岗。";

  if (firstRow && firstRow.warningLevel === "red") {
    timing = "本月到岗";
    message = "本月班主任承接能力不足，需立即补充。";
  } else if (
    firstRow &&
    secondRow &&
    firstRow.warningLevel === "orange" &&
    secondRow.warningLevel === "red"
  ) {
    timing = "下月初到岗";
    message = "当前已接近上限，下月预计超载，建议提前储备。";
  } else if (firstRedRow) {
    timing = `${firstRedRow.monthLabel} 前到岗`;
    message = `预计在 ${firstRedRow.monthLabel} 出现超载，建议提前完成补充。`;
  }

  if (timing !== "暂不需要新增到岗") {
    if (dominantRisk === "new-intake") {
      message += " 优先补充可接新的班主任。";
    } else if (dominantRisk === "service") {
      message += " 优先补充成熟班主任或提升现有班主任服务承载。";
    }
  }

  return {
    timing,
    message,
  };
}

function buildHeadteacherRiskMessage(row) {
  if (row.loadUtilization > 1) {
    return "已超个人服务上限，需立即调整分配";
  }

  if (row.loadUtilization >= 0.9) {
    return "已接近个人服务上限，建议控制继续加人";
  }

  if (row.canTakeNew === "是" && row.newCapacity <= 0) {
    return "标记为可接新，但本月接新名额为 0";
  }

  if (row.canTakeNew === "是" && row.loadUtilization >= 0.8) {
    return "当前负载较高，接新需谨慎";
  }

  if (row.canTakeNew === "是") {
    return "当前负载可控，可承担接新";
  }

  return "本月不接新，以稳班和服务承接为主";
}

function calculateHeadteacherSimulatorResults(form) {
  const currentTotalStudents = Number(form.students.currentTotalStudents);
  const renewalDueStudents = Number(form.students.renewalDueStudents);
  const renewalChurnRate = parseRequiredPercent(form.students.renewalChurnRate, "续费流失率").value;
  const monthlyEcomNewStudents = Number(form.students.monthlyEcomNewStudents);
  const monthlySalesNewStudents = Number(form.students.monthlySalesNewStudents);
  const defaultServiceLimit = Number(form.team.defaultServiceLimit);
  const defaultNewIntakeLimit = Number(form.team.defaultNewIntakeLimit);
  const newStudentsThisMonth = roundTo(monthlyEcomNewStudents + monthlySalesNewStudents, 2);
  const monthlyChurnStudents = roundTo(renewalDueStudents * renewalChurnRate, 2);

  const teamRows = form.team.rows.map((row) => {
    const currentStudentsValue = Number(row.currentStudents);
    const serviceLimitValue = Number(row.serviceLimit);
    const canTakeNew = row.canTakeNew === "是" ? "是" : "否";
    const newCapacityValue = canTakeNew === "是" ? Number(row.newCapacity) : 0;
    const loadUtilization = safeDivide(currentStudentsValue, serviceLimitValue);

    return {
      name: row.name,
      currentStudents: currentStudentsValue,
      serviceLimit: serviceLimitValue,
      canTakeNew,
      newCapacity: newCapacityValue,
      notes: row.notes,
      loadUtilization: roundTo(loadUtilization, 2),
      riskMessage: buildHeadteacherRiskMessage({
        ...row,
        canTakeNew,
        newCapacity: newCapacityValue,
        loadUtilization,
      }),
    };
  });

  const totalServiceCapacity = teamRows.reduce((sum, row) => sum + row.serviceLimit, 0);
  const currentTeamStudents = teamRows.reduce((sum, row) => sum + row.currentStudents, 0);
  const monthlyNewCapacity = teamRows.reduce(
    (sum, row) => sum + (row.canTakeNew === "是" ? row.newCapacity : 0),
    0
  );
  const currentAverageServiceStudents =
    teamRows.length > 0 ? roundTo(currentTeamStudents / teamRows.length, 2) : 0;
  const highestLoadRatio = teamRows.reduce(
    (maxValue, row) => Math.max(maxValue, row.loadUtilization),
    0
  );
  const highestLoadNames = teamRows
    .filter((row) => row.loadUtilization === highestLoadRatio)
    .map((row) => row.name);

  const monthRows = [];
  const monthLabel = addMonths(form.period.forecastMonth, 0);
  const projectedStudentsMonthEnd = Math.max(
    0,
    roundTo(currentTotalStudents - monthlyChurnStudents + newStudentsThisMonth, 2)
  );
  const serviceGapStudents = Math.max(0, roundTo(projectedStudentsMonthEnd - totalServiceCapacity, 2));
  const newIntakeGapStudents = Math.max(0, roundTo(newStudentsThisMonth - monthlyNewCapacity, 2));
  const serviceUtilization = safeDivide(projectedStudentsMonthEnd, totalServiceCapacity);
  const newIntakeUtilization = safeDivide(newStudentsThisMonth, monthlyNewCapacity);
  const serviceWarningLevel = getUtilizationWarningLevel(serviceUtilization);
  const newIntakeWarningLevel = getUtilizationWarningLevel(newIntakeUtilization);
  const warningLevel = getMoreSevereLevel(serviceWarningLevel, newIntakeWarningLevel);
  const requiredHeadteachersByService =
    serviceGapStudents <= 0 ? 0 : Math.ceil(serviceGapStudents / defaultServiceLimit);
  const requiredHeadteachersByNewIntake =
    newIntakeGapStudents <= 0 ? 0 : Math.ceil(newIntakeGapStudents / defaultNewIntakeLimit);
  const requiredHeadteachers = Math.max(
    requiredHeadteachersByService,
    requiredHeadteachersByNewIntake
  );

  monthRows.push({
    monthLabel,
    projectedStudentsMonthEnd,
    totalServiceCapacity,
    serviceGapStudents,
    newStudentsThisMonth,
    monthlyNewCapacity,
    newIntakeGapStudents,
    serviceUtilization: roundTo(serviceUtilization, 2),
    newIntakeUtilization: roundTo(newIntakeUtilization, 2),
    serviceWarningLevel,
    newIntakeWarningLevel,
    warningLevel,
    requiredHeadteachersByService,
    requiredHeadteachersByNewIntake,
    requiredHeadteachers,
  });

  monthRows.forEach((row, index) => {
    row.warningMessage = buildMonthlyWarningMessage(row);
    row.arrivalAdvice = buildRowArrivalAdvice(row, index, monthRows);
  });

  const overallWarningRow = monthRows.reduce((bestRow, row) => {
    if (!bestRow) {
      return row;
    }

    if ((severityRank[row.warningLevel] ?? 99) < (severityRank[bestRow.warningLevel] ?? 99)) {
      return row;
    }

    if (row.requiredHeadteachers > bestRow.requiredHeadteachers) {
      return row;
    }

    return bestRow;
  }, null);

  const overallArrivalRecommendation = buildOverallArrivalRecommendation(monthRows);
  const maxRequiredHeadteachers = monthRows.reduce(
    (maxValue, row) => Math.max(maxValue, row.requiredHeadteachers),
    0
  );
  const firstMonthRow = monthRows[0];
  const projectedStudentDelta = firstMonthRow
    ? roundTo(firstMonthRow.projectedStudentsMonthEnd - currentTotalStudents, 2)
    : 0;

  return {
    summaryCards: {
      projectedStudentsMonthEnd: {
        value: firstMonthRow ? firstMonthRow.projectedStudentsMonthEnd : 0,
        note:
          projectedStudentDelta >= 0
            ? `较当前净增 ${projectedStudentDelta} 人`
            : `较当前净减 ${Math.abs(projectedStudentDelta)} 人`,
      },
      overallWarning: {
        level: overallWarningRow ? overallWarningRow.warningLevel : "green",
        note: overallWarningRow ? overallWarningRow.warningMessage : "当前班主任容量充足，暂无明显风险",
      },
      requiredHeadteachers: {
        value: maxRequiredHeadteachers,
        note:
          maxRequiredHeadteachers > 0
            ? "按总服务容量和接新容量两条口径取更高值"
            : "当前预测周期内暂无新增班主任缺口",
      },
      arrivalRecommendation: overallArrivalRecommendation,
    },
    cycleSummary: {
      forecastMonth: form.period.forecastMonth,
    },
    studentsSummary: {
      currentTotalStudents,
      renewalDueStudents,
      renewalChurnRate,
      monthlyChurnStudents,
      monthlyEcomNewStudents,
      monthlySalesNewStudents,
      newStudentsThisMonth,
    },
    teamSummary: {
      totalServiceCapacity,
      currentTeamStudents,
      monthlyNewCapacity,
      currentAverageServiceStudents,
      highestLoadNames,
      highestLoadRatio: roundTo(highestLoadRatio, 2),
    },
    monthRows,
    teamRows,
    notes: [
      "本月末预计服务学员数 = 当前总服务学员数 - 预计本月续费流失人数 + 本月新增学员数。",
      "预计本月续费流失人数 = 本月到期续费人数 × 续费流失率。",
      "总服务容量表示班主任团队最多能稳定服务多少学员；本月接新容量表示这个月最多还能承接多少新学员。",
      "服务人数上限影响总服务容量；本月可接新人数影响本月接新容量；当前服务学员数主要影响个人负载和风险提示。",
      "到岗建议优先看当前月份的总服务负载和接新能力；若接新缺口更大，会优先建议补充可接新的班主任。",
    ],
  };
}

function buildHeadteacherSimulatorViewModel(options = {}) {
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
    pageTitle: "班主任人员预警",
    activeNav: "headteacher-simulator",
    appName: "师资测算与预警系统",
    simulatorForm: options.simulatorForm || buildDefaultHeadteacherSimulatorForm(),
    result: options.result || null,
    errorMessage: options.errorMessage || "",
    showSettingsExpanded:
      typeof options.showSettingsExpanded === "boolean"
        ? options.showSettingsExpanded
        : !options.result || Boolean(options.errorMessage),
    newToggleOptions: NEW_TOGGLE_OPTIONS,
    predictorTabs,
    activePredictorTab: "headteacher",
  };
}

module.exports = {
  buildHeadteacherSimulatorViewModel,
  buildDefaultHeadteacherSimulatorForm,
  hydrateHeadteacherSimulatorForm,
  normalizeHeadteacherSimulatorInput,
  validateHeadteacherSimulatorForm,
  calculateHeadteacherSimulatorResults,
  NEW_TOGGLE_OPTIONS,
};
