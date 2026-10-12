// Integration tests: exercise the real HTTP API end-to-end against a temporary SQLite file.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const TEST_DB = path.join(__dirname, `test-api-${process.pid}.db`);
process.env.HOUSELIST_DB = TEST_DB;
process.env.PORT = '0'; // let the OS pick a free port

const app = require('../server/index');
const db = require('../server/db');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(TEST_DB, { force: true });
});

// Minimal cookie-jar client so each "user" keeps their own session across requests.
function makeClient() {
  let cookie = '';
  async function request(method, urlPath, body) {
    const res = await fetch(baseUrl + urlPath, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
  return { request };
}

test('register, create household, add list and item, finished flips when bought', async () => {
  const alice = makeClient();

  let res = await alice.request('POST', '/api/auth/register', {
    name: 'Alice',
    email: 'alice@example.com',
    password: 'password123',
  });
  assert.equal(res.status, 201);

  res = await alice.request('POST', '/api/households', { name: 'Alice House' });
  assert.equal(res.status, 201);
  assert.equal(res.data.household.isAdmin, true);
  assert.equal(typeof res.data.household.joinCode, 'string');
  const householdId = res.data.household.id;

  res = await alice.request('GET', '/api/households');
  assert.equal(res.status, 200);
  assert.equal(res.data.households.length, 1);
  assert.equal(res.data.households[0].isAdmin, true);

  res = await alice.request('POST', `/api/households/${householdId}/lists`, { title: 'Groceries' });
  assert.equal(res.status, 201);
  const listId = res.data.list.id;
  assert.equal(res.data.list.finished, false);

  res = await alice.request('POST', `/api/households/${householdId}/lists/${listId}/items`, {
    name: 'Milk',
    amount: '2',
    comment: 'low-fat',
  });
  assert.equal(res.status, 201);
  const itemId = res.data.item.id;

  res = await alice.request('GET', `/api/households/${householdId}/lists/${listId}`);
  assert.equal(res.data.list.finished, false, 'list with an unbought item must not be finished');

  res = await alice.request('PATCH', `/api/households/${householdId}/items/${itemId}`, { bought: true });
  assert.equal(res.status, 200);

  res = await alice.request('GET', `/api/households/${householdId}/lists/${listId}`);
  assert.equal(res.data.list.finished, true, 'list becomes finished once all items are bought');
});

test('empty list is not finished (vacuous-truth edge case)', async () => {
  const bob = makeClient();
  await bob.request('POST', '/api/auth/register', { name: 'Bob', email: 'bob@example.com', password: 'password123' });
  let res = await bob.request('POST', '/api/households', { name: 'Bob House' });
  const householdId = res.data.household.id;

  res = await bob.request('POST', `/api/households/${householdId}/lists`, { title: 'Empty list' });
  assert.equal(res.data.list.finished, false, 'a brand-new empty list must not show as finished');
});

test('join via code, membership roster, and non-admin restrictions', async () => {
  const carol = makeClient();
  const dave = makeClient();

  await carol.request('POST', '/api/auth/register', { name: 'Carol', email: 'carol@example.com', password: 'password123' });
  let res = await carol.request('POST', '/api/households', { name: 'Carol House' });
  const householdId = res.data.household.id;
  const joinCode = res.data.household.joinCode;

  await dave.request('POST', '/api/auth/register', { name: 'Dave', email: 'dave@example.com', password: 'password123' });
  res = await dave.request('POST', '/api/households/join', { code: joinCode });
  assert.equal(res.status, 201);
  assert.equal(res.data.household.isAdmin, false);

  res = await dave.request('POST', '/api/households/join', { code: joinCode });
  assert.equal(res.status, 409, 'joining the same household twice must be rejected');

  res = await dave.request('POST', '/api/households/join', { code: 'NOTAREALCODE' });
  assert.equal(res.status, 404);

  res = await carol.request('GET', `/api/households/${householdId}/members`);
  assert.equal(res.data.members.length, 2);

  // Non-admin (Dave) cannot manage the household itself...
  res = await dave.request('GET', `/api/households/${householdId}/join-code`);
  assert.equal(res.status, 403);
  res = await dave.request('DELETE', `/api/households/${householdId}`);
  assert.equal(res.status, 403);

  // ...but can manage content: create a list and add items.
  res = await dave.request('POST', `/api/households/${householdId}/lists`, { title: "Dave's list" });
  assert.equal(res.status, 201, 'any member, not just admins, can create lists');
});

test('promote lets a regular member become admin', async () => {
  const erin = makeClient();
  const frank = makeClient();

  await erin.request('POST', '/api/auth/register', { name: 'Erin', email: 'erin@example.com', password: 'password123' });
  let res = await erin.request('POST', '/api/households', { name: 'Erin House' });
  const householdId = res.data.household.id;
  const joinCode = res.data.household.joinCode;

  await frank.request('POST', '/api/auth/register', { name: 'Frank', email: 'frank@example.com', password: 'password123' });
  await frank.request('POST', '/api/households/join', { code: joinCode });

  res = await erin.request('GET', `/api/households/${householdId}/members`);
  const frankMember = res.data.members.find((m) => m.name === 'Frank');
  assert.ok(frankMember, 'Frank should be listed as a member');
  assert.equal(frankMember.isAdmin, false);

  res = await erin.request('POST', `/api/households/${householdId}/members/${frankMember.id}/promote`);
  assert.equal(res.status, 200);

  res = await erin.request('GET', `/api/households/${householdId}/members`);
  const frankAfter = res.data.members.find((m) => m.name === 'Frank');
  assert.equal(frankAfter.isAdmin, true, 'Frank should now be an admin');
});

test('succession: last admin leaving promotes the longest-tenured remaining member', async () => {
  const gina = makeClient();
  const hank = makeClient();

  let res = await gina.request('POST', '/api/auth/register', { name: 'Gina', email: 'gina@example.com', password: 'password123' });
  res = await gina.request('POST', '/api/households', { name: 'Gina House' });
  const householdId = res.data.household.id;
  const joinCode = res.data.household.joinCode;

  const hankRegister = await hank.request('POST', '/api/auth/register', { name: 'Hank', email: 'hank@example.com', password: 'password123' });
  const hankUserId = hankRegister.data.user.id;
  await hank.request('POST', '/api/households/join', { code: joinCode });

  res = await gina.request('GET', `/api/households/${householdId}/members`);
  const ginaMember = res.data.members.find((m) => m.name === 'Gina');

  // Gina (the only admin) leaves.
  res = await gina.request('DELETE', `/api/households/${householdId}/members/${ginaMember.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.promotedUserId, hankUserId, 'Hank (the only remaining member) should be auto-promoted');

  res = await hank.request('GET', `/api/households/${householdId}/members`);
  assert.equal(res.status, 200);
  assert.equal(res.data.members.length, 1);
  assert.equal(res.data.members[0].isAdmin, true, 'Hank should now be admin after succession');
});

test('household is deleted once its last member leaves', async () => {
  const ivan = makeClient();
  await ivan.request('POST', '/api/auth/register', { name: 'Ivan', email: 'ivan@example.com', password: 'password123' });
  let res = await ivan.request('POST', '/api/households', { name: 'Ivan House' });
  const householdId = res.data.household.id;

  res = await ivan.request('GET', `/api/households/${householdId}/members`);
  const ivanMember = res.data.members[0];

  res = await ivan.request('DELETE', `/api/households/${householdId}/members/${ivanMember.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.deleted, true);

  res = await ivan.request('GET', `/api/households/${householdId}`);
  assert.equal(res.status, 403, 'the household no longer exists, so membership check correctly fails');
});

test('a member of one household cannot access another household\'s data', async () => {
  const jack = makeClient();
  const kate = makeClient();

  await jack.request('POST', '/api/auth/register', { name: 'Jack', email: 'jack@example.com', password: 'password123' });
  let res = await jack.request('POST', '/api/households', { name: 'Jack House' });
  const jackHouseholdId = res.data.household.id;

  await kate.request('POST', '/api/auth/register', { name: 'Kate', email: 'kate@example.com', password: 'password123' });
  await kate.request('POST', '/api/households', { name: 'Kate House' });

  res = await kate.request('GET', `/api/households/${jackHouseholdId}`);
  assert.equal(res.status, 403, 'Kate must not be able to view a household she is not a member of');

  res = await kate.request('GET', `/api/households/${jackHouseholdId}/lists`);
  assert.equal(res.status, 403);
});

test('wrong password and unknown email are both rejected the same way', async () => {
  const liam = makeClient();
  await liam.request('POST', '/api/auth/register', { name: 'Liam', email: 'liam@example.com', password: 'password123' });

  let res = await liam.request('POST', '/api/auth/login', { email: 'liam@example.com', password: 'wrong-password' });
  assert.equal(res.status, 401);

  res = await liam.request('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'whatever123' });
  assert.equal(res.status, 401);
});

test('registration validates email format and rejects duplicate emails', async () => {
  const mia = makeClient();

  let res = await mia.request('POST', '/api/auth/register', { name: 'Mia', email: 'not-an-email', password: 'password123' });
  assert.equal(res.status, 400);

  res = await mia.request('POST', '/api/auth/register', { name: 'Mia', email: 'mia@example.com', password: 'password123' });
  assert.equal(res.status, 201);

  const mia2 = makeClient();
  res = await mia2.request('POST', '/api/auth/register', { name: 'Mia Again', email: 'mia@example.com', password: 'password123' });
  assert.equal(res.status, 409, 'registering the same email twice must be rejected');
});

test('unauthenticated requests to protected routes are rejected', async () => {
  const anon = makeClient();
  let res = await anon.request('GET', '/api/households');
  assert.equal(res.status, 401);

  res = await anon.request('POST', '/api/households', { name: 'Should not work' });
  assert.equal(res.status, 401);
});

test('malformed JSON body returns a clean 400 JSON error, not an HTML error page', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json',
  });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('content-type').includes('application/json'), true);
  const data = await res.json();
  assert.equal(typeof data.error, 'string');
});

