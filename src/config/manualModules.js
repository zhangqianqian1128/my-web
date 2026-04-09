const { defaultSlotCodes } = require("./slotCodes");

const BINARY_OPTIONS = [
  { value: "1", label: "是" },
  { value: "0", label: "否" },
];

const courseTypeField = {
  name: "course_type",
  label: "课程类型",
  type: "enum",
  required: true,
  options: ["trial", "paid", "both"],
  formOptions: [
    { value: "trial", label: "体验课" },
    { value: "paid", label: "正价课" },
    { value: "both", label: "两者都可" },
  ],
  aliases: ["课程类型"],
  valueAliases: {
    体验课: "trial",
    正价课: "paid",
    两者都可: "both",
    trial: "trial",
    paid: "paid",
    both: "both",
  },
  displayValueMap: {
    trial: "体验课",
    paid: "正价课",
    both: "两者都可",
  },
};

const paidOnlyCourseTypeField = {
  ...courseTypeField,
  options: ["trial", "paid"],
  formOptions: [
    { value: "trial", label: "体验课" },
    { value: "paid", label: "正价课" },
  ],
  valueAliases: {
    体验课: "trial",
    正价课: "paid",
    trial: "trial",
    paid: "paid",
  },
  displayValueMap: {
    trial: "体验课",
    paid: "正价课",
  },
};

const employmentTypeField = {
  name: "employment_type",
  label: "用工类型",
  type: "enum",
  required: true,
  options: ["full_time", "part_time", "outsourced"],
  formOptions: [
    { value: "full_time", label: "全职" },
    { value: "part_time", label: "兼职" },
    { value: "outsourced", label: "外包" },
  ],
  aliases: ["用工类型"],
  valueAliases: {
    全职: "full_time",
    兼职: "part_time",
    外包: "outsourced",
    full_time: "full_time",
    part_time: "part_time",
    outsourced: "outsourced",
  },
  displayValueMap: {
    full_time: "全职",
    part_time: "兼职",
    outsourced: "外包",
  },
};

const forecastScenarioField = {
  name: "scenario_name",
  label: "情景名称",
  type: "enum",
  required: true,
  options: ["conservative", "baseline", "optimistic"],
  formOptions: [
    { value: "conservative", label: "保守" },
    { value: "baseline", label: "基准" },
    { value: "optimistic", label: "乐观" },
  ],
  aliases: ["情景名称"],
  valueAliases: {
    保守: "conservative",
    基准: "baseline",
    乐观: "optimistic",
    conservative: "conservative",
    baseline: "baseline",
    optimistic: "optimistic",
  },
  displayValueMap: {
    conservative: "保守",
    baseline: "基准",
    optimistic: "乐观",
  },
};

function buildBinaryField(name, label) {
  return {
    name,
    label,
    type: "enum",
    required: true,
    options: BINARY_OPTIONS.map((option) => option.value),
    formOptions: BINARY_OPTIONS,
    aliases: [label],
    valueAliases: {
      是: 1,
      否: 0,
      1: 1,
      0: 0,
    },
    displayValueMap: {
      1: "是",
      0: "否",
    },
  };
}

function buildDateField(name, label) {
  return {
    name,
    label,
    type: "date",
    required: true,
    aliases: [label],
  };
}

function buildMonthField(name, label) {
  return {
    name,
    label,
    type: "month",
    required: true,
    aliases: [label],
  };
}

function buildIntegerField(name, label, min = 0, options = {}) {
  return {
    name,
    label,
    type: "integer",
    required: options.required ?? true,
    min,
    max: options.max,
    aliases: [label],
    helpText: options.helpText,
  };
}

function buildNumberField(name, label, options = {}) {
  return {
    name,
    label,
    type: "number",
    required: true,
    min: options.min ?? 0,
    max: options.max,
    step: options.step || "0.01",
    aliases: [label],
  };
}

function buildTextField(name, label, options = {}) {
  return {
    name,
    label,
    type: "text",
    required: options.required ?? true,
    aliases: [label],
  };
}

function isValidMonthValue(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) {
    return false;
  }

  const month = Number(String(value).slice(5, 7));
  return month >= 1 && month <= 12;
}

