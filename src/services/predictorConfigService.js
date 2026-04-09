const CONFIG_KEYS = {
  simulatorTrial: "simulator_trial",
  simulatorPaid: "simulator_paid",
  headteacherSimulator: "headteacher_simulator",
};

function getSavedPredictorConfig(db, configKey) {
  const row = db
    .prepare("SELECT payload_json FROM predictor_saved_configs WHERE config_key = ?")
    .get(configKey);

  if (!row?.payload_json) {
    return null;
  }

  try {
    return JSON.parse(row.payload_json);
  } catch (error) {
    return null;
  }
}

function savePredictorConfig(db, configKey, payload) {
  db.prepare(
    `
      INSERT INTO predictor_saved_configs (
        config_key,
        payload_json,
        updated_at
      ) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (config_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(configKey, JSON.stringify(payload));
}

module.exports = {
  CONFIG_KEYS,
  getSavedPredictorConfig,
  savePredictorConfig,
};
