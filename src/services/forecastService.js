function toDate(dateString) {
  const [year, month, day] = String(dateString)
    .split("-")
    .map((part) => Number(part));

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = toDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function getWeekStart(dateString) {
  const date = toDate(dateString);
  const dayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOffset);
  return formatDate(date);
}

function getWeekEnd(weekStart) {
  return addDays(weekStart, 6);
}

function formatWeekLabel(weekStart) {
  return `${weekStart} ~ ${getWeekEnd(weekStart)}`;
}

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

function getUtilizationWarningLevel(utilization) {
  if (!Number.isFinite(utilization) || utilization > 1) {
    return "red";
  }

  if (utilization >= 0.9) {
    return "orange";
  }

  if (utilization >= 0.8) {
    return "yellow";
  }

  return "green";
}

function getSlotWarningLevel(slotGap, slotUtilization) {
  if (slotGap < 0) {
    return "red";
  }

  if (slotGap === 0) {
    return "orange";
  }

  if (slotUtilization >= 0.9) {
    return "yellow";
  }

  return "green";
}

const severityRank = { red: 0, orange: 1, yellow: 2, green: 3 };

function getEligibleTeachers(teachers, courseType, options = {}) {
  return teachers.filter((teacher) => {
    if (options.enabledOnly && Number(teacher.enabled) !== 1) {
      return false;
    }

    if (options.fullTimeOnly && teacher.employment_type !== "full_time") {
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

function computeCourseCapacityBaseline(teachers, courseType) {
  const fullTimeTeachers = getEligibleTeachers(teachers, courseType, {
    enabledOnly: true,
    fullTimeOnly: true,
  });
  const fallbackTeachers = getEligibleTeachers(teachers, courseType, {
    enabledOnly: true,
  });
  const source = fullTimeTeachers.length > 0 ? fullTimeTeachers : fallbackTeachers;

  if (source.length === 0) {
    return 1;
  }

  const totalWeeklyHours = source.reduce((sum, teacher) => sum + Number(teacher.weekly_hours || 0), 0);

  return Math.max(roundTo(totalWeeklyHours / source.length, 2), 1);
}

function computeShortageTeacherCount(gapTeacherHours, baselineCapacity) {
  if (gapTeacherHours >= 0) {
    return 0;
  }

  return Math.ceil(Math.abs(Number(gapTeacherHours || 0)) / Math.max(Number(baselineCapacity || 0), 1));
}

function getWeeklyWarningMessage(warningLevel, shortageTeacherCount, gapTeacherHours) {
  const missingHours = roundTo(Math.abs(Number(gapTeacherHours || 0)), 2);

  if (warningLevel === "red") {
    return `本周供给不足，预计缺 ${shortageTeacherCount} 名老师，缺口 ${missingHours} 工时`;
  }

  if (warningLevel === "orange") {
    return "本周供给接近上限，建议提前储备老师";
  }

  if (warningLevel === "yellow") {
    return "本周利用率较高，建议关注后续排班";
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
      const leftLevelRank = severityRank[left.warningLevel] ?? 99;
      const rightLevelRank = severityRank[right.warningLevel] ?? 99;

      if (leftLevelRank !== rightLevelRank) {
        return leftLevelRank - rightLevelRank;
      }

      const leftDate = String(left[options.dateField || "weekStart"] || "");
      const rightDate = String(right[options.dateField || "weekStart"] || "");

      if (left.warningLevel !== "red") {
        return rightDate.localeCompare(leftDate);
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

      return rightDate.localeCompare(leftDate);
    })[0];
}

function buildDateMap(rows, valueField) {
  const map = new Map();
  rows.forEach((row) => {
    map.set(row.stat_date, Number(row[valueField] || 0));
  });
  return map;
}

function incrementCounter(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function getScenarioSettings(db) {
  const row = db
    .prepare(
      `SELECT
         scenario_name,
         trial_delay_days,
         trial_attend_rate,
         trial_class_size_plan,
         sales_conversion_rate,
         renewal_rate,
         paid_weekly_hours_per_student
       FROM forecast_settings
       WHERE scenario_name = 'baseline'
       LIMIT 1`
    )
    .get();

  return (
    row || {
      scenario_name: "baseline",
      trial_delay_days: 2,
      trial_attend_rate: 0.65,
      trial_class_size_plan: 4,
      sales_conversion_rate: 0.12,
      renewal_rate: 0.72,
      paid_weekly_hours_per_student: 0.5,
    }
  );
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

function allocateDemandBySlot(totalDemand, ratios) {
  if (!Number.isFinite(totalDemand) || totalDemand <= 0 || ratios.length === 0) {
    return [];
  }

  const items = ratios.map((ratio) => ({
    slotCode: ratio.slotCode,
    demand: Math.floor(totalDemand * ratio.ratio),
    remainder: totalDemand * ratio.ratio - Math.floor(totalDemand * ratio.ratio),
  }));
  let remaining = totalDemand - items.reduce((sum, item) => sum + item.demand, 0);

  items
    .slice()
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder;
      }

      return left.slotCode.localeCompare(right.slotCode);
    })
    .forEach((item) => {
      if (remaining <= 0) {
        return;
      }

      const target = items.find((entry) => entry.slotCode === item.slotCode);
      target.demand += 1;
      remaining -= 1;
    });

  return items.map((item) => ({ slotCode: item.slotCode, demand: item.demand }));
}

function buildSupplyMaps(teachers, availabilityRows) {
  const teacherMap = new Map(teachers.map((teacher) => [teacher.teacher_id, teacher]));
  const dailyCourseSupply = { trial: new Map(), paid: new Map() };
  const slotCourseSupply = { trial: new Map(), paid: new Map() };
  const weeklyTeacherSupply = { trial: new Map(), paid: new Map() };
  const availabilityDates = new Set();

  availabilityRows.forEach((row) => {
    if (Number(row.available_flag) !== 1) {
      return;
    }

    const teacher = teacherMap.get(row.teacher_id);

    if (!teacher || Number(teacher.enabled) !== 1) {
      return;
    }

    availabilityDates.add(row.stat_date);
    const eligibleCourses =
      teacher.course_type === "both" ? ["trial", "paid"] : [teacher.course_type];
    const weekStart = getWeekStart(row.stat_date);

    eligibleCourses.forEach((courseType) => {
      incrementCounter(dailyCourseSupply[courseType], row.stat_date);
      incrementCounter(slotCourseSupply[courseType], `${row.stat_date}::${row.slot_code}`);
      incrementCounter(weeklyTeacherSupply[courseType], `${weekStart}::${teacher.teacher_id}`);
    });
  });

  return {
    availabilityDates,
    dailyCourseSupply,
    slotCourseSupply,
    weeklyTeacherSupply,
  };
}

function buildWeeklySupplyTotals(teachers, weeklyTeacherSupply) {
  const teacherMap = new Map(teachers.map((teacher) => [teacher.teacher_id, teacher]));
  const totals = { trial: new Map(), paid: new Map() };

  ["trial", "paid"].forEach((courseType) => {
    weeklyTeacherSupply[courseType].forEach((availableSlots, compositeKey) => {
      const [weekStart, teacherIdText] = compositeKey.split("::");
      const teacher = teacherMap.get(Number(teacherIdText));

      if (!teacher) {
        return;
      }

      incrementCounter(
        totals[courseType],
        weekStart,
        Math.min(Number(teacher.weekly_hours || 0), availableSlots)
      );
    });
  });

  return totals;
}

function getLatestSnapshotOnOrBefore(snapshotRows, dateString) {
  let latest = null;

  snapshotRows.forEach((row) => {
    if (row.stat_date <= dateString) {
      latest = row;
    }
  });

  return latest ? Number(latest.active_not_due_students || 0) : 0;
}

function buildForecastViewModel(db) {
  const settings = getScenarioSettings(db);
  const teachers = db
    .prepare(
      `SELECT teacher_id, teacher_name, course_type, employment_type, weekly_hours, enabled
       FROM teachers`
    )
    .all();
  const leadRows = db
    .prepare("SELECT stat_date, assigned_leads FROM lead_assignment_daily ORDER BY stat_date ASC")
    .all();
  const ecomRows = db
    .prepare("SELECT stat_date, paid_orders FROM ecom_paid_orders_daily ORDER BY stat_date ASC")
    .all();
  const renewalRows = db
    .prepare("SELECT stat_date, due_students FROM renewal_due_daily ORDER BY stat_date ASC")
    .all();
  const snapshotRows = db
    .prepare(
      `SELECT stat_date, active_not_due_students
       FROM regular_active_snapshot_daily
       ORDER BY stat_date ASC`
    )
    .all();
  const availabilityRows = db
    .prepare(
      `SELECT teacher_id, stat_date, slot_code, available_flag
       FROM teacher_slot_availability
       ORDER BY stat_date ASC, slot_code ASC, teacher_id ASC`
    )
    .all();

  const leadMap = buildDateMap(leadRows, "assigned_leads");
  const ecomMap = buildDateMap(ecomRows, "paid_orders");
  const renewalMap = buildDateMap(renewalRows, "due_students");
  const ratioMap = buildRatioMap(db);
  const trialTeacherCapacityBaseline = computeCourseCapacityBaseline(teachers, "trial");
  const paidTeacherCapacityBaseline = computeCourseCapacityBaseline(teachers, "paid");
  const { availabilityDates, dailyCourseSupply, slotCourseSupply, weeklyTeacherSupply } =
    buildSupplyMaps(teachers, availabilityRows);
  const weeklySupplyTotals = buildWeeklySupplyTotals(teachers, weeklyTeacherSupply);

  const allDates = new Set();
  leadRows.forEach((row) => {
    allDates.add(row.stat_date);
    allDates.add(addDays(row.stat_date, Number(settings.trial_delay_days || 0)));
  });
  ecomRows.forEach((row) => allDates.add(row.stat_date));
  renewalRows.forEach((row) => allDates.add(row.stat_date));
  snapshotRows.forEach((row) => allDates.add(row.stat_date));
  availabilityDates.forEach((date) => allDates.add(date));

  const sortedDates = Array.from(allDates).sort();
  const weekStarts = Array.from(new Set(sortedDates.map((date) => getWeekStart(date)))).sort();

  const trialDailyRows = sortedDates.map((statDate) => {
    const leadSourceDate = addDays(statDate, -Number(settings.trial_delay_days || 0));
    const assignedLeads = leadMap.get(leadSourceDate) || 0;
    const trialArrivals = roundTo(assignedLeads * Number(settings.trial_attend_rate || 0), 2);
    const trialClasses =
      trialArrivals > 0
        ? Math.ceil(trialArrivals / Number(settings.trial_class_size_plan || 1))
        : 0;
    const demandTeacherHours = trialClasses;
    const supplyTeacherHours = dailyCourseSupply.trial.get(statDate) || 0;
    const utilization = safeDivide(demandTeacherHours, supplyTeacherHours);

    return {
      statDate,
      leadSourceDate,
      assignedLeads,
      trialArrivals,
      trialClasses,
      demandTeacherHours,
      supplyTeacherHours,
      utilization,
      gapTeacherHours: supplyTeacherHours - demandTeacherHours,
      warningLevel: getUtilizationWarningLevel(utilization),
    };
  });

  const trialDailyMap = new Map(trialDailyRows.map((row) => [row.statDate, row]));

  const trialWeeklyRows = weekStarts.map((weekStart) => {
    const weekEnd = getWeekEnd(weekStart);
    const weekDates = sortedDates.filter((date) => date >= weekStart && date <= weekEnd);
    const projectedArrivals = roundTo(
      weekDates.reduce((sum, date) => sum + (trialDailyMap.get(date)?.trialArrivals || 0), 0),
      2
    );
    const demandTeacherHours = weekDates.reduce(
      (sum, date) => sum + (trialDailyMap.get(date)?.demandTeacherHours || 0),
      0
    );
    const supplyTeacherHours = Number(weeklySupplyTotals.trial.get(weekStart) || 0);
    const utilization = safeDivide(demandTeacherHours, supplyTeacherHours);
    const gapTeacherHours = roundTo(supplyTeacherHours - demandTeacherHours, 2);
    const shortageTeacherCount = computeShortageTeacherCount(
      gapTeacherHours,
      trialTeacherCapacityBaseline
    );
    const warningLevel = getUtilizationWarningLevel(utilization);

    return {
      weekStart,
      weekEnd,
      weekLabel: formatWeekLabel(weekStart),
      projectedArrivals,
      demandTeacherHours,
      supplyTeacherHours,
      utilization,
      gapTeacherHours,
      shortageTeacherCount,
      warningLevel,
      warningMessage: getWeeklyWarningMessage(warningLevel, shortageTeacherCount, gapTeacherHours),
    };
  });

  const paidWeeklyRows = weekStarts.map((weekStart) => {
    const weekEnd = getWeekEnd(weekStart);
    const weekDates = sortedDates.filter((date) => date >= weekStart && date <= weekEnd);
    const activeNotDueStudents = getLatestSnapshotOnOrBefore(snapshotRows, weekEnd);
    const renewalConverted = roundTo(
      weekDates.reduce((sum, date) => sum + (renewalMap.get(date) || 0), 0) *
        Number(settings.renewal_rate || 0),
      2
    );
    const salesConvertedStarts = roundTo(
      weekDates.reduce((sum, date) => sum + (leadMap.get(date) || 0), 0) *
        Number(settings.sales_conversion_rate || 0),
      2
    );
    const ecommerceStarts = weekDates.reduce((sum, date) => sum + (ecomMap.get(date) || 0), 0);
    const projectedStudents = roundTo(
      activeNotDueStudents + renewalConverted + salesConvertedStarts + ecommerceStarts,
      2
    );
    const demandTeacherHours = roundTo(
      projectedStudents * Number(settings.paid_weekly_hours_per_student || 0),
      2
    );
    const supplyTeacherHours = Number(weeklySupplyTotals.paid.get(weekStart) || 0);
    const utilization = safeDivide(demandTeacherHours, supplyTeacherHours);
    const gapTeacherHours = roundTo(supplyTeacherHours - demandTeacherHours, 2);
    const shortageTeacherCount = computeShortageTeacherCount(
      gapTeacherHours,
      paidTeacherCapacityBaseline
    );
    const warningLevel = getUtilizationWarningLevel(utilization);

    return {
      weekStart,
      weekEnd,
      weekLabel: formatWeekLabel(weekStart),
      activeNotDueStudents,
      renewalConverted,
      salesConvertedStarts,
      ecommerceStarts,
      projectedStudents,
      demandTeacherHours,
      supplyTeacherHours,
      utilization,
      gapTeacherHours,
      shortageTeacherCount,
      warningLevel,
      warningMessage: getWeeklyWarningMessage(warningLevel, shortageTeacherCount, gapTeacherHours),
    };
  });

  const slotAlertRows = [];
  const trialRatios = ratioMap.get("trial") || [];

  sortedDates.forEach((statDate) => {
    allocateDemandBySlot(trialDailyMap.get(statDate)?.demandTeacherHours || 0, trialRatios).forEach(
      (allocation) => {
        const slotSupply = slotCourseSupply.trial.get(`${statDate}::${allocation.slotCode}`) || 0;
        const slotUtilization = safeDivide(allocation.demand, slotSupply);
        const slotGap = slotSupply - allocation.demand;
        const shortageTeacherCount = slotGap < 0 ? Math.abs(slotGap) : 0;
        const warningLevel = getSlotWarningLevel(slotGap, slotUtilization);

        slotAlertRows.push({
          statDate,
          weekLabel: formatWeekLabel(getWeekStart(statDate)),
          slotCode: allocation.slotCode,
          slotDemand: allocation.demand,
          slotSupply,
          slotUtilization,
          slotGap,
          shortageTeacherCount,
          warningLevel,
          warningMessage: getSlotWarningMessage(warningLevel, shortageTeacherCount),
        });
      }
    );
  });

  slotAlertRows.sort((left, right) => {
    if (severityRank[left.warningLevel] !== severityRank[right.warningLevel]) {
      return severityRank[left.warningLevel] - severityRank[right.warningLevel];
    }

    if (right.slotUtilization !== left.slotUtilization) {
      return right.slotUtilization - left.slotUtilization;
    }

    if (left.statDate !== right.statDate) {
      return left.statDate.localeCompare(right.statDate);
    }

    return left.slotCode.localeCompare(right.slotCode);
  });

  const redWarnings =
    trialWeeklyRows.filter((row) => row.warningLevel === "red").length +
    paidWeeklyRows.filter((row) => row.warningLevel === "red").length +
    slotAlertRows.filter((row) => row.warningLevel === "red").length;
  const trialHeadline = pickPriorityRow(trialWeeklyRows, { gapField: "gapTeacherHours", dateField: "weekStart" });
  const paidHeadline = pickPriorityRow(paidWeeklyRows, { gapField: "gapTeacherHours", dateField: "weekStart" });
  const slotHeadline = pickPriorityRow(slotAlertRows, { gapField: "slotGap", dateField: "statDate" });

  return {
    pageTitle: "师资测算与预警",
    activeNav: "forecast",
    settings,
    stats: [
      { label: "体验课周测算", value: trialWeeklyRows.length, hint: "已生成周结果数" },
      { label: "正价课周测算", value: paidWeeklyRows.length, hint: "已生成周结果数" },
      { label: "热门时段预警", value: slotAlertRows.length, hint: "已生成时段预警条数" },
      { label: "红色预警", value: redWarnings, hint: "周度与时段红色预警合计" },
    ],
    trialDailyRows,
    trialDailyRowsPreview: trialDailyRows.slice(-14).reverse(),
    trialWeeklyRows,
    paidWeeklyRows,
    slotAlertRows,
    slotAlertRowsPreview: slotAlertRows.slice(0, 16),
    summaryCards: {
      trial: trialHeadline,
      paid: paidHeadline,
      slot: slotHeadline,
    },
    capacityBaselines: {
      trial: trialTeacherCapacityBaseline,
      paid: paidTeacherCapacityBaseline,
    },
    emptyState:
      sortedDates.length === 0
        ? "当前还没有可用于测算的数据。请先录入日报、教师时段可用性和时段配比配置。"
        : "",
    warnings: [
      trialRatios.length === 0
        ? "尚未配置体验课的时段需求占比，热门时段并发预警暂时无法输出。"
        : "",
      availabilityRows.length === 0
        ? "老师时段可用性暂无数据，供给工时和并发预警会显示为 0。"
        : "",
      paidWeeklyRows.every((row) => row.activeNotDueStudents === 0)
        ? "正价在课未到续费期快照暂无数据，正价课预计学员数暂未包含在读存量。"
        : "",
    ].filter(Boolean),
  };
}

module.exports = {
  buildForecastViewModel,
  getUtilizationWarningLevel,
  getSlotWarningLevel,
};
