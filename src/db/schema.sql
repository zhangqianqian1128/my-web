CREATE TABLE IF NOT EXISTS teachers (
  teacher_id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_name TEXT NOT NULL,
  course_type TEXT NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  weekly_hours INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_assignment_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL UNIQUE,
  assigned_leads INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ecom_paid_orders_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL UNIQUE,
  paid_orders INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS renewal_due_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL UNIQUE,
  due_students INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS regular_active_snapshot_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL UNIQUE,
  active_not_due_students INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_slot_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES teachers(teacher_id),
  stat_date TEXT NOT NULL,
  slot_code TEXT NOT NULL,
  available_flag INTEGER NOT NULL DEFAULT 1 CHECK(available_flag IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (teacher_id, stat_date, slot_code)
);

CREATE TABLE IF NOT EXISTS slot_ratio_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_type TEXT NOT NULL CHECK(course_type IN ('trial', 'paid')),
  slot_code TEXT NOT NULL,
  ratio REAL NOT NULL DEFAULT 0 CHECK(ratio >= 0 AND ratio <= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (course_type, slot_code)
);

CREATE TABLE IF NOT EXISTS forecast_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_name TEXT NOT NULL UNIQUE,
  trial_delay_days INTEGER NOT NULL DEFAULT 2 CHECK(trial_delay_days >= 0),
  trial_attend_rate REAL NOT NULL DEFAULT 0.65 CHECK(trial_attend_rate >= 0 AND trial_attend_rate <= 1),
  trial_class_size_plan INTEGER NOT NULL DEFAULT 4 CHECK(trial_class_size_plan > 0),
  sales_conversion_rate REAL NOT NULL DEFAULT 0.12 CHECK(sales_conversion_rate >= 0 AND sales_conversion_rate <= 1),
  renewal_rate REAL NOT NULL DEFAULT 0.72 CHECK(renewal_rate >= 0 AND renewal_rate <= 1),
  paid_weekly_hours_per_student REAL NOT NULL DEFAULT 0.5 CHECK(paid_weekly_hours_per_student >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forecast_plan_monthly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_month TEXT NOT NULL UNIQUE,
  planned_assigned_leads INTEGER NOT NULL DEFAULT 0,
  planned_ecom_orders INTEGER NOT NULL DEFAULT 0,
  planned_new_trial_teachers INTEGER NOT NULL DEFAULT 0,
  planned_new_regular_teachers INTEGER NOT NULL DEFAULT 0,
  planned_trial_teacher_capacity_hours REAL NOT NULL DEFAULT 0,
  planned_regular_teacher_capacity_hours REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forecast_assumptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_name TEXT NOT NULL UNIQUE CHECK(scenario_name IN ('conservative', 'baseline', 'optimistic')),
  display_name TEXT NOT NULL,
  trial_attend_rate REAL NOT NULL DEFAULT 0.65 CHECK(trial_attend_rate >= 0 AND trial_attend_rate <= 1),
  trial_delay_days INTEGER NOT NULL DEFAULT 2 CHECK(trial_delay_days >= 0),
  trial_class_size_plan INTEGER NOT NULL DEFAULT 4 CHECK(trial_class_size_plan > 0),
  sales_conversion_rate REAL NOT NULL DEFAULT 0.12 CHECK(sales_conversion_rate >= 0 AND sales_conversion_rate <= 1),
  sales_trial_to_paid_delay_days INTEGER NOT NULL DEFAULT 7 CHECK(sales_trial_to_paid_delay_days >= 0),
  sales_paid_to_start_delay_days INTEGER NOT NULL DEFAULT 7 CHECK(sales_paid_to_start_delay_days >= 0),
  ecom_paid_to_start_delay_days INTEGER NOT NULL DEFAULT 3 CHECK(ecom_paid_to_start_delay_days >= 0),
  renewal_rate REAL NOT NULL DEFAULT 0.72 CHECK(renewal_rate >= 0 AND renewal_rate <= 1),
  renewal_to_start_delay_days INTEGER NOT NULL DEFAULT 7 CHECK(renewal_to_start_delay_days >= 0),
  regular_class_size_plan INTEGER NOT NULL DEFAULT 6 CHECK(regular_class_size_plan > 0),
  regular_student_weekly_hours REAL NOT NULL DEFAULT 0.5 CHECK(regular_student_weekly_hours >= 0),
  trial_teacher_capacity_baseline REAL NOT NULL DEFAULT 24 CHECK(trial_teacher_capacity_baseline > 0),
  regular_teacher_capacity_baseline REAL NOT NULL DEFAULT 24 CHECK(regular_teacher_capacity_baseline > 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forecast_results_monthly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_month TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  course_type TEXT NOT NULL CHECK(course_type IN ('trial', 'paid')),
  projected_students REAL NOT NULL DEFAULT 0,
  demand_teacher_hours REAL NOT NULL DEFAULT 0,
  supply_teacher_hours REAL NOT NULL DEFAULT 0,
  gap_teacher_hours REAL NOT NULL DEFAULT 0,
  gap_teacher_count INTEGER NOT NULL DEFAULT 0,
  utilization REAL NOT NULL DEFAULT 0,
  warning_level TEXT NOT NULL CHECK(warning_level IN ('green', 'yellow', 'orange', 'red')),
  summary_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (forecast_month, scenario_name, course_type)
);

CREATE TABLE IF NOT EXISTS forecast_results_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forecast_month TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  course_type TEXT NOT NULL CHECK(course_type IN ('trial', 'paid')),
  slot_code TEXT NOT NULL,
  projected_required_teachers INTEGER NOT NULL DEFAULT 0,
  projected_available_teachers INTEGER NOT NULL DEFAULT 0,
  slot_gap INTEGER NOT NULL DEFAULT 0,
  slot_gap_teacher_count INTEGER NOT NULL DEFAULT 0,
  slot_utilization REAL NOT NULL DEFAULT 0,
  warning_level TEXT NOT NULL CHECK(warning_level IN ('green', 'yellow', 'orange', 'red')),
  summary_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (forecast_month, scenario_name, course_type, slot_code)
);

CREATE TABLE IF NOT EXISTS warning_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  threshold_value REAL NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warning_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warning_rule_id INTEGER REFERENCES warning_rules(id),
  warning_level TEXT NOT NULL CHECK(warning_level IN ('info', 'warning', 'critical')),
  warning_date TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
  notes TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS predictor_saved_configs (
  config_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_teacher_slot_availability_date_slot
ON teacher_slot_availability (stat_date, slot_code);

CREATE INDEX IF NOT EXISTS idx_teacher_slot_availability_teacher_date
ON teacher_slot_availability (teacher_id, stat_date);

CREATE INDEX IF NOT EXISTS idx_slot_ratio_config_course_type
ON slot_ratio_config (course_type);

CREATE INDEX IF NOT EXISTS idx_forecast_plan_monthly_month
ON forecast_plan_monthly (forecast_month);

CREATE INDEX IF NOT EXISTS idx_forecast_assumptions_enabled
ON forecast_assumptions (enabled);

CREATE INDEX IF NOT EXISTS idx_forecast_results_monthly_lookup
ON forecast_results_monthly (scenario_name, forecast_month, course_type);

CREATE INDEX IF NOT EXISTS idx_forecast_results_slots_lookup
ON forecast_results_slots (scenario_name, forecast_month, course_type, slot_code);

INSERT INTO forecast_settings (
  scenario_name,
  trial_delay_days,
  trial_attend_rate,
  trial_class_size_plan,
  sales_conversion_rate,
  renewal_rate,
  paid_weekly_hours_per_student,
  updated_at
)
VALUES
  ('baseline', 2, 0.65, 4, 0.12, 0.72, 0.5, CURRENT_TIMESTAMP)
ON CONFLICT (scenario_name) DO UPDATE SET
  trial_delay_days = excluded.trial_delay_days,
  trial_attend_rate = excluded.trial_attend_rate,
  trial_class_size_plan = excluded.trial_class_size_plan,
  sales_conversion_rate = excluded.sales_conversion_rate,
  renewal_rate = excluded.renewal_rate,
  paid_weekly_hours_per_student = excluded.paid_weekly_hours_per_student,
  updated_at = CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO warning_rules (code, label, threshold_value, enabled)
VALUES
  ('trial_teacher_gap', '体验课师资缺口预警', 1, 1),
  ('paid_teacher_gap', '正价课师资缺口预警', 1, 1),
  ('conversion_pressure', '转化后正价课承载压力预警', 0.85, 1);

INSERT INTO forecast_assumptions (
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
)
VALUES
  ('conservative', '保守', 0.58, 3, 4, 0.10, 7, 7, 3, 0.65, 7, 6, 0.5, 22, 22, 1, CURRENT_TIMESTAMP),
  ('baseline', '基准', 0.65, 2, 4, 0.12, 7, 7, 3, 0.72, 7, 6, 0.5, 24, 24, 1, CURRENT_TIMESTAMP),
  ('optimistic', '乐观', 0.72, 2, 5, 0.14, 6, 6, 2, 0.78, 6, 7, 0.48, 26, 26, 1, CURRENT_TIMESTAMP)
ON CONFLICT (scenario_name) DO UPDATE SET
  display_name = excluded.display_name,
  trial_attend_rate = excluded.trial_attend_rate,
  trial_delay_days = excluded.trial_delay_days,
  trial_class_size_plan = excluded.trial_class_size_plan,
  sales_conversion_rate = excluded.sales_conversion_rate,
  sales_trial_to_paid_delay_days = excluded.sales_trial_to_paid_delay_days,
  sales_paid_to_start_delay_days = excluded.sales_paid_to_start_delay_days,
  ecom_paid_to_start_delay_days = excluded.ecom_paid_to_start_delay_days,
  renewal_rate = excluded.renewal_rate,
  renewal_to_start_delay_days = excluded.renewal_to_start_delay_days,
  regular_class_size_plan = excluded.regular_class_size_plan,
  regular_student_weekly_hours = excluded.regular_student_weekly_hours,
  trial_teacher_capacity_baseline = excluded.trial_teacher_capacity_baseline,
  regular_teacher_capacity_baseline = excluded.regular_teacher_capacity_baseline,
  enabled = excluded.enabled,
  updated_at = CURRENT_TIMESTAMP;
