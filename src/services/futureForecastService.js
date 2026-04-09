const { getUtilizationWarningLevel, getSlotWarningLevel } = require("./forecastService");

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

function getMonthDate(monthValue) {
  const [year, month] = String(monthValue)
    .split("-")
    .map((part) => Number(part));

  return new Date(Date.UTC(year, month - 1, 1));
}

function formatMonthLabel(monthValue) {
  const [year, month] = String(monthValue).split("-");
  return `${year}年${month}月`;
}

function getDaysInMonth(monthValue) {
  const date = getMonthDate(monthValue);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function getMonthWeekFactor(monthValue) {
  return roundTo(getDaysInMonth(monthValue) / 7, 2);
}

function getEligibleTeachers(teachers, courseType) {
  return teachers.filter((teacher) => {
    if (Number(teacher.enabled) !== 1) {
      return false;
    }

    if (courseType === "trial") {
      return teacher.course_type === "trial" || teacher.course_type === "both";
    }

    if (courseType === "paid") {
      return teacher.course_type === "paid" || teacher.course_type === "both";
    }

    return false;
  });
}

function buildRatioMap(db) {
  const rows = db
    .prepare(
      `SELECT course_type, slot_code, ratio
       FROM slot_ratio_config
       ORDER BY course_type ASC, slot_code ASC`
    )
    .all();
  const grouped = new Map();

  rows.forEach((row) => {
    const items = grouped.get(row.course_type) || [];
    items.push({ slotCode: row.slot_code, ratio: Number(row.ratio || 0) });
    grouped.set(row.course_type, items);
  });

  const normalized = new Map();
  grouped.forEach((items, courseType) => {
    const total = items.reduce((sum, item) => sum + item.ratio, 0);

    if (total <= 0) {
      normalized.set(courseType, []);
      return;
    }

    normalized.set(
      courseType,
      items.map((item) => ({
        slotCode: item.slotCode,
        ratio: item.ratio / total,
      }))
    );
  });

  return normalized;
}

function buildSlotAvailabilityBaselines(db, teachers) {
  const teacherMap = new Map(teachers.map((teacher) => [teacher.teacher_id, teacher]));
  const counts = {
    trial: new Map(),
    paid: new Map(),
  };

  const availabilityRows = db
    .prepare(
      `SELECT teacher_id, stat_date, slot_code, available_flag
       FROM teacher_slot_availability
       ORDER BY stat_date ASC, slot_code ASC`
    )
    .all();

  availabilityRows.forEach((row) => {
    if (Number(row.available_flag) !== 1) {
      return;
    }

    const teacher = teacherMap.get(row.teacher_id);

    if (!teacher || Number(teacher.enabled) !== 1) {
      return;
    }

    const eligibleCourses =
      teacher.course_type === "both" ? ["trial", "paid"] : [teacher.course_type];

    eligibleCourses.forEach((courseType) => {
      const compositeKey = `${row.slot_code}::${row.stat_date}`;
      counts[courseType].set(compositeKey, (counts[courseType].get(compositeKey) || 0) + 1);
    });
  });

  const baselines = {
    trial: new Map(),
    paid: new Map(),
  };

  ["trial", "paid"].forEach((courseType) => {
    const grouped = new Map();

    counts[courseType].forEach((value, compositeKey) => {
      const [slotCode] = compositeKey.split("::");
      const items = grouped.get(slotCode) || [];
      items.push(value);
      grouped.set(slotCode, items);
    });

    grouped.forEach((items, slotCode) => {
      const average = items.reduce((sum, item) => sum + item, 0) / items.length;
      baselines[courseType].set(slotCode, Math.max(Math.round(average), 0));
    });
  });

  return baselines;
}

function getLatestActiveSnapshot(db) {
  const row = db
    .prepare(
      `SELECT stat_date, active_not_due_students
       FROM regular_active_snapshot_daily
       ORDER BY stat_date DESC
       LIMIT 1`
    )
    .get();

  return row ? Number(row.active_not_due_students || 0) : 0;
}

function getAverageMonthlyDueStudents(db) {
  const rows = db
    .prepare(
      `SELECT substr(stat_date, 1, 7) AS stat_month, SUM(due_students) AS month_due_students
       FROM renewal_due_daily
       GROUP BY substr(stat_date, 1, 7)
       ORDER BY stat_month ASC`
    )
    .all();

  if (rows.length === 0) {
    return 0;
  }

  return roundTo(
    rows.reduce((sum, row) => sum + Number(row.month_due_students || 0), 0) / rows.length,
    2
  );
}

function getCurrentMonthlySupplyBaseline(teachers, courseType, forecastMonth) {
  const weekFactor = getMonthWeekFactor(forecastMonth);
  const totalWeeklyHours = getEligibleTeachers(teachers, courseType).reduce(
    (sum, teacher) => sum + Number(teacher.weekly_hours || 0),
    0
  );

  return roundTo(totalWeeklyHours * weekFactor, 2);
}

function buildMonthlySupplyHours(planValue, fallbackSupplyHours, plannedNewTeachers, perTeacherBaseline, weekFactor) {
  if (Number(planValue || 0) > 0) {
    return roundTo(Number(planValue || 0), 2);
  }

  return roundTo(
    Number(fallbackSupplyHours || 0) +
      Number(plannedNewTeachers || 0) * Number(perTeacherBaseline || 0) * Number(weekFactor || 0),
    2
  );
}

function computeGapTeacherCount(gapTeacherHours, baselineCapacity) {
  if (gapTeacherHours >= 0) {
    return 0;
  }

  return Math.ceil(Math.abs(Number(gapTeacherHours || 0)) / Math.max(Number(baselineCapacity || 0), 1));
}

function getMonthlyWarningMessage(warningLevel, shortageTeacherCount, gapTeacherHours) {
  const missingHours = roundTo(Math.abs(Number(gapTeacherHours || 0)), 2);

  if (warningLevel === "red") {
    return `本月供给不足，预计缺 ${shortageTeacherCount} 名老师，缺口 ${missingHours} 工时`;
  }

  if (warningLevel === "orange") {
    return "本月供给接近上限，建议提前储备老师";
  }

  if (warningLevel === "yellow") {
    return "本月利用率较高，建议关注后续排班";
  }

  return "供给充足，暂无明显师资风险";
}

function getSlotWarningMessage(warningLevel, shortageTeacherCount) {
  if (warningLevel === "red") {
    return `该时段供给不足，预计缺 ${shortageTeacherCount} 名老师`;
  }

  if (warningLevel === "orange") {
    return "该时段已接近满载，建议预留冗余老师";
  }

  if (warningLevel === "yellow") {
    return "该时段利用率较高，建议关注并发压力";
  }

  return "供给充足，暂无明显师资风险";
}

function pickPriorityRow(rows, options = {}) {
  if (!rows || rows.length === 0) {
    return null;
  }

  return rows
    .slice()
    .sort((left, right) => {
      const leftRank = severityRank[left.warningLevel] ?? 99;
      const rightRank = severityRank[right.warningLevel] ?? 99;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftShortage = Number(left.shortageTeacherCount || 0);
      const rightShortage = Number(right.shortageTeacherCount || 0);

      if (rightShortage !== leftShortage) {
        return rightShortage - leftShortage;
      }

      const leftGap = Math.abs(Number(left[options.gapField || "gapTeacherHours"] || 0));
      const rightGap = Math.abs(Number(right[options.gapField || "gapTeacherHours"] || 0));

      if (rightGap !== leftGap) {
        return rightGap - leftGap;
      }

      const leftValue = String(left[options.dateField || "forecastMonth"] || "");
      const rightValue = String(right[options.dateField || "forecastMonth"] || "");
      return rightValue.localeCompare(leftValue);
    })[0];
}

function persistFutureForecastResults(db, scenarioName, trialRows, paidRows, slotRows) {
  db.prepare("DELETE FROM forecast_results_monthly WHERE scenario_name = ?").run(scenarioName);
  db.prepare("DELETE FROM forecast_results_slots WHERE scenario_name = ?").run(scenarioName);

  const insertMonthly = db.prepare(
    `INSERT INTO forecast_results_monthly (
       forecast_month,
       scenario_name,
       course_type,
       projected_students,
       demand_teacher_hours,
       supply_teacher_hours,
       gap_teacher_hours,
       gap_teacher_count,
       utilization,
       warning_level,
       summary_text,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  const insertSlot = db.prepare(
    `INSERT INTO forecast_results_slots (
       forecast_month,
       scenario_name,
       course_type,
       slot_code,
       projected_required_teachers,
       projected_available_teachers,
       slot_gap,
       slot_gap_teacher_count,
       slot_utilization,
       warning_level,
       summary_text,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  [...trialRows, ...paidRows].forEach((row) => {
    insertMonthly.run(
      row.forecastMonth,
      scenarioName,
      row.courseType,
      row.projectedStudents,
      row.demandTeacherHours,
      row.supplyTeacherHours,
      row.gapTeacherHours,
      row.shortageTeacherCount,
      Number.isFinite(row.utilization) ? roundTo(row.utilization, 4) : 999,
      row.warningLevel,
      row.warningMessage
    );
  });

  slotRows.forEach((row) => {
    insertSlot.run(
      row.forecastMonth,
      scenarioName,
      row.courseType,
      row.slotCode,
      row.projectedRequiredTeachers,
      row.projectedAvailableTeachers,
      row.slotGap,
      row.shortageTeacherCount,
      Number.isFinite(row.slotUtilization) ? roundTo(row.slotUtilization, 4) : 999,
      row.warningLevel,
      row.warningMessage
    );
  });
}

function buildScenarioRows(db) {
  const rows = db
    .prepare(
      `SELECT
         scenario_name,
         display_name,
         trial_attend_rate,
         trial_delay_days,
         trial_class_size_plan,
         sales_conversion_rate,
         sales_trial_to_paid_delay_days,
         sales_paid_to_start_delay_days,
         ecom_paid_to_start_delay_days,
         renewal_rate,
         renewal_to_start_delay_days,
         regular_class_size_plan,
         regular_student_weekly_hours,
         trial_teacher_capacity_baseline,
         regular_teacher_capacity_baseline,
         enabled
       FROM forecast_assumptions
       WHERE enabled = 1
       ORDER BY CASE scenario_name
         WHEN 'conservative' THEN 1
         WHEN 'baseline' THEN 2
         WHEN 'optimistic' THEN 3
         ELSE 99
       END`
    )
    .all();

  if (rows.length > 0) {
    return rows;
  }

  return [
    {
      scenario_name: "baseline",
      display_name: "基准",
      trial_attend_rate: 0.65,
      trial_delay_days: 2,
      trial_class_size_plan: 4,
      sales_conversion_rate: 0.12,
      sales_trial_to_paid_delay_days: 7,
      sales_paid_to_start_delay_days: 7,
      ecom_paid_to_start_delay_days: 3,
      renewal_rate: 0.72,
      renewal_to_start_delay_days: 7,
      regular_class_size_plan: 6,
      regular_student_weekly_hours: 0.5,
      trial_teacher_capacity_baseline: 24,
      regular_teacher_capacity_baseline: 24,
      enabled: 1,
    },
  ];
}

function buildFutureForecastViewModel(db, selectedScenarioName = "baseline") {
  const teachers = db
    .prepare(
      `SELECT teacher_id, teacher_name, course_type, employment_type, weekly_hours, enabled
       FROM teachers`
    )
    .all();
  const scenarios = buildScenarioRows(db);
  const selectedScenario =
    scenarios.find((scenario) => scenario.scenario_name === selectedScenarioName) ||
    scenarios.find((scenario) => scenario.scenario_name === "baseline") ||
    scenarios[0];
  const plans = db
    .prepare(
      `SELECT
         forecast_month,
         planned_assigned_leads,
         planned_ecom_orders,
         planned_new_trial_teachers,
         planned_new_regular_teachers,
         planned_trial_teacher_capacity_hours,
         planned_regular_teacher_capacity_hours,
         notes
       FROM forecast_plan_monthly
       ORDER BY forecast_month ASC`
    )
    .all();

  if (plans.length === 0) {
    return {
      pageTitle: "未来月份预测",
      activeNav: "future-forecast",
      scenarios,
      selectedScenario,
      summaryCards: {
        trial: null,
        paid: null,
        slot: null,
      },
      trialMonthlyRows: [],
      paidMonthlyRows: [],
      slotRows: [],
      notes: [
        "当前还没有未来月份计划，请先维护“未来月份计划”和“未来预测假设”。",
      ],
      emptyState: "当前还没有未来月份计划数据，暂时无法输出未来月份预测。",
    };
  }

  const ratioMap = buildRatioMap(db);
  const slotBaselines = buildSlotAvailabilityBaselines(db, teachers);
  const monthlyDueAverage = getAverageMonthlyDueStudents(db);
  const latestActiveBase = getLatestActiveSnapshot(db);

  const trialMonthlyRows = [];
  const paidMonthlyRows = [];
  const slotRows = [];

  let rollingPaidBase = latestActiveBase;

  plans.forEach((plan) => {
    const weekFactor = getMonthWeekFactor(plan.forecast_month);
    const monthLabel = formatMonthLabel(plan.forecast_month);
    const trialProjectedArrivals = roundTo(
      Number(plan.planned_assigned_leads || 0) * Number(selectedScenario.trial_attend_rate || 0),
      2
    );
    const trialProjectedClasses =
      trialProjectedArrivals > 0
        ? Math.ceil(trialProjectedArrivals / Number(selectedScenario.trial_class_size_plan || 1))
        : 0;
    const trialDemandTeacherHours = trialProjectedClasses;
    const trialSupplyTeacherHours = buildMonthlySupplyHours(
      plan.planned_trial_teacher_capacity_hours,
      getCurrentMonthlySupplyBaseline(teachers, "trial", plan.forecast_month),
      plan.planned_new_trial_teachers,
      selectedScenario.trial_teacher_capacity_baseline,
      weekFactor
    );
    const trialGapTeacherHours = roundTo(trialSupplyTeacherHours - trialDemandTeacherHours, 2);
    const trialUtilization = safeDivide(trialDemandTeacherHours, trialSupplyTeacherHours);
    const trialWarningLevel = getUtilizationWarningLevel(trialUtilization);
    const trialShortageTeacherCount = computeGapTeacherCount(
      trialGapTeacherHours,
      selectedScenario.trial_teacher_capacity_baseline
    );

    trialMonthlyRows.push({
      forecastMonth: plan.forecast_month,
      monthLabel,
      courseType: "trial",
      plannedAssignedLeads: Number(plan.planned_assigned_leads || 0),
      projectedStudents: trialProjectedArrivals,
      projectedArrivals: trialProjectedArrivals,
      projectedClasses: trialProjectedClasses,
      demandTeacherHours: trialDemandTeacherHours,
      supplyTeacherHours: trialSupplyTeacherHours,
      gapTeacherHours: trialGapTeacherHours,
      shortageTeacherCount: trialShortageTeacherCount,
      utilization: trialUtilization,
      warningLevel: trialWarningLevel,
      warningMessage: getMonthlyWarningMessage(
        trialWarningLevel,
        trialShortageTeacherCount,
        trialGapTeacherHours
      ),
      notes: plan.notes || "",
    });

    const projectedRenewalStudents = roundTo(
      monthlyDueAverage * Number(selectedScenario.renewal_rate || 0),
      2
    );
    const projectedSalesRegularStarts = roundTo(
      Number(plan.planned_assigned_leads || 0) * Number(selectedScenario.sales_conversion_rate || 0),
      2
    );
    const projectedEcomRegularStarts = Number(plan.planned_ecom_orders || 0);
    const projectedPaidStudents = roundTo(
      rollingPaidBase +
        projectedRenewalStudents +
        projectedSalesRegularStarts +
        projectedEcomRegularStarts,
      2
    );
    const paidDemandTeacherHours = Math.ceil(
      (projectedPaidStudents * Number(selectedScenario.regular_student_weekly_hours || 0)) /
        Math.max(Number(selectedScenario.regular_class_size_plan || 1), 1)
    );
    const paidSupplyTeacherHours = buildMonthlySupplyHours(
      plan.planned_regular_teacher_capacity_hours,
      getCurrentMonthlySupplyBaseline(teachers, "paid", plan.forecast_month),
      plan.planned_new_regular_teachers,
      selectedScenario.regular_teacher_capacity_baseline,
      weekFactor
    );
    const paidGapTeacherHours = roundTo(paidSupplyTeacherHours - paidDemandTeacherHours, 2);
    const paidUtilization = safeDivide(paidDemandTeacherHours, paidSupplyTeacherHours);
    const paidWarningLevel = getUtilizationWarningLevel(paidUtilization);
    const paidShortageTeacherCount = computeGapTeacherCount(
      paidGapTeacherHours,
      selectedScenario.regular_teacher_capacity_baseline
    );

    paidMonthlyRows.push({
      forecastMonth: plan.forecast_month,
      monthLabel,
      courseType: "paid",
      existingActiveBase: rollingPaidBase,
      predictedDueStudents: monthlyDueAverage,
      projectedRenewalStudents,
      projectedSalesRegularStarts,
      projectedEcomRegularStarts,
      projectedStudents: projectedPaidStudents,
      demandTeacherHours: paidDemandTeacherHours,
      supplyTeacherHours: paidSupplyTeacherHours,
      gapTeacherHours: paidGapTeacherHours,
      shortageTeacherCount: paidShortageTeacherCount,
      utilization: paidUtilization,
      warningLevel: paidWarningLevel,
      warningMessage: getMonthlyWarningMessage(
        paidWarningLevel,
        paidShortageTeacherCount,
        paidGapTeacherHours
      ),
      notes: plan.notes || "",
    });

    rollingPaidBase = projectedPaidStudents;

    (ratioMap.get("trial") || []).forEach((ratio) => {
      const projectedRequiredTeachers =
        trialProjectedArrivals > 0
          ? Math.ceil(
              (trialProjectedArrivals * Number(ratio.ratio || 0)) /
                Math.max(Number(selectedScenario.trial_class_size_plan || 1), 1)
            )
          : 0;
      const projectedAvailableTeachers = Math.max(
        0,
        Math.round(
          Number(slotBaselines.trial.get(ratio.slotCode) || 0) +
            Number(plan.planned_new_trial_teachers || 0) * Number(ratio.ratio || 0)
        )
      );
      const slotGap = projectedAvailableTeachers - projectedRequiredTeachers;
      const slotUtilization = safeDivide(projectedRequiredTeachers, projectedAvailableTeachers);
      const warningLevel = getSlotWarningLevel(slotGap, slotUtilization);
      const shortageTeacherCount = slotGap < 0 ? Math.abs(slotGap) : 0;

      slotRows.push({
        forecastMonth: plan.forecast_month,
        monthLabel,
        courseType: "trial",
        courseTypeLabel: "体验课",
        slotCode: ratio.slotCode,
        projectedRequiredTeachers,
        projectedAvailableTeachers,
        slotGap,
        shortageTeacherCount,
        slotUtilization,
        warningLevel,
        warningMessage: getSlotWarningMessage(warningLevel, shortageTeacherCount),
      });
    });

    (ratioMap.get("paid") || []).forEach((ratio) => {
      const projectedRequiredTeachers =
        projectedPaidStudents > 0
          ? Math.ceil(
              (projectedPaidStudents * Number(ratio.ratio || 0)) /
                Math.max(Number(selectedScenario.regular_class_size_plan || 1), 1)
            )
          : 0;
      const projectedAvailableTeachers = Math.max(
        0,
        Math.round(
          Number(slotBaselines.paid.get(ratio.slotCode) || 0) +
            Number(plan.planned_new_regular_teachers || 0) * Number(ratio.ratio || 0)
        )
      );
      const slotGap = projectedAvailableTeachers - projectedRequiredTeachers;
      const slotUtilization = safeDivide(projectedRequiredTeachers, projectedAvailableTeachers);
      const warningLevel = getSlotWarningLevel(slotGap, slotUtilization);
      const shortageTeacherCount = slotGap < 0 ? Math.abs(slotGap) : 0;

      slotRows.push({
        forecastMonth: plan.forecast_month,
        monthLabel,
        courseType: "paid",
        courseTypeLabel: "正价课",
        slotCode: ratio.slotCode,
        projectedRequiredTeachers,
        projectedAvailableTeachers,
        slotGap,
        shortageTeacherCount,
        slotUtilization,
        warningLevel,
        warningMessage: getSlotWarningMessage(warningLevel, shortageTeacherCount),
      });
    });
  });

  persistFutureForecastResults(
    db,
    selectedScenario.scenario_name,
    trialMonthlyRows,
    paidMonthlyRows,
    slotRows
  );

  return {
    pageTitle: "未来月份预测",
    activeNav: "future-forecast",
    scenarios,
    selectedScenario,
    summaryCards: {
      trial: pickPriorityRow(trialMonthlyRows),
      paid: pickPriorityRow(paidMonthlyRows),
      slot: pickPriorityRow(slotRows, { gapField: "slotGap" }),
    },
    trialMonthlyRows,
    paidMonthlyRows,
    slotRows: slotRows.sort((left, right) => {
      const leftRank = severityRank[left.warningLevel] ?? 99;
      const rightRank = severityRank[right.warningLevel] ?? 99;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (left.forecastMonth !== right.forecastMonth) {
        return left.forecastMonth.localeCompare(right.forecastMonth);
      }

      return left.slotCode.localeCompare(right.slotCode);
    }),
    notes: [
      "正价课底盘先按最近在读未到期快照滚动结转，当前版本暂未引入流失学员扣减。",
      `未来续费到期人数先按最近实际月均到期人数外推，当前月均值为 ${monthlyDueAverage}。`,
      "未来时段供给暂按当前老师时段可用性的平均水平外推，再叠加计划新增老师数。",
    ],
    emptyState: "",
  };
}

module.exports = {
  buildFutureForecastViewModel,
};
