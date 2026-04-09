# 体验课与正价课师资测算与预警系统

## 项目用途

这是一个基于 Node.js + Express + SQLite + EJS 的独立系统，用于支持：

- 体验课师资测算与缺口预警
- 正价课师资测算与缺口预警
- 热门时段并发预警
- 未来月份体验课 / 正价课 / 热门时段预测
- 基础数据的手工录入与 CSV 导入

系统对外页面、模板和字段说明尽量中文化；数据库字段、内部代码字段和内部枚举值继续保留英文，便于开发维护。

## 技术栈

- Node.js 24+
- Express
- SQLite
- EJS
- 原生 CSS

## 本地启动

安装依赖并启动：

```bash
npm install
npm start
```

默认访问地址：

```text
http://localhost:3000
```

开发模式：

```bash
npm run dev
```

语法检查：

```bash
npm run check
```

## 数据库初始化

初始化表结构：

```bash
npm run db:init
```

初始化最小 demo 数据：

```bash
npm run demo:init
```

如果希望用独立 demo 库，不影响当前业务数据：

```bash
DB_PATH=data/teacher-warning-demo.db npm run demo:init
DB_PATH=data/teacher-warning-demo.db npm start
```

## 页面地址

- `/`
  系统总览与预警预览
- `/forecast`
  完整测算页
- `/forecast/future`
  未来月份预测页
- `/forecast/simulator`
  轻量级师资快速预测器
- `/teachers/manage`
  教师档案管理
- `/manual/lead-assignment-daily`
  线索分配日报
- `/manual/ecom-paid-orders-daily`
  电商正价单日报
- `/manual/renewal-due-daily`
  续费到期日报
- `/manual/regular-active-snapshot-daily`
  在读未到期快照日报
- `/manual/teacher-slot-availability`
  教师时段可用性
- `/manual/slot-ratio-config`
  时段需求配比
- `/manual/forecast-settings`
  测算参数配置
- `/manual/forecast-plan-monthly`
  未来月份计划
- `/manual/forecast-assumptions`
  未来预测假设
- `/imports`
  CSV 模板中心
- `/health`
  健康检查

## 手工录入说明

### 教师档案

页面：`/teachers/manage`

用于维护老师基础信息：

- 教师ID
- 教师姓名
- 课程类型
- 用工类型
- 周课时
- 是否启用

### 日报与配置页面

页面：`/manual/*`

支持维护以下数据：

- 线索分配日报
- 电商正价单日报
- 续费到期日报
- 在读未到期快照日报
- 教师时段可用性
- 时段需求配比
- 测算参数配置
- 未来月份计划
- 未来预测假设

其中：

- 教师时段可用性必须按 `教师ID + 日期 + 时段编码 + 是否可用` 逐条维护
- 时段需求配比必须按 `课程类型 + 时段编码 + 占比` 维护

## 轻量级快速预测器说明

页面：`/forecast/simulator`

这个页面用于快速试算体验课、正价课和热门时段风险，特点是：

- 不依赖 CSV
- 不依赖 `teacher_roster`
- 不依赖 `teacher_slot_availability`
- 不依赖历史日报
- 所有输入集中在一个页面完成

### 正价课承载人数口径

轻量预测器中，正价课预计承载人数统一按以下公式计算：

```text
预计正价承载人数 =
当前总在课人数
- 本期待续费人数 × 续费流失率
+ 预测周期销售转化入课人数
+ 预测周期电商新签入课人数
```

这样处理的原因是：

- 当前总在课人数默认已经包含本期待续费人数
- 因此这里只扣“续费流失部分”
- 不再使用“当前总在课人数 + 续费留存人数”的写法，避免重复计算

### 热门时段试算口径

轻量预测器中的热门时段预警，按“周均需求”试算，而不是直接拿整个预测周期总班次数去和单周老师供给比较。

热门时段占比表示“该热门时段班次数占周总班次数的比例”：

