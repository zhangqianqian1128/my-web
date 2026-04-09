function listTeachers(db) {
  return db
    .prepare(
      `SELECT teacher_id, teacher_name, course_type, employment_type, weekly_hours, enabled
       FROM teachers
       ORDER BY teacher_id DESC`
    )
    .all();
}

function getTeacherById(db, teacherId) {
  return db
    .prepare(
      `SELECT teacher_id, teacher_name, course_type, employment_type, weekly_hours, enabled
       FROM teachers
       WHERE teacher_id = ?`
    )
    .get(Number(teacherId));
}

function createTeacher(db, payload) {
  return db
    .prepare(
      `INSERT INTO teachers (
         teacher_name,
         course_type,
         employment_type,
         weekly_hours,
         enabled,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run(
      payload.teacher_name,
      payload.course_type,
      payload.employment_type,
      payload.weekly_hours,
      payload.enabled
    );
}

function updateTeacher(db, teacherId, payload) {
  return db
    .prepare(
      `UPDATE teachers
       SET teacher_name = ?,
           course_type = ?,
           employment_type = ?,
           weekly_hours = ?,
           enabled = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE teacher_id = ?`
    )
    .run(
      payload.teacher_name,
      payload.course_type,
      payload.employment_type,
      payload.weekly_hours,
      payload.enabled,
      Number(teacherId)
    );
}

function deleteTeacher(db, teacherId) {
  return db.prepare("DELETE FROM teachers WHERE teacher_id = ?").run(Number(teacherId));
}

module.exports = {
  listTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
};
