const express = require('express');
const db = require('../db');
const { requireHouseholdMember } = require('../middleware/household');

const listsRouter = express.Router({ mergeParams: true });
const itemsRouter = express.Router({ mergeParams: true });

listsRouter.use(requireHouseholdMember);
itemsRouter.use(requireHouseholdMember);

function getListInHousehold(listId, householdId) {
  return db
    .prepare('SELECT * FROM lists WHERE id = ? AND household_id = ?')
    .get(listId, householdId);
}

function getItemInHousehold(itemId, householdId) {
  return db
    .prepare(
      `SELECT items.* FROM items
       JOIN lists ON lists.id = items.list_id
       WHERE items.id = ? AND lists.household_id = ?`
    )
    .get(itemId, householdId);
}

function listWithFinished(list) {
  const items = db.prepare('SELECT * FROM items WHERE list_id = ?').all(list.id);
  const finished = items.length > 0 && items.every((i) => i.bought);
  return {
    id: list.id,
    title: list.title,
    finished,
    itemCount: items.length,
  };
}

listsRouter.get('/', (req, res) => {
  const lists = db.prepare('SELECT * FROM lists WHERE household_id = ?').all(req.householdId);
  res.json({ lists: lists.map(listWithFinished) });
});

listsRouter.post('/', (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'List title is required' });
  }
  const result = db
    .prepare('INSERT INTO lists (household_id, title, created_by) VALUES (?, ?, ?)')
    .run(req.householdId, title, req.session.user.id);
  res.status(201).json({ list: { id: Number(result.lastInsertRowid), title, finished: false, itemCount: 0 } });
});

listsRouter.get('/:listId', (req, res) => {
  const list = getListInHousehold(Number(req.params.listId), req.householdId);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }
  const items = db.prepare('SELECT * FROM items WHERE list_id = ?').all(list.id);
  res.json({
    list: {
      id: list.id,
      title: list.title,
      finished: items.length > 0 && items.every((i) => i.bought),
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        amount: i.amount,
        comment: i.comment,
        bought: !!i.bought,
      })),
    },
  });
});

listsRouter.delete('/:listId', (req, res) => {
  const list = getListInHousehold(Number(req.params.listId), req.householdId);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }
  db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
  res.json({ ok: true });
});

listsRouter.post('/:listId/items', (req, res) => {
  const list = getListInHousehold(Number(req.params.listId), req.householdId);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Item name is required' });
  }
  const amount = (req.body.amount || '').trim();
  const comment = (req.body.comment || '').trim();
  const result = db
    .prepare('INSERT INTO items (list_id, name, amount, comment, bought) VALUES (?, ?, ?, ?, 0)')
    .run(list.id, name, amount, comment);
  res.status(201).json({
    item: { id: Number(result.lastInsertRowid), name, amount, comment, bought: false },
  });
});

itemsRouter.patch('/:itemId', (req, res) => {
  const item = getItemInHousehold(Number(req.params.itemId), req.householdId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  const next = {
    name: req.body.name !== undefined ? String(req.body.name).trim() : item.name,
    amount: req.body.amount !== undefined ? String(req.body.amount).trim() : item.amount,
    comment: req.body.comment !== undefined ? String(req.body.comment).trim() : item.comment,
    bought: req.body.bought !== undefined ? (req.body.bought ? 1 : 0) : item.bought,
  };
  db.prepare('UPDATE items SET name = ?, amount = ?, comment = ?, bought = ? WHERE id = ?').run(
    next.name,
    next.amount,
    next.comment,
    next.bought,
    item.id
  );
  res.json({ item: { ...next, id: item.id, bought: !!next.bought } });
});

itemsRouter.delete('/:itemId', (req, res) => {
  const item = getItemInHousehold(Number(req.params.itemId), req.householdId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
  res.json({ ok: true });
});

module.exports = { listsRouter, itemsRouter };