test('/api/auth/me reflects session state, including after logout', async () => {
  const noah = makeClient();

  let res = await noah.request('GET', '/api/auth/me');
  assert.equal(res.status, 401, 'not logged in yet');

  await noah.request('POST', '/api/auth/register', { name: 'Noah', email: 'noah@example.com', password: 'password123' });
  res = await noah.request('GET', '/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.data.user.email, 'noah@example.com');

  res = await noah.request('POST', '/api/auth/logout');
  assert.equal(res.status, 200);

  res = await noah.request('GET', '/api/auth/me');
  assert.equal(res.status, 401, 'session must be gone after logout');
});

test('email matching is case-insensitive, and name/email are trimmed on register', async () => {
  const olivia = makeClient();

  let res = await olivia.request('POST', '/api/auth/register', {
    name: '  Olivia  ',
    email: '  Olivia@Example.com  ',
    password: 'password123',
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.user.name, 'Olivia', 'name should be trimmed');
  assert.equal(res.data.user.email, 'olivia@example.com', 'email should be trimmed and lowercased');

  const oliviaAgain = makeClient();
  res = await oliviaAgain.request('POST', '/api/auth/login', { email: 'OLIVIA@EXAMPLE.COM', password: 'password123' });
  assert.equal(res.status, 200, 'login must match the email case-insensitively');
});

test('password length boundary: exactly 8 characters is accepted, 7 is rejected', async () => {
  const priya = makeClient();

  let res = await priya.request('POST', '/api/auth/register', { name: 'Priya', email: 'priya@example.com', password: '1234567' });
  assert.equal(res.status, 400, '7 characters must still be rejected');

  res = await priya.request('POST', '/api/auth/register', { name: 'Priya', email: 'priya@example.com', password: '12345678' });
  assert.equal(res.status, 201, 'exactly 8 characters must be accepted');
});

test('household creation rejects an empty/whitespace-only name', async () => {
  const rosa = makeClient();
  await rosa.request('POST', '/api/auth/register', { name: 'Rosa', email: 'rosa@example.com', password: 'password123' });

  let res = await rosa.request('POST', '/api/households', { name: '' });
  assert.equal(res.status, 400);

  res = await rosa.request('POST', '/api/households', { name: '   ' });
  assert.equal(res.status, 400, 'whitespace-only name must be rejected the same as empty');
});

test('list and item creation reject empty/whitespace-only titles and names', async () => {
  const sam = makeClient();
  await sam.request('POST', '/api/auth/register', { name: 'Sam', email: 'sam@example.com', password: 'password123' });
  let res = await sam.request('POST', '/api/households', { name: 'Sam House' });
  const householdId = res.data.household.id;

  res = await sam.request('POST', `/api/households/${householdId}/lists`, { title: '   ' });
  assert.equal(res.status, 400);

  res = await sam.request('POST', `/api/households/${householdId}/lists`, { title: 'Real list' });
  const listId = res.data.list.id;

  res = await sam.request('POST', `/api/households/${householdId}/lists/${listId}/items`, { name: '' });
  assert.equal(res.status, 400);
});

test('404 for operations on list/item/member ids that do not exist', async () => {
  const tara = makeClient();
  const uma = makeClient();
  await tara.request('POST', '/api/auth/register', { name: 'Tara', email: 'tara@example.com', password: 'password123' });
  const umaRegister = await uma.request('POST', '/api/auth/register', { name: 'Uma', email: 'uma@example.com', password: 'password123' });
  const umaUserId = umaRegister.data.user.id;

  let res = await tara.request('POST', '/api/households', { name: 'Tara House' });
  const householdId = res.data.household.id;

  res = await tara.request('GET', `/api/households/${householdId}/lists/999999`);
  assert.equal(res.status, 404);

  res = await tara.request('DELETE', `/api/households/${householdId}/lists/999999`);
  assert.equal(res.status, 404);

  res = await tara.request('PATCH', `/api/households/${householdId}/items/999999`, { bought: true });
  assert.equal(res.status, 404);

  res = await tara.request('DELETE', `/api/households/${householdId}/items/999999`);
  assert.equal(res.status, 404);

  // Uma is a real user but never joined Tara's household, so she's not a valid removal/promotion target there.
  res = await tara.request('DELETE', `/api/households/${householdId}/members/${umaUserId}`);
  assert.equal(res.status, 404);

  res = await tara.request('POST', `/api/households/${householdId}/members/${umaUserId}/promote`);
  assert.equal(res.status, 404);
});

test('a list/item id from a different household is not reachable even by a member of the household used in the URL', async () => {
  const vik = makeClient();
  const wendy = makeClient();
  await vik.request('POST', '/api/auth/register', { name: 'Vik', email: 'vik@example.com', password: 'password123' });
  await wendy.request('POST', '/api/auth/register', { name: 'Wendy', email: 'wendy@example.com', password: 'password123' });

  let res = await vik.request('POST', '/api/households', { name: 'Vik House' });
  const vikHouseholdId = res.data.household.id;
  res = await vik.request('POST', `/api/households/${vikHouseholdId}/lists`, { title: "Vik's list" });
  const vikListId = res.data.list.id;
  res = await vik.request('POST', `/api/households/${vikHouseholdId}/lists/${vikListId}/items`, { name: 'Bread' });
  const vikItemId = res.data.item.id;

  res = await wendy.request('POST', '/api/households', { name: 'Wendy House' });
  const wendyHouseholdId = res.data.household.id;

  // Wendy is a legitimate member of her own household, but Vik's list/item ids don't belong to it.
  res = await wendy.request('GET', `/api/households/${wendyHouseholdId}/lists/${vikListId}`);
  assert.equal(res.status, 404);

  res = await wendy.request('PATCH', `/api/households/${wendyHouseholdId}/items/${vikItemId}`, { bought: true });
  assert.equal(res.status, 404);
});

test('join codes are accepted case-insensitively', async () => {
  const xena = makeClient();
  const yara = makeClient();
  await xena.request('POST', '/api/auth/register', { name: 'Xena', email: 'xena@example.com', password: 'password123' });
  let res = await xena.request('POST', '/api/households', { name: 'Xena House' });
  const joinCode = res.data.household.joinCode;

  await yara.request('POST', '/api/auth/register', { name: 'Yara', email: 'yara@example.com', password: 'password123' });
  res = await yara.request('POST', '/api/households/join', { code: joinCode.toLowerCase() });
  assert.equal(res.status, 201, 'a lowercase join code must still work');
});

test('regenerating the join code invalidates the old one and activates the new one', async () => {
  const zara = makeClient();
  const aaron = makeClient();
  await zara.request('POST', '/api/auth/register', { name: 'Zara', email: 'zara@example.com', password: 'password123' });
  let res = await zara.request('POST', '/api/households', { name: 'Zara House' });
  const householdId = res.data.household.id;
  const oldCode = res.data.household.joinCode;

  res = await zara.request('POST', `/api/households/${householdId}/join-code/regenerate`);
  assert.equal(res.status, 200);
  const newCode = res.data.joinCode;
  assert.notEqual(newCode, oldCode);

  await aaron.request('POST', '/api/auth/register', { name: 'Aaron', email: 'aaron@example.com', password: 'password123' });
  res = await aaron.request('POST', '/api/households/join', { code: oldCode });
  assert.equal(res.status, 404, 'the old join code must no longer work');

  res = await aaron.request('POST', '/api/households/join', { code: newCode });
  assert.equal(res.status, 201, 'the new join code must work');
});

test('removing one of two admins does not trigger succession (an admin still remains)', async () => {
  const beth = makeClient();
  const carl = makeClient();
  await beth.request('POST', '/api/auth/register', { name: 'Beth', email: 'beth@example.com', password: 'password123' });
  let res = await beth.request('POST', '/api/households', { name: 'Beth House' });
  const householdId = res.data.household.id;
  const joinCode = res.data.household.joinCode;

  await carl.request('POST', '/api/auth/register', { name: 'Carl', email: 'carl@example.com', password: 'password123' });
  await carl.request('POST', '/api/households/join', { code: joinCode });

  res = await beth.request('GET', `/api/households/${householdId}/members`);
  const bethMember = res.data.members.find((m) => m.name === 'Beth');
  const carlMember = res.data.members.find((m) => m.name === 'Carl');
  await beth.request('POST', `/api/households/${householdId}/members/${carlMember.id}/promote`);

  res = await beth.request('DELETE', `/api/households/${householdId}/members/${bethMember.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.promotedUserId, undefined, 'no succession needed since Carl is still an admin');
  assert.equal(res.data.deleted, undefined);

  res = await carl.request('GET', `/api/households/${householdId}/members`);
  assert.equal(res.data.members.length, 1);
  assert.equal(res.data.members[0].isAdmin, true, 'Carl should remain admin, untouched by Beth leaving');
});

test('deleting a list cascades so its items become unreachable', async () => {
  const dana = makeClient();
  await dana.request('POST', '/api/auth/register', { name: 'Dana', email: 'dana@example.com', password: 'password123' });
  let res = await dana.request('POST', '/api/households', { name: 'Dana House' });
  const householdId = res.data.household.id;

  res = await dana.request('POST', `/api/households/${householdId}/lists`, { title: 'Soon gone' });
  const listId = res.data.list.id;
  res = await dana.request('POST', `/api/households/${householdId}/lists/${listId}/items`, { name: 'Eggs' });
  const itemId = res.data.item.id;

  res = await dana.request('DELETE', `/api/households/${householdId}/lists/${listId}`);
  assert.equal(res.status, 200);

  res = await dana.request('PATCH', `/api/households/${householdId}/items/${itemId}`, { bought: true });
  assert.equal(res.status, 404, 'item must be gone once its parent list is deleted');
});

test('a non-numeric household id in the URL is rejected with 400, not a server error', async () => {
  const elle = makeClient();
  await elle.request('POST', '/api/auth/register', { name: 'Elle', email: 'elle@example.com', password: 'password123' });

  let res = await elle.request('GET', '/api/households/not-a-number');
  assert.equal(res.status, 400);

  res = await elle.request('GET', '/api/households/not-a-number/lists');
  assert.equal(res.status, 400);
});

test('a non-numeric list/item id in the URL returns 404, not a server error', async () => {
  const fay = makeClient();
  await fay.request('POST', '/api/auth/register', { name: 'Fay', email: 'fay@example.com', password: 'password123' });
  let res = await fay.request('POST', '/api/households', { name: 'Fay House' });
  const householdId = res.data.household.id;

  res = await fay.request('GET', `/api/households/${householdId}/lists/not-a-number`);
  assert.equal(res.status, 404);

  res = await fay.request('PATCH', `/api/households/${householdId}/items/not-a-number`, { bought: true });
  assert.equal(res.status, 404);
});