- 合计可以小于 `1`
- 只要合计不超过 `1` 即可
- 未配置的剩余占比，视为普通时段，当前不单独展开预测

体验课热门时段：

```text
体验课周均需求班次数 = ceil(体验课总需求班次数 / 预测周期周数)
某时段周均需求老师数 = ceil(体验课周均需求班次数 × 该时段占比)
```

正价课热门时段：

```text
正价课周均需求班次数 = ceil(正价课总需求班次数 / 预测周期周数)
某时段周均需求老师数 = ceil(正价课周均需求班次数 × 该时段占比)
```

### 轻量版假设

为了保持快速输入、快速试算，当前轻量版默认假设：

- 该课程类型所有老师都可参与该时段供给

这只是快速预测口径，不等同于真实排班能力。若后续需要更精细的时段供给判断，再单独扩展时段可用老师数输入。

## 中文模板说明

当前下载模板时，CSV 采用中文表头；示例值也会尽量使用中文业务值。  
导入时同时兼容：

- 中文表头 + 中文值
- 英文表头 + 英文值
- 中英混用

### 已支持中文模板的文件

- `teacher_roster`
- `lead_assignment_daily`
- `ecom_paid_orders_daily`
- `renewal_due_daily`
- `regular_active_snapshot_daily`
- `teacher_slot_availability`
- `slot_ratio_config`
- `forecast_settings`
- `forecast_plan_monthly`
- `forecast_assumptions`

### teacher_roster 中文模板

中文表头：

```text
教师ID,教师姓名,课程类型,用工类型,周课时,是否启用
```

中文值映射：

- 课程类型
  - `体验课 -> trial`
  - `正价课 -> paid`
  - `两者都可 -> both`
- 用工类型
  - `全职 -> full_time`
  - `兼职 -> part_time`
  - `外包 -> outsourced`
- 是否启用
  - `是 -> 1`
  - `否 -> 0`

### teacher_slot_availability 中文模板

中文表头：

```text
教师ID,日期,时段编码,是否可用
```

中文值映射：

- 是否可用
  - `是 -> 1`
  - `否 -> 0`

### slot_ratio_config 中文模板

中文表头：

```text
课程类型,时段编码,占比
```

中文值映射：

- `体验课 -> trial`
- `正价课 -> paid`

### 其余日报模板中文表头

- 线索分配日报：`日期,分配线索数`
- 电商正价单日报：`日期,电商订单数`
- 续费到期日报：`日期,到续费期人数`
- 在读未到期快照日报：`日期,正价在课未到续费期人数`
- 测算参数配置：
  `场景名称,体验课延迟天数,体验课到访率,体验课计划班容,销售转化率,续费率,正价课单生周工时`
- 未来月份计划：
  `预测月份,计划线索数,计划电商订单数,计划新增体验课老师数,计划新增正价课老师数,计划体验课师资工时,计划正价课师资工时,备注`
- 未来预测假设：
  `情景名称,展示名称,体验课到访率,体验课延迟天数,体验课计划班容,销售转化率,销售体验转正延迟天数,销售签约开课延迟天数,电商签约开课延迟天数,续费率,续费承接开课延迟天数,正价课计划班容,正价课单生周工时,体验课折算周容量,正价课折算周容量,是否启用`

## 中英文字段映射说明

### 教师档案

| 中文字段 | 内部字段 |
|---|---|
| 教师ID | `teacher_id` |
| 教师姓名 | `teacher_name` |
| 课程类型 | `course_type` |
| 用工类型 | `employment_type` |
| 周课时 | `weekly_hours` |
| 是否启用 | `enabled` |

### 教师时段可用性

| 中文字段 | 内部字段 |
|---|---|
| 教师ID | `teacher_id` |
| 日期 | `stat_date` |
| 时段编码 | `slot_code` |
| 是否可用 | `available_flag` |

### 时段需求配比

| 中文字段 | 内部字段 |
|---|---|
| 课程类型 | `course_type` |
| 时段编码 | `slot_code` |
| 占比 | `ratio` |

