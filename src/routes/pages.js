const express = require("express");
const { getDb } = require("../db/connection");
const { buildDashboard } = require("../services/dashboardService");
const { buildForecastViewModel } = require("../services/forecastService");
const { buildFutureForecastViewModel } = require("../services/futureForecastService");
const {
  buildSimulatorViewModel,
  hydrateSimulatorForm,
  normalizeSimulatorInput,
  validateSimulatorForm,
  calculateSimulatorResults,
} = require("../services/simulatorService");
const {
  buildHeadteacherSimulatorViewModel,
  hydrateHeadteacherSimulatorForm,
  normalizeHeadteacherSimulatorInput,
  validateHeadteacherSimulatorForm,
  calculateHeadteacherSimulatorResults,
} = require("../services/headteacherSimulatorService");
const {
  CONFIG_KEYS,
  getSavedPredictorConfig,
  savePredictorConfig,
} = require("../services/predictorConfigService");
const { manualModules, teacherImportModule, getImportModules } = require("../config/manualModules");

const router = express.Router();

router.get("/", (req, res) => {
  const db = getDb();
  const viewModel = buildDashboard(db);
  res.render("index", viewModel);
});

router.get("/teachers", (req, res) => {
  res.redirect("/teachers/manage");
});

router.get("/manual", (req, res) => {
  res.redirect(`/${manualModules[0].pageRoute.replace(/^\//, "")}`);
});

router.get("/imports", (req, res) => {
  const pages = getImportModules().map((moduleConfig) => ({
    title: moduleConfig.title,
    templateKey: moduleConfig.templateKey,
    pageRoute: moduleConfig.pageRoute,
    templateRoute: `/csv/templates/${moduleConfig.templateKey}`,
    description: moduleConfig.description,
  }));

  res.render("imports", {
    pageTitle: "CSV 导入",
    activeNav: "imports",
    pages,
    teacherImportModule,
  });
});

router.get("/forecast", (req, res) => {
  const db = getDb();
  res.render("forecast", buildForecastViewModel(db));
});

router.get("/forecast/future", (req, res) => {
  const db = getDb();
  res.render(
    "future-forecast",
    buildFutureForecastViewModel(db, String(req.query.scenario || "baseline"))
  );
});

router.get("/forecast/simulator", (req, res) => {
  res.redirect("/forecast/simulator/trial");
});

router.get("/forecast/simulator/trial", (req, res) => {
  const db = getDb();
  const simulatorForm = hydrateSimulatorForm(getSavedPredictorConfig(db, CONFIG_KEYS.simulatorTrial));
  const errorMessage = validateSimulatorForm(simulatorForm);
  const result = errorMessage ? null : calculateSimulatorResults(simulatorForm);

  res.render(
    "simulator",
    buildSimulatorViewModel({
      courseMode: "trial",
      simulatorForm,
      result,
      errorMessage,
      showSettingsExpanded: !result,
    })
  );
});

router.get("/forecast/simulator/paid", (req, res) => {
  const db = getDb();
  const simulatorForm = hydrateSimulatorForm(getSavedPredictorConfig(db, CONFIG_KEYS.simulatorPaid));
  const errorMessage = validateSimulatorForm(simulatorForm);
  const result = errorMessage ? null : calculateSimulatorResults(simulatorForm);

  res.render(
    "simulator",
    buildSimulatorViewModel({
      courseMode: "paid",
      simulatorForm,
      result,
      errorMessage,
      showSettingsExpanded: !result,
    })
  );
});

router.post("/forecast/simulator/trial", (req, res) => {
  const db = getDb();
  const simulatorForm = normalizeSimulatorInput(req.body);
  const errorMessage = validateSimulatorForm(simulatorForm);

  if (errorMessage) {
    res
      .status(400)
      .render(
        "simulator",
        buildSimulatorViewModel({ courseMode: "trial", simulatorForm, errorMessage })
      );
    return;
  }

  savePredictorConfig(db, CONFIG_KEYS.simulatorTrial, simulatorForm);

  res.render(
    "simulator",
    buildSimulatorViewModel({
      courseMode: "trial",
      simulatorForm,
      result: calculateSimulatorResults(simulatorForm),
    })
  );
});

router.post("/forecast/simulator/paid", (req, res) => {
  const db = getDb();
  const simulatorForm = normalizeSimulatorInput(req.body);
  const errorMessage = validateSimulatorForm(simulatorForm);

  if (errorMessage) {
    res
      .status(400)
      .render(
        "simulator",
        buildSimulatorViewModel({ courseMode: "paid", simulatorForm, errorMessage })
      );
    return;
  }

  savePredictorConfig(db, CONFIG_KEYS.simulatorPaid, simulatorForm);

  res.render(
    "simulator",
    buildSimulatorViewModel({
      courseMode: "paid",
      simulatorForm,
      result: calculateSimulatorResults(simulatorForm),
    })
  );
});

router.get("/forecast/headteacher-simulator", (req, res) => {
  const db = getDb();
  const simulatorForm = hydrateHeadteacherSimulatorForm(
    getSavedPredictorConfig(db, CONFIG_KEYS.headteacherSimulator)
  );
  const errorMessage = validateHeadteacherSimulatorForm(simulatorForm);
  const result = errorMessage ? null : calculateHeadteacherSimulatorResults(simulatorForm);

  res.render(
    "headteacher-simulator",
    buildHeadteacherSimulatorViewModel({
      simulatorForm,
      result,
      errorMessage,
      showSettingsExpanded: !result,
    })
  );
});

router.post("/forecast/headteacher-simulator", (req, res) => {
  const db = getDb();
  const simulatorForm = normalizeHeadteacherSimulatorInput(req.body);
  const errorMessage = validateHeadteacherSimulatorForm(simulatorForm);

  if (errorMessage) {
    res
      .status(400)
      .render(
        "headteacher-simulator",
        buildHeadteacherSimulatorViewModel({ simulatorForm, errorMessage })
      );
    return;
  }

  savePredictorConfig(db, CONFIG_KEYS.headteacherSimulator, simulatorForm);

  res.render(
    "headteacher-simulator",
    buildHeadteacherSimulatorViewModel({
      simulatorForm,
      result: calculateHeadteacherSimulatorResults(simulatorForm),
    })
  );
});

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "teacher-warning-app",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
