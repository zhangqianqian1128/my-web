const { buildForecastViewModel } = require("./forecastService");

function buildDashboard(db) {
  const teacherCount = db.prepare("SELECT COUNT(*) AS count FROM teachers").get().count;
  const leadAssignmentCount = db
    .prepare("SELECT COUNT(*) AS count FROM lead_assignment_daily")
    .get().count;
  const paidOrdersCount = db
    .prepare("SELECT COUNT(*) AS count FROM ecom_paid_orders_daily")
    .get().count;
  const renewalDueCount = db
    .prepare("SELECT COUNT(*) AS count FROM renewal_due_daily")
    .get().count;
  const activeSnapshotCount = db
    .prepare("SELECT COUNT(*) AS count FROM regular_active_snapshot_daily")
    .get().count;
  const slotAvailabilityCount = db
    .prepare("SELECT COUNT(*) AS count FROM teacher_slot_availability")
    .get().count;
  const ratioConfigCount = db
    .prepare("SELECT COUNT(*) AS count FROM slot_ratio_config")
    .get().count;
  const forecastSettingsCount = db
    .prepare("SELECT COUNT(*) AS count FROM forecast_settings")
    .get().count;
  const forecast = buildForecastViewModel(db);

  return {
    pageTitle: "系统总览",
    activeNav: "dashboard",
    heroTitle: "体验课与正价课师资测算和预警系统",
    heroDescription:
      "当前已支持教师档案、按时段供给录入、CSV 导入、体验课/正价课周测算，以及热门时段并发预警。",
    stats: [
      { label: "教师档案", value: teacherCount, hint: "已录入教师人数" },
      { label: "线索分配日报", value: leadAssignmentCount, hint: "已录入日期数" },
      { label: "电商正价单", value: paidOrdersCount, hint: "已录入日期数" },
      {
        label: "续费/在读日报",
        value: renewalDueCount + activeSnapshotCount,
        hint: "续费到期与在读快照合计日期数",
      },
      { label: "老师时段可用性", value: slotAvailabilityCount, hint: "已录入时段记录数" },
      { label: "时段配比配置", value: ratioConfigCount, hint: "已配置时段条数" },
      { label: "测算参数配置", value: forecastSettingsCount, hint: "已配置场景数" },
    ],
    modules: [
      {
        title: "并发供给建模",
        description: "老师可用性已细化到教师、日期、具体时段，能支撑热门时段并发预警。",
      },
      {
        title: "时段需求拆解",
        description: "需求占比已细化到课程类型和具体时段，可按热点时段拆解需求压力。",
      },
      {
        title: "第一版周测算",
        description: "已支持体验课日级推导、周度汇总，以及正价课预计学员数与师资工时测算。",
      },
      {
        title: "预警看板",
        description: "支持绿、黄、橙、红四档预警，并可查看热门时段的并发缺口。",
      },
    ],
    forecastPreview: {
      emptyState: forecast.emptyState,
      warnings: forecast.warnings,
      summaryCards: forecast.summaryCards,
      latestTrialWeek: forecast.trialWeeklyRows[forecast.trialWeeklyRows.length - 1] || null,
      latestPaidWeek: forecast.paidWeeklyRows[forecast.paidWeeklyRows.length - 1] || null,
      slotAlerts: forecast.slotAlertRowsPreview.slice(0, 6),
    },
  };
}

module.exports = { buildDashboard };
