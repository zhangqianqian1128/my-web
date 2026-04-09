const { migrate } = require("./migrate");

function clearDemoTables(db) {
  db.exec(`
    DELETE FROM forecast_results_slots;
    DELETE FROM forecast_results_monthly;
    DELETE FROM forecast_plan_monthly;
    DELETE FROM forecast_assumptions;
    DELETE FROM warning_events;
    DELETE FROM import_batches;
    DELETE FROM teacher_slot_availability;
    DELETE FROM slot_ratio_config;
    DELETE FROM lead_assignment_daily;
    DELETE FROM ecom_paid_orders_daily;
    DELETE FROM renewal_due_daily;
    DELETE FROM regular_active_snapshot_daily;
    DELETE FROM forecast_settings;
    DELETE FROM teachers;
  `);
}

function seedForecastSettings(db) {
  db.prepare(
    `INSERT INTO forecast_settings (
       scenario_name,
       trial_delay_days,
       trial_attend_rate,
       trial_class_size_plan,
       sales_conversion_rate,
       renewal_rate,
       paid_weekly_hours_per_student,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).run("baseline", 2, 0.65, 4, 0.12, 0.72, 0.5);
}

function seedForecastAssumptions(db) {
  const statement = db.prepare(
    `INSERT INTO forecast_assumptions (
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
       enabled,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  [
    ["conservative", "保守", 0.58, 3, 4, 0.1, 7, 7, 3, 0.65, 7, 6, 0.5, 22, 22, 1],
    ["baseline", "基准", 0.65, 2, 4, 0.12, 7, 7, 3, 0.72, 7, 6, 0.5, 24, 24, 1],
    ["optimistic", "乐观", 0.72, 2, 5, 0.14, 6, 6, 2, 0.78, 6, 7, 0.48, 26, 26, 1],
  ].forEach((row) => statement.run(...row));
}

function seedTeachers(db) {
  const statement = db.prepare(
    `INSERT INTO teachers (
       teacher_id,
       teacher_name,
       course_type,
       employment_type,
       weekly_hours,
       enabled,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  [
    [1001, "Trial Teacher", "trial", "full_time", 6, 1],
    [1002, "Paid Teacher", "paid", "full_time", 4, 1],
    [1003, "Shared Teacher", "both", "full_time", 2, 1],
  ].forEach((row) => statement.run(...row));
}

function seedDailyInputs(db) {
  const leadStatement = db.prepare(
    `INSERT INTO lead_assignment_daily (stat_date, assigned_leads, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)`
  );
  const renewalStatement = db.prepare(
    `INSERT INTO renewal_due_daily (stat_date, due_students, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)`
  );
  const ecomStatement = db.prepare(
    `INSERT INTO ecom_paid_orders_daily (stat_date, paid_orders, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)`
  );
  const snapshotStatement = db.prepare(
    `INSERT INTO regular_active_snapshot_daily (stat_date, active_not_due_students, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)`
  );

  [
    ["2026-04-07", 48],
    ["2026-04-08", 52],
  ].forEach((row) => leadStatement.run(...row));

  renewalStatement.run("2026-04-09", 18);
  ecomStatement.run("2026-04-09", 10);
  snapshotStatement.run("2026-04-09", 96);
}

function seedSlotRatios(db) {
  const statement = db.prepare(
    `INSERT INTO slot_ratio_config (course_type, slot_code, ratio, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
  );

  [
    ["trial", "AM_0900", 0.4],
    ["trial", "EVE_1900", 0.6],
    ["paid", "EVE_1900", 1],
  ].forEach((row) => statement.run(...row));
}

function seedAvailability(db) {
  const statement = db.prepare(
    `INSERT INTO teacher_slot_availability (
       teacher_id,
       stat_date,
       slot_code,
       available_flag,
       updated_at
     ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  [
    [1001, "2026-04-09", "AM_0900", 1],
    [1003, "2026-04-09", "AM_0900", 1],
    [1002, "2026-04-09", "EVE_1900", 1],
    [1002, "2026-04-10", "EVE_1900", 1],
  ].forEach((row) => statement.run(...row));
}

function seedFuturePlans(db) {
  const statement = db.prepare(
    `INSERT INTO forecast_plan_monthly (
       forecast_month,
       planned_assigned_leads,
       planned_ecom_orders,
       planned_new_trial_teachers,
       planned_new_regular_teachers,
       planned_trial_teacher_capacity_hours,
       planned_regular_teacher_capacity_hours,
       notes,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  [
    ["2026-05", 420, 48, 0, 0, 0, 0, "五一活动月"],
    ["2026-06", 480, 56, 0, 0, 0, 0, "暑期预热"],
    ["2026-07", 520, 60, 0, 0, 0, 0, "暑期高峰"],
  ].forEach((row) => statement.run(...row));
}

function seedDemo() {
  const db = migrate();
  clearDemoTables(db);
  seedForecastSettings(db);
  seedForecastAssumptions(db);
  seedTeachers(db);
  seedDailyInputs(db);
  seedSlotRatios(db);
  seedAvailability(db);
  seedFuturePlans(db);

  console.log("Demo data initialized.");
  console.log("Expected demo result:");
  console.log("- trial weekly warning: red");
  console.log("- paid weekly warning: red");
  console.log("- hot slot warning: red");
  console.log("- future forecast page available with monthly plans");
}

seedDemo();
