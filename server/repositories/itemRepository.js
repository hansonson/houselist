// Data access for list items. All SQL for the items table lives here; no business rules.
const db = require('../db');

function toItem(row) {
  return row
    ? {
        id: row.id,
        listId: row.list_id,
        name: row.name,
        amount: row.amount,
        comment: row.comment,
        bought: !!row.bought,
      }
    : null;
}

function findAllByList(listId) {
  return db.prepare('SELECT * FROM items WHERE list_id = ?').all(listId).map(toItem);
}

// Scoped by household (via the item's list), so an item id from another household is never found.
function findInHousehold(itemId, householdId) {
  return toItem(
    db
      .prepare(
        `SELECT items.* FROM items
         JOIN lists ON lists.id = items.list_id
         WHERE items.id = ? AND lists.household_id = ?`
      )
      .get(itemId, householdId)
  );
}

function create(listId, name, amount, comment) {
  const result = db
    .prepare('INSERT INTO items (list_id, name, amount, comment, bought) VALUES (?, ?, ?, ?, 0)')
    .run(listId, name, amount, comment);
  return Number(result.lastInsertRowid);
}

function update(itemId, { name, amount, comment, bought }) {
  db.prepare('UPDATE items SET name = ?, amount = ?, comment = ?, bought = ? WHERE id = ?').run(
    name,
    amount,
    comment,
    bought ? 1 : 0,
    itemId
  );
}

function remove(itemId) {
  db.prepare('DELETE FROM items WHERE id = ?').run(itemId);
}

module.exports = { findAllByList, findInHousehold, create, update, remove };
