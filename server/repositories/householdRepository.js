// Data access for households. All SQL for the households table lives here; no business rules.
const db = require('../db');

function toHousehold(row) {
  return row ? { id: row.id, name: row.name, joinCode: row.join_code } : null;
}

function findById(id) {
  return toHousehold(db.prepare('SELECT * FROM households WHERE id = ?').get(id));
}

function findByJoinCode(joinCode) {
  return toHousehold(db.prepare('SELECT * FROM households WHERE join_code = ?').get(joinCode));
}

// Households the user belongs to, with the user's role in each, oldest membership first.
function findAllForUser(userId) {
  return db
    .prepare(
      `SELECT h.id, h.name, hm.is_admin
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.user_id = ?
       ORDER BY hm.joined_at ASC`
    )
    .all(userId)
    .map((row) => ({ id: row.id, name: row.name, isAdmin: !!row.is_admin }));
}

function create(name, joinCode) {
  const result = db.prepare('INSERT INTO households (name, join_code) VALUES (?, ?)').run(name, joinCode);
  return Number(result.lastInsertRowid);
}

function updateJoinCode(id, joinCode) {
  db.prepare('UPDATE households SET join_code = ? WHERE id = ?').run(joinCode, id);
}

// ON DELETE CASCADE (see db.js) also removes its memberships, lists and items.
function remove(id) {
  db.prepare('DELETE FROM households WHERE id = ?').run(id);
}

module.exports = { findById, findByJoinCode, findAllForUser, create, updateJoinCode, remove };
