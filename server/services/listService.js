// Business logic for shopping lists and their items, including when a list counts as finished.
// No HTTP, no SQL; every lookup is scoped to the household the caller is a member of.
const listRepository = require('../repositories/listRepository');
const itemRepository = require('../repositories/itemRepository');
const { ValidationError, NotFoundError } = require('../errors');

// An empty list is not finished: it needs at least one item, and every item bought.
function isFinished(items) {
  return items.length > 0 && items.every((item) => item.bought);
}

function getListOrThrow(householdId, listId) {
  const list = listRepository.findInHousehold(listId, householdId);
  if (!list) {
    throw new NotFoundError('List not found');
  }
  return list;
}

function getItemOrThrow(householdId, itemId) {
  const item = itemRepository.findInHousehold(itemId, householdId);
  if (!item) {
    throw new NotFoundError('Item not found');
  }
  return item;
}

function getLists(householdId) {
  return listRepository.findAllByHousehold(householdId).map((list) => {
    const items = itemRepository.findAllByList(list.id);
    return { id: list.id, title: list.title, finished: isFinished(items), itemCount: items.length };
  });
}

function createList(householdId, userId, title) {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) {
    throw new ValidationError('List title is required');
  }
  const id = listRepository.create(householdId, cleanTitle, userId);
  return { id, title: cleanTitle, finished: false, itemCount: 0 };
}

function getList(householdId, listId) {
  const list = getListOrThrow(householdId, listId);
  const items = itemRepository.findAllByList(list.id);
  return {
    id: list.id,
    title: list.title,
    finished: isFinished(items),
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      comment: item.comment,
      bought: item.bought,
    })),
  };
}

function deleteList(householdId, listId) {
  const list = getListOrThrow(householdId, listId);
  listRepository.remove(list.id);
}

function addItem(householdId, listId, { name, amount, comment }) {
  const list = getListOrThrow(householdId, listId);
  const cleanName = (name || '').trim();
  if (!cleanName) {
    throw new ValidationError('Item name is required');
  }
  const cleanAmount = (amount || '').trim();
  const cleanComment = (comment || '').trim();
  const id = itemRepository.create(list.id, cleanName, cleanAmount, cleanComment);
  return { id, name: cleanName, amount: cleanAmount, comment: cleanComment, bought: false };
}

// Partial update: fields left undefined keep their current value.
function updateItem(householdId, itemId, changes) {
  const item = getItemOrThrow(householdId, itemId);
  const next = {
    name: changes.name !== undefined ? String(changes.name).trim() : item.name,
    amount: changes.amount !== undefined ? String(changes.amount).trim() : item.amount,
    comment: changes.comment !== undefined ? String(changes.comment).trim() : item.comment,
    bought: changes.bought !== undefined ? !!changes.bought : item.bought,
  };
  itemRepository.update(item.id, next);
  return { ...next, id: item.id };
}

function deleteItem(householdId, itemId) {
  const item = getItemOrThrow(householdId, itemId);
  itemRepository.remove(item.id);
}

module.exports = { getLists, createList, getList, deleteList, addItem, updateItem, deleteItem };