### 常用枚举值

| 中文值 | 内部值 |
|---|---|
| 体验课 | `trial` |
| 正价课 | `paid` |
| 两者都可 | `both` |
| 全职 | `full_time` |
| 兼职 | `part_time` |
| 外包 | `outsourced` |
| 是 | `1` |
| 否 | `0` |

## CSV 导入规则

### teacher_slot_availability

- 教师ID必须先存在于教师档案
- 日期必须是 `YYYY-MM-DD`
- 时段编码必填
- 是否可用只能为 `是/否` 或 `1/0`
- 同一批 CSV 中 `(teacher_id, stat_date, slot_code)` 不能重复

### slot_ratio_config

- 课程类型只能是 `体验课/正价课` 或 `trial/paid`
- 占比必须是 `0 ~ 1` 的数字
- 同一批 CSV 中 `(course_type, slot_code)` 不能重复
- 同一课程类型下，占比合计不能超过 `1`

## 测算与预警逻辑

公式落点：

- `src/services/forecastService.js`
- `src/services/dashboardService.js`

### 体验课

```text
trial_arrivals[d] = lead_assignment[d - trial_delay_days] * trial_attend_rate
trial_classes[d] = ceil(trial_arrivals[d] / trial_class_size_plan)
trial_teacher_hours_demand[d] = trial_classes[d]
```

页面中文说明：

- 师资需求工时
- 师资供给工时
- 利用率
- 工时差额
- 预警等级

### 正价课

需求来源包含：

- 当前在读未到期学员
- 到期待续费学员 × 续费率
- 销售转化起量
- 电商起量

输出包含：

- 预计总学员数
- 正价课需求工时
- 正价课供给工时
- 利用率
- 工时差额
- 预警等级

### 热门时段并发预警

当前输出：

- 时段需求
- 时段供给
- 时段利用率
- 时段缺口
- 预警等级

## 预警规则

容量预警：

- `green`：`utilization < 0.8`
- `yellow`：`0.8 <= utilization < 0.9`
- `orange`：`0.9 <= utilization <= 1.0`
- `red`：`utilization > 1.0`

时段预警：

- `red`：`slot_gap < 0`
- `orange`：`slot_gap == 0`
- `yellow`：`slot_utilization >= 0.9`

## 未来月份预测

页面入口：

- `/forecast/future`

输入来源：

- `forecast_plan_monthly`
  未来月份计划值
- `forecast_assumptions`
  保守 / 基准 / 乐观情景假设

输出落库：

- `forecast_results_monthly`
  月度体验课 / 正价课预测结果
- `forecast_results_slots`
  月度热门时段预测结果

说明：

- `forecast_plan_monthly` 与 `forecast_assumptions` 支持手工录入、中文模板下载与 CSV 导入
- `forecast_results_monthly` 与 `forecast_results_slots` 为系统自动生成结果表，当前不提供手工编辑入口

### 未来体验课预测公式

```text
projected_trial_arrivals = planned_assigned_leads * trial_attend_rate
projected_trial_classes = ceil(projected_trial_arrivals / trial_class_size_plan)
projected_trial_demand_teacher_hours = projected_trial_classes
```

月度供给：

- 优先使用 `planned_trial_teacher_capacity_hours`
- 若为 `0`，回退到当前已启用老师的月度供给基线
- 再叠加 `planned_new_trial_teachers * trial_teacher_capacity_baseline * 月周系数`

### 未来正价课预测公式

```text
projected_paid_students =
  existing_active_base
  + projected_renewal_students
  + projected_sales_regular_starts
  + projected_ecom_regular_starts
```

其中：

- `existing_active_base`
  取最近一次 `regular_active_snapshot_daily` 快照，并按月份滚动结转
- `projected_renewal_students`
  取最近实际月均 `renewal_due_daily` 外推值 × `renewal_rate`
- `projected_sales_regular_starts`
  `planned_assigned_leads * sales_conversion_rate`
