// HTTP layer for lists and items: maps requests to listService, nothing more.
const express = require('express');
const listService = require('../services/listService');
const { requireHouseholdMember } = require('../middleware/household');

// mergeParams: both routers are mounted under /api/households/:householdId (see index.js).
const listsRouter = express.Router({ mergeParams: true });
const itemsRouter = express.Router({ mergeParams: true });

listsRouter.use(requireHouseholdMember);
itemsRouter.use(requireHouseholdMember);

listsRouter.get('/', (req, res) => {
  res.json({ lists: listService.getLists(req.householdId) });
});

listsRouter.post('/', (req, res) => {
  const list = listService.createList(req.householdId, req.session.user.id, req.body.title);
  res.status(201).json({ list });
});

listsRouter.get('/:listId', (req, res) => {
  res.json({ list: listService.getList(req.householdId, Number(req.params.listId)) });
});

listsRouter.delete('/:listId', (req, res) => {
  listService.deleteList(req.householdId, Number(req.params.listId));
  res.json({ ok: true });
});

listsRouter.post('/:listId/items', (req, res) => {
  const { name, amount, comment } = req.body;
  const item = listService.addItem(req.householdId, Number(req.params.listId), {
    name,
    amount,
    comment,
  });
  res.status(201).json({ item });
});

itemsRouter.patch('/:itemId', (req, res) => {
  const { name, amount, comment, bought } = req.body;
  const item = listService.updateItem(req.householdId, Number(req.params.itemId), {
    name,
    amount,
    comment,
    bought,
  });
  res.json({ item });
});

itemsRouter.delete('/:itemId', (req, res) => {
  listService.deleteItem(req.householdId, Number(req.params.itemId));
  res.json({ ok: true });
});

module.exports = { listsRouter, itemsRouter };