function getFieldDisplayValue(field, value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (!field.displayValueMap) {
    return value;
  }

  return field.displayValueMap[String(value)] ?? value;
}

function validateTeacherExists(db, teacherId) {
  const teacher = db
    .prepare("SELECT teacher_id FROM teachers WHERE teacher_id = ?")
    .get(Number(teacherId));

  return Boolean(teacher);
}

function validateSlotRatioSum(db, payload, recordId, pendingRows = []) {
  const rows = db
    .prepare("SELECT id, course_type, slot_code, ratio FROM slot_ratio_config WHERE course_type = ?")
    .all(payload.course_type);

  const existingTotal = rows.reduce((sum, row) => {
    if (recordId && Number(row.id) === Number(recordId)) {
      return sum;
    }

    if (row.slot_code === payload.slot_code) {
      return sum;
    }

    return sum + row.ratio;
  }, 0);

  const pendingTotal = pendingRows.reduce((sum, row) => {
    if (row.course_type !== payload.course_type) {
      return sum;
    }

    if (row.slot_code === payload.slot_code) {
      return sum;
    }

    return sum + Number(row.ratio || 0);
  }, 0);

  const nextTotal = existingTotal + pendingTotal + Number(payload.ratio || 0);

  if (nextTotal > 1.000001) {
    const courseTypeLabel = getFieldDisplayValue(paidOnlyCourseTypeField, payload.course_type);
    return `${courseTypeLabel} 的时段占比合计不能超过 1，当前将达到 ${nextTotal.toFixed(2)}。`;
  }

  return "";
}

function validateScenarioExists(db, scenarioName) {
  const row = db
    .prepare("SELECT scenario_name FROM forecast_assumptions WHERE scenario_name = ?")
    .get(String(scenarioName || "").trim());

  return Boolean(row);
}

const teacherImportModule = {
  slug: "teacher-roster",
  templateKey: "teacher_roster",
  pageRoute: "/teachers/manage",
  tableName: "teachers",
  title: "教师花名册",
  description: "用于批量导入教师档案。",
  conflictFields: ["teacher_id"],
  orderBy: "teacher_id DESC",
  fields: [
    { ...buildIntegerField("teacher_id", "教师ID"), aliases: ["教师ID", "teacher_id"] },
    { ...buildTextField("teacher_name", "教师姓名"), aliases: ["教师姓名", "teacher_name"] },
    { ...courseTypeField, aliases: ["课程类型", "course_type"] },
    { ...employmentTypeField, aliases: ["用工类型", "employment_type"] },
    { ...buildIntegerField("weekly_hours", "周课时"), aliases: ["周课时", "weekly_hours"] },
    { ...buildBinaryField("enabled", "是否启用"), aliases: ["是否启用", "enabled"] },
  ],
  sampleRows: [
    {
      teacher_id: 1001,
      teacher_name: "张老师",
      course_type: "trial",
      employment_type: "full_time",
      weekly_hours: 24,
      enabled: 1,
    },
    {
      teacher_id: 1002,
      teacher_name: "李老师",
      course_type: "paid",
      employment_type: "part_time",
      weekly_hours: 12,
      enabled: 1,
    },
    {
      teacher_id: 1003,
      teacher_name: "王老师",
      course_type: "both",
      employment_type: "outsourced",
      weekly_hours: 18,
      enabled: 0,
    },
  ],
};