- `projected_ecom_regular_starts`
  `planned_ecom_orders`

当前版本暂未引入流失学员扣减，README 与页面中均已明确提示。

正价课月度需求工时：

```text
projected_paid_demand_teacher_hours =
  ceil(projected_paid_students * regular_student_weekly_hours / regular_class_size_plan)
```

### 热门时段未来预测

未来时段需求继续基于 `slot_ratio_config` 拆解：

- 体验课：`projected_trial_arrivals * slot_ratio / trial_class_size_plan`
- 正价课：`projected_paid_students * slot_ratio / regular_class_size_plan`

未来时段供给当前采用最小可用版本：

- 先按当前 `teacher_slot_availability` 的平均时段供给水平外推
- 再叠加未来计划中的新增老师数

当前还没有独立“月度时段供给计划表”，因此这部分属于基线外推。

### 未来预测验证方式

```bash
npm run demo:init
npm start
```

打开：

- `/forecast/future`
- `/manual/forecast-plan-monthly`
- `/manual/forecast-assumptions`

可验证：

- 情景切换：保守 / 基准 / 乐观
- 月度体验课预测表
- 月度正价课预测表
- 月度热门时段预测表
- 中文模板下载与中文 CSV 导入

## 如何验证体验课 / 正价课 / 热门时段预警

### 方式一：直接使用 demo 数据

```bash
npm run demo:init
npm start
```

打开：

- `/forecast`
- `/`

你应当看到：

- 体验课 red
- 正价课 red
- 热门时段 red

### 方式二：手工录入验证

1. 先维护教师档案
2. 再维护教师时段可用性
3. 再维护时段需求配比
4. 再维护线索、续费、电商、在读快照
5. 打开 `/forecast` 查看结果

## Demo 数据初始化说明

`npm run demo:init` 会写入一组最小可复现数据，直接跑出：

- 体验课 red
- 正价课 red
- 热门时段 red

推荐方式：

```bash
DB_PATH=data/teacher-warning-demo.db npm run demo:init
DB_PATH=data/teacher-warning-demo.db npm start
```

## 常见报错与处理方式

### 1. `EADDRINUSE: address already in use :::3000`

原因：

- 3000 端口已有旧服务在运行

处理：

- 停掉旧进程，再执行 `npm start`

### 2. `ERR_SQLITE_ERROR / SQL logic error`

常见原因：

- 旧代码仍在访问旧字段
- 数据库尚未初始化到当前结构
- 旧进程和新数据库结构不一致

处理：

```bash
npm run db:init
npm start
```

必要时先关闭旧 Node 进程。

### 3. `database is locked`

原因：

- 多个 Node 进程同时占用同一个 SQLite 文件

处理：

- 关闭旧进程
- 避免多个 `npm start` 同时指向同一 `DB_PATH`

### 4. 浏览器提示“输入有效值”

原因：

- 浏览器缓存了旧表单

处理：

- 强制刷新页面
- 重启服务后重新访问

### 5. 导入时报“教师ID 不存在”

原因：

- 先导入了教师时段可用性，但还没导入教师档案

处理：

- 先维护 `/teachers/manage`
- 再导入 `/manual/teacher-slot-availability`

## 当前完整功能列表

- 教师档案 CRUD
- 7 类业务数据手工录入
- 8 类模板下载与 CSV 导入
- 中文模板导出
- 中文 / 英文双兼容导入
- 旧结构自动迁移
- 体验课周测算
- 正价课周测算
- 热门时段并发预警
- demo 数据一键初始化
- 未来月份计划与情景假设录入
- 未来月份月度预测
- 未来月份热门时段预测

## 当前限制

- 还没有正式测试框架，主要依赖 `npm run check`、页面验证和 demo 数据验证
- 正价课销售转化起量仍是第一版估算，尚未拆独立明细表
- `course_type = both` 老师的跨课程统一分配还未做
- 未来月份预测当前先做月度结果，尚未拆到周维度预测表
