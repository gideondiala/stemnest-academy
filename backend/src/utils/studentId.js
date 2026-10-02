/**
 * Next free S-#### student ID. Call inside a transaction: the advisory lock
 * is held until that transaction ends, so two onboardings never collide.
 */
async function nextStudentId(client) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('users.staff_id'))`);
  const r = await client.query(
    `SELECT COALESCE(MAX(substring(staff_id FROM '^S-([0-9]+)$')::int), 0) AS n
     FROM users WHERE staff_id ~ '^S-[0-9]+$'`
  );
  return 'S-' + String(r.rows[0].n + 1).padStart(4, '0');
}

module.exports = { nextStudentId };
