// Data access for shopping lists. All SQL for the lists table lives here; no business rules.
const db = require('../db');

function toList(row) {
  return row
    ? { id: row.id, householdId: row.household_id, title: row.title, createdBy: row.created_by }
    : null;
}

function findAllByHousehold(householdId) {
  return db.prepare('SELECT * FROM lists WHERE household_id = ?').all(householdId).map(toList);
}

// Scoped by household, so a list id from another household is never found.
function findInHousehold(listId, householdId) {
  return toList(
    db.prepare('SELECT * FROM lists WHERE id = ? AND household_id = ?').get(listId, householdId)
  );
}

function create(householdId, title, createdBy) {
  const result = db
    .prepare('INSERT INTO lists (household_id, title, created_by) VALUES (?, ?, ?)')
    .run(householdId, title, createdBy);
  return Number(result.lastInsertRowid);
}

// ON DELETE CASCADE (see db.js) also removes the list's items.
function remove(listId) {
  db.prepare('DELETE FROM lists WHERE id = ?').run(listId);
}

module.exports = { findAllByHousehold, findInHousehold, create, remove };