const manualModules = [
  {
    slug: "lead-assignment-daily",
    templateKey: "lead_assignment_daily",
    pageRoute: "/manual/lead-assignment-daily",
    tableName: "lead_assignment_daily",
    title: "线索分配日报",
    description: "录入每天分配给顾问或销售的线索数量。",
    conflictFields: ["stat_date"],
    orderBy: "stat_date DESC, id DESC",
    fields: [
      { ...buildDateField("stat_date", "日期"), aliases: ["日期", "stat_date"] },
      {
        ...buildIntegerField("assigned_leads", "分配线索数"),
        aliases: ["分配线索数", "assigned_leads"],
      },
    ],
    sampleRows: [
      { stat_date: "2026-04-01", assigned_leads: 35 },
      { stat_date: "2026-04-02", assigned_leads: 42 },
      { stat_date: "2026-04-03", assigned_leads: 38 },
    ],
  },
  {
    slug: "ecom-paid-orders-daily",
    templateKey: "ecom_paid_orders_daily",
    pageRoute: "/manual/ecom-paid-orders-daily",
    tableName: "ecom_paid_orders_daily",
    title: "电商正价单日报",
    description: "录入每天电商渠道的正价支付单量。",
    conflictFields: ["stat_date"],
    orderBy: "stat_date DESC, id DESC",
    fields: [
      { ...buildDateField("stat_date", "日期"), aliases: ["日期", "stat_date"] },
      {
        ...buildIntegerField("paid_orders", "电商订单数"),
        aliases: ["电商订单数", "paid_orders"],
      },
    ],
    sampleRows: [
      { stat_date: "2026-04-01", paid_orders: 8 },
      { stat_date: "2026-04-02", paid_orders: 11 },
      { stat_date: "2026-04-03", paid_orders: 9 },
    ],
  },
  {
    slug: "renewal-due-daily",
    templateKey: "renewal_due_daily",
    pageRoute: "/manual/renewal-due-daily",
    tableName: "renewal_due_daily",
    title: "续费到期日报",
    description: "录入每天即将到期或到期待续费的学员数。",
    conflictFields: ["stat_date"],
    orderBy: "stat_date DESC, id DESC",
    fields: [
      { ...buildDateField("stat_date", "日期"), aliases: ["日期", "stat_date"] },
      {
        ...buildIntegerField("due_students", "到续费期人数"),
        aliases: ["到续费期人数", "due_students"],
      },
    ],
    sampleRows: [
      { stat_date: "2026-04-01", due_students: 16 },
      { stat_date: "2026-04-02", due_students: 20 },
      { stat_date: "2026-04-03", due_students: 18 },
    ],
  },
  {
    slug: "regular-active-snapshot-daily",
    templateKey: "regular_active_snapshot_daily",
    pageRoute: "/manual/regular-active-snapshot-daily",
    tableName: "regular_active_snapshot_daily",
    title: "在读未到期快照日报",
    description: "录入每天正价在读且未到期学员快照。",
    conflictFields: ["stat_date"],
    orderBy: "stat_date DESC, id DESC",
    fields: [
      { ...buildDateField("stat_date", "日期"), aliases: ["日期", "stat_date"] },
      {
        ...buildIntegerField("active_not_due_students", "正价在课未到续费期人数"),
        aliases: ["正价在课未到续费期人数", "active_not_due_students"],
      },
    ],
    sampleRows: [
      { stat_date: "2026-04-01", active_not_due_students: 128 },
      { stat_date: "2026-04-02", active_not_due_students: 131 },
      { stat_date: "2026-04-03", active_not_due_students: 129 },
    ],
  },
  {
    slug: "teacher-slot-availability",
    templateKey: "teacher_slot_availability",
    pageRoute: "/manual/teacher-slot-availability",
    tableName: "teacher_slot_availability",
    title: "教师时段可用性",
    description: "按老师 + 日期 + 具体时段维护可用性，支持热门时段并发预警。",
    conflictFields: ["teacher_id", "stat_date", "slot_code"],
    orderBy: "stat_date DESC, slot_code ASC, teacher_id ASC, id DESC",
    notes: [
      "必须按具体 slot_code 录入，不再使用 available_slots 聚合字段。",
      "slot_code 需要与 slot_ratio_config 中的 slot_code 保持一致，热门时段预警才能正确拆解。",
    ],
    fields: [
      { ...buildIntegerField("teacher_id", "教师ID"), aliases: ["教师ID", "teacher_id"] },
      { ...buildDateField("stat_date", "日期"), aliases: ["日期", "stat_date"] },
      { ...buildTextField("slot_code", "时段编码"), aliases: ["时段编码", "slot_code"] },
      { ...buildBinaryField("available_flag", "是否可用"), aliases: ["是否可用", "available_flag"] },
    ],
    sampleRows: [
      {
        teacher_id: 1001,
        stat_date: "2026-04-07",
        slot_code: defaultSlotCodes[0] || "AM_0900",
        available_flag: 1,
      },
      {
        teacher_id: 1001,
        stat_date: "2026-04-07",
        slot_code: defaultSlotCodes[4] || "EVE_1900",
        available_flag: 1,
      },
      {
        teacher_id: 1002,
        stat_date: "2026-04-07",
        slot_code: defaultSlotCodes[0] || "AM_0900",
        available_flag: 0,
      },
    ],
    customValidate(payload, { db }) {
      if (!validateTeacherExists(db, payload.teacher_id)) {
        return "教师ID 不存在，请先在教师档案中维护老师。";
      }

      return "";
    },
  },
  {
    slug: "slot-ratio-config",
    templateKey: "slot_ratio_config",
    pageRoute: "/manual/slot-ratio-config",
    tableName: "slot_ratio_config",
    title: "时段需求配比",
    description: "按课程类型 + 具体时段配置需求拆解比例，用于热门时段并发预警。",
    conflictFields: ["course_type", "slot_code"],
    orderBy: "course_type ASC, slot_code ASC, id DESC",
    notes: [
      "必须使用 course_type + slot_code + ratio，不再使用 config_key + ratio_value。",
      "同一课程类型下 ratio 合计不能超过 1；建议最终补齐到 1，便于完整拆解周需求。",
    ],
    fields: [
      { ...paidOnlyCourseTypeField, aliases: ["课程类型", "course_type"] },
      { ...buildTextField("slot_code", "时段编码"), aliases: ["时段编码", "slot_code"] },
      { ...buildNumberField("ratio", "占比", { min: 0, max: 1, step: "0.01" }), aliases: ["占比", "ratio"] },
    ],
    sampleRows: [
      { course_type: "trial", slot_code: defaultSlotCodes[0] || "AM_0900", ratio: 0.45 },
      { course_type: "trial", slot_code: defaultSlotCodes[4] || "EVE_1900", ratio: 0.35 },
      { course_type: "paid", slot_code: defaultSlotCodes[4] || "EVE_1900", ratio: 0.55 },
    ],
    customValidate(payload, { db, recordId, validRows }) {
      return validateSlotRatioSum(db, payload, recordId, validRows);
    },
  },
  {
    slug: "forecast-settings",
    templateKey: "forecast_settings",
    pageRoute: "/manual/forecast-settings",
    tableName: "forecast_settings",
    title: "测算参数配置",
    description: "维护体验课与正价课第一版测算参数。",
    conflictFields: ["scenario_name"],
    orderBy: "updated_at DESC, id DESC",
    notes: [
      "测算页当前默认读取 scenario_name = baseline。",
      "sales_conversion_rate 为第一版销售转正起量估算参数。",
    ],
    fields: [
      { ...buildTextField("scenario_name", "场景名称"), aliases: ["场景名称", "scenario_name"] },
      { ...buildIntegerField("trial_delay_days", "体验课延迟天数"), aliases: ["体验课延迟天数", "trial_delay_days"] },
      {
        ...buildNumberField("trial_attend_rate", "体验课到访率", { min: 0, max: 1, step: "0.01" }),
        aliases: ["体验课到访率", "trial_attend_rate"],
      },
      { ...buildIntegerField("trial_class_size_plan", "体验课计划班容", 1), aliases: ["体验课计划班容", "trial_class_size_plan"] },
      {
        ...buildNumberField("sales_conversion_rate", "销售转化率", { min: 0, max: 1, step: "0.01" }),
        aliases: ["销售转化率", "sales_conversion_rate"],
      },
      {
        ...buildNumberField("renewal_rate", "续费率", { min: 0, max: 1, step: "0.01" }),
        aliases: ["续费率", "renewal_rate"],
      },
      {
        ...buildNumberField("paid_weekly_hours_per_student", "正价课单生周工时", {
          min: 0,
          step: "0.01",
        }),
        aliases: ["正价课单生周工时", "paid_weekly_hours_per_student"],
      },
    ],
    sampleRows: [
      {
        scenario_name: "baseline",
        trial_delay_days: 2,
        trial_attend_rate: 0.65,
        trial_class_size_plan: 4,
        sales_conversion_rate: 0.12,
        renewal_rate: 0.72,
        paid_weekly_hours_per_student: 0.5,
      },
    ],
  },
  {
    slug: "forecast-plan-monthly",
    templateKey: "forecast_plan_monthly",
    pageRoute: "/manual/forecast-plan-monthly",
    tableName: "forecast_plan_monthly",
    title: "未来月份计划",
    description: "录入未来月份经营计划值，作为未来预测的计划输入。",
    conflictFields: ["forecast_month"],
    orderBy: "forecast_month ASC, id DESC",
    notes: [
      "计划体验课师资工时和计划正价课师资工时填 0 时，会回退到当前老师供给基线。",
      "计划新增老师数会作为增量供给预留字段，在未来预测中用于补充月度供给。",
    ],
    fields: [
      {
        ...buildMonthField("forecast_month", "预测月份"),
        aliases: ["预测月份", "forecast_month"],
        helpText: "格式 YYYY-MM，例如 2026-05",
      },
      {
        ...buildIntegerField("planned_assigned_leads", "计划线索数"),
        aliases: ["计划线索数", "planned_assigned_leads"],
      },
      {
        ...buildIntegerField("planned_ecom_orders", "计划电商订单数"),
        aliases: ["计划电商订单数", "planned_ecom_orders"],
      },
      {
        ...buildIntegerField("planned_new_trial_teachers", "计划新增体验课老师数"),
        aliases: ["计划新增体验课老师数", "planned_new_trial_teachers"],
      },
      {
        ...buildIntegerField("planned_new_regular_teachers", "计划新增正价课老师数"),
        aliases: ["计划新增正价课老师数", "planned_new_regular_teachers"],
      },
      {
        ...buildNumberField("planned_trial_teacher_capacity_hours", "计划体验课师资工时", {
          min: 0,
          step: "0.01",
        }),
        aliases: ["计划体验课师资工时", "planned_trial_teacher_capacity_hours"],
      },
      {
        ...buildNumberField("planned_regular_teacher_capacity_hours", "计划正价课师资工时", {
          min: 0,
          step: "0.01",
        }),
        aliases: ["计划正价课师资工时", "planned_regular_teacher_capacity_hours"],
      },
      {
        ...buildTextField("notes", "备注", { required: false }),
        aliases: ["备注", "notes"],
      },
    ],
    sampleRows: [
      {
        forecast_month: "2026-05",
        planned_assigned_leads: 420,
        planned_ecom_orders: 46,
        planned_new_trial_teachers: 1,
        planned_new_regular_teachers: 1,
        planned_trial_teacher_capacity_hours: 0,
        planned_regular_teacher_capacity_hours: 0,
        notes: "五一活动月",
      },
      {
        forecast_month: "2026-06",
        planned_assigned_leads: 460,
        planned_ecom_orders: 52,
        planned_new_trial_teachers: 1,
        planned_new_regular_teachers: 2,
        planned_trial_teacher_capacity_hours: 0,
        planned_regular_teacher_capacity_hours: 0,
        notes: "暑期预热",
      },
    ],
    customValidate(payload) {
      if (!isValidMonthValue(payload.forecast_month)) {
        return "预测月份必须是 YYYY-MM 格式。";
      }

      return "";
    },
  },
  {
    slug: "forecast-assumptions",
    templateKey: "forecast_assumptions",
    pageRoute: "/manual/forecast-assumptions",
    tableName: "forecast_assumptions",
    title: "未来预测假设",
    description: "配置保守、基准、乐观三类未来预测假设参数。",
    conflictFields: ["scenario_name"],
    orderBy: "id ASC",
    notes: [
      "future 预测页面默认读取 enabled = 1 的情景，并优先使用 baseline。",
      "若没有单独计划供给工时，未来月份预测会回退到这里的折算周容量与当前老师基线。",
    ],
    fields: [
      { ...forecastScenarioField, aliases: ["情景名称", "scenario_name"] },
      { ...buildTextField("display_name", "展示名称"), aliases: ["展示名称", "display_name"] },
      {
        ...buildNumberField("trial_attend_rate", "体验课到访率", { min: 0, max: 1, step: "0.01" }),
        aliases: ["体验课到访率", "trial_attend_rate"],
      },
      {
        ...buildIntegerField("trial_delay_days", "体验课延迟天数"),
        aliases: ["体验课延迟天数", "trial_delay_days"],
      },
      {
        ...buildIntegerField("trial_class_size_plan", "体验课计划班容", 1),
        aliases: ["体验课计划班容", "trial_class_size_plan"],
      },
      {
        ...buildNumberField("sales_conversion_rate", "销售转化率", { min: 0, max: 1, step: "0.01" }),
        aliases: ["销售转化率", "sales_conversion_rate"],
      },
      {
        ...buildIntegerField("sales_trial_to_paid_delay_days", "销售体验转正延迟天数"),
        aliases: ["销售体验转正延迟天数", "sales_trial_to_paid_delay_days"],
      },
      {
        ...buildIntegerField("sales_paid_to_start_delay_days", "销售签约开课延迟天数"),
        aliases: ["销售签约开课延迟天数", "sales_paid_to_start_delay_days"],
      },
      {
        ...buildIntegerField("ecom_paid_to_start_delay_days", "电商签约开课延迟天数"),
        aliases: ["电商签约开课延迟天数", "ecom_paid_to_start_delay_days"],
      },
      {
        ...buildNumberField("renewal_rate", "续费率", { min: 0, max: 1, step: "0.01" }),
        aliases: ["续费率", "renewal_rate"],
      },
      {
        ...buildIntegerField("renewal_to_start_delay_days", "续费承接开课延迟天数"),
        aliases: ["续费承接开课延迟天数", "renewal_to_start_delay_days"],
      },
      {
        ...buildIntegerField("regular_class_size_plan", "正价课计划班容", 1),
        aliases: ["正价课计划班容", "regular_class_size_plan"],
      },
      {
        ...buildNumberField("regular_student_weekly_hours", "正价课单生周工时", {
          min: 0,
          step: "0.01",
        }),
        aliases: ["正价课单生周工时", "regular_student_weekly_hours"],
      },
      {
        ...buildNumberField("trial_teacher_capacity_baseline", "体验课折算周容量", {
          min: 0.01,
          step: "0.01",
        }),
        aliases: ["体验课折算周容量", "trial_teacher_capacity_baseline"],
      },
      {
        ...buildNumberField("regular_teacher_capacity_baseline", "正价课折算周容量", {
          min: 0.01,
          step: "0.01",
        }),
        aliases: ["正价课折算周容量", "regular_teacher_capacity_baseline"],
      },
      { ...buildBinaryField("enabled", "是否启用"), aliases: ["是否启用", "enabled"] },
    ],
    sampleRows: [
      {
        scenario_name: "conservative",
        display_name: "保守",
        trial_attend_rate: 0.58,
        trial_delay_days: 3,
        trial_class_size_plan: 4,
        sales_conversion_rate: 0.1,
        sales_trial_to_paid_delay_days: 7,
        sales_paid_to_start_delay_days: 7,
        ecom_paid_to_start_delay_days: 3,
        renewal_rate: 0.65,
        renewal_to_start_delay_days: 7,
        regular_class_size_plan: 6,
        regular_student_weekly_hours: 0.5,
        trial_teacher_capacity_baseline: 22,
        regular_teacher_capacity_baseline: 22,
        enabled: 1,
      },
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
      {
        scenario_name: "optimistic",
        display_name: "乐观",
        trial_attend_rate: 0.72,
        trial_delay_days: 2,
        trial_class_size_plan: 5,
        sales_conversion_rate: 0.14,
        sales_trial_to_paid_delay_days: 6,
        sales_paid_to_start_delay_days: 6,
        ecom_paid_to_start_delay_days: 2,
        renewal_rate: 0.78,
        renewal_to_start_delay_days: 6,
        regular_class_size_plan: 7,
        regular_student_weekly_hours: 0.48,
        trial_teacher_capacity_baseline: 26,
        regular_teacher_capacity_baseline: 26,
        enabled: 1,
      },
    ],
  },
];

function getManualModule(slug) {
  return manualModules.find((module) => module.slug === slug);
}

function getImportModuleByTemplateKey(templateKey) {
  if (templateKey === teacherImportModule.templateKey) {
    return teacherImportModule;
  }

  return manualModules.find((module) => module.templateKey === templateKey);
}

function getImportModules() {
  return [teacherImportModule, ...manualModules];
}

module.exports = {
  manualModules,
  teacherImportModule,
  getFieldDisplayValue,
  getManualModule,
  getImportModuleByTemplateKey,
  getImportModules,
};
