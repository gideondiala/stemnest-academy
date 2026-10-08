/**
 * A student's class "tracks" — one per pathway they take.
 *
 * A student can take several pathways at once, each with its own tutor,
 * schedule and class link. Each pathway is an enrolment; its 1-on-1 classes
 * carry bookings.enrolment_id. Older classes may not be linked to an
 * enrolment yet — those are grouped by tutor + class link until Post-Sales
 * links them to a pathway.
 *
 * Track keys:  'e:<enrolment uuid>'          a pathway enrolment
 *              't:<tutor uuid>|<class link>'  unlinked classes with that tutor and link
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function httpError(status, message, extra) { return Object.assign(new Error(message), { status }, extra || {}); }

/** SQL condition (on bookings alias `b`) selecting one track's classes. */
function trackFilter(key, startIdx) {
  const k = String(key || '');
  if (k.startsWith('e:') && UUID_RE.test(k.slice(2))) {
    return { sql: `b.enrolment_id = $${startIdx}`, params: [k.slice(2)] };
  }
  if (k.startsWith('t:')) {
    const rest = k.slice(2);
    const bar = rest.indexOf('|');
    const tutorId = bar === -1 ? rest : rest.slice(0, bar);
    const link = bar === -1 ? '' : rest.slice(bar + 1);
    if (tutorId && !UUID_RE.test(tutorId)) throw httpError(400, 'Invalid track');
    return {
      sql: `b.enrolment_id IS NULL AND b.batch_id IS NULL AND b.is_demo = FALSE
            AND ${tutorId ? `b.tutor_id = $${startIdx}` : `b.tutor_id IS NULL AND $${startIdx}::text = ''`}
            AND COALESCE(b.class_link, '') = $${startIdx + 1}`,
      params: [tutorId, link],
    };
  }
  throw httpError(400, 'Invalid track');
}

/** Every track of a student, with counts. */
async function studentTracks(db, studentId) {
  const r = await db.query(
    `WITH t AS (
       SELECT CASE WHEN b.enrolment_id IS NOT NULL THEN 'e:' || b.enrolment_id::text
                   ELSE 't:' || COALESCE(b.tutor_id::text, '') || '|' || COALESCE(b.class_link, '') END AS key,
              b.*
       FROM bookings b
       WHERE b.student_id = $1 AND b.is_demo = FALSE AND b.batch_id IS NULL
     )
     SELECT key,
            (array_agg(enrolment_id) FILTER (WHERE enrolment_id IS NOT NULL))[1] AS enrolment_id,
            (array_agg(tutor_id ORDER BY (status = 'scheduled' AND date >= CURRENT_DATE) DESC, date DESC))[1] AS tutor_id,
            (array_agg(class_link ORDER BY (status = 'scheduled' AND date >= CURRENT_DATE) DESC, date DESC))[1] AS class_link,
            COUNT(*) FILTER (WHERE status = 'scheduled' AND date >= CURRENT_DATE)::int AS upcoming,
            COUNT(*) FILTER (WHERE status IN ('completed', 'partially_completed'))::int AS completed,
            to_char(MIN(date) FILTER (WHERE status = 'scheduled' AND date >= CURRENT_DATE), 'YYYY-MM-DD') AS next_date,
            to_char(MAX(date) FILTER (WHERE status IN ('completed', 'partially_completed')), 'YYYY-MM-DD') AS last_done,
            (array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL))[1] AS lesson_pathway
     FROM t
     LEFT JOIN pathway_lessons pl ON pl.id = t.pathway_lesson_id
     LEFT JOIN pathway_grades pg ON pg.id = pl.grade_id
     LEFT JOIN pathways p ON p.id = pg.pathway_id
     GROUP BY key`,
    [studentId]
  );
  const enr = await db.query(
    `SELECT e.id, e.pathway_id, p.name AS pathway_name, e.current_grade, e.lessons_completed, e.status,
            e.tutor_id, e.class_link, e.schedule
     FROM enrolments e LEFT JOIN pathways p ON p.id = e.pathway_id
     WHERE e.student_id = $1 AND e.status IN ('active', 'paused')`,
    [studentId]
  );
  const byEnrol = new Map(enr.rows.map(e => [e.id, e]));
  const tracks = r.rows.map(t => {
    const e = t.enrolment_id ? byEnrol.get(t.enrolment_id) : null;
    if (e) byEnrol.delete(e.id);
    return {
      key: t.key,
      linked: !!t.enrolment_id,
      enrolmentId: t.enrolment_id || null,
      pathwayId: e ? e.pathway_id : null,
      pathwayName: e ? e.pathway_name : null,
      lessonPathway: t.lesson_pathway || null,      /* hint for unlinked classes */
      grade: e ? e.current_grade : null,
      lessonsCompleted: e ? e.lessons_completed : null,
      status: e ? e.status : null,
      tutorId: (e && e.tutor_id) || t.tutor_id || null,
      classLink: t.class_link || (e && e.class_link) || '',
      upcoming: t.upcoming, completed: t.completed, nextDate: t.next_date, lastDone: t.last_done,
    };
  });
  /* Pathways with no classes yet */
  for (const e of byEnrol.values()) {
    tracks.push({
      key: 'e:' + e.id, linked: true, enrolmentId: e.id, pathwayId: e.pathway_id, pathwayName: e.pathway_name,
      lessonPathway: null, grade: e.current_grade, lessonsCompleted: e.lessons_completed, status: e.status,
      tutorId: e.tutor_id, classLink: e.class_link || '', upcoming: 0, completed: 0, nextDate: null, lastDone: null,
    });
  }
  const tutorIds = [...new Set(tracks.map(t => t.tutorId).filter(Boolean))];
  if (tutorIds.length) {
    const names = await db.query('SELECT id, name FROM users WHERE id = ANY($1::uuid[])', [tutorIds]);
    const nm = new Map(names.rows.map(x => [x.id, x.name]));
    tracks.forEach(t => { t.tutorName = nm.get(t.tutorId) || null; });
  }
  tracks.sort((a, b) => (b.upcoming > 0) - (a.upcoming > 0) || String(a.nextDate || '9').localeCompare(String(b.nextDate || '9')));
  return tracks;
}

/**
 * Which track an action applies to. With no key: the student's only track
 * that has upcoming classes; several → an error listing them.
 */
async function resolveTrack(db, studentId, key, { fromDate } = {}) {
  if (key) { trackFilter(key, 1); return key; }
  const tracks = (await studentTracks(db, studentId)).filter(t => t.upcoming > 0);
  if (tracks.length <= 1) return tracks[0] ? tracks[0].key : null;
  throw httpError(400, 'This student takes more than one pathway — choose which pathway to change.', {
    needsTrack: true, tracks,
  });
}

module.exports = { trackFilter, studentTracks, resolveTrack, UUID_RE };
