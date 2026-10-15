# HouseList

Shared shopping lists for households. A household has members and shopping lists;
a user can belong to more than one household. New members join via a code shared
by an admin. A household can have several admins; if the last admin leaves, admin
rights automatically pass to the longest-tenured remaining member.

## Features

- Register / log in (passwords hashed with bcrypt)
- Create a household (you become its admin) or join one with a join code
- Belong to multiple households and switch between them
- Admins: view members, view/regenerate the join code, remove a member, promote a
  member to admin, delete the household
- Any member: leave a household, create/delete lists, add/tick-off/delete items
- A list is automatically shown as "finished" once every item on it is bought
- Responsive layout (desktop and mobile)

## Tech stack

- Backend: Node.js + Express, a small REST API
- Database: SQLite via Node's built-in `node:sqlite` module (no separate database
  server, no native-compiled dependency to install)
- Frontend: plain HTML, CSS and JavaScript, using `fetch()` to talk to the backend
  without reloading the page
- Sessions: `express-session` (cookie-based)

## Prerequisites

- Node.js **22.5 or newer** (for the built-in `node:sqlite` module). Check with
  `node --version`.

## Install & run

```bash
npm install
npm start
```

Then open http://localhost:3000 in a browser. The SQLite database file is created
automatically on first run at `data/houselist.db` (ignored by git).

The app runs over plain HTTP. That's a deliberate choice: it's meant to run
locally, not be deployed publicly. If it were ever deployed publicly, HTTPS would
be required (passwords/session cookies would otherwise travel in cleartext).

## Running tests

```bash
npm test
```

Runs the automated test suite (Node's built-in test runner) against the real HTTP
API, using a temporary, isolated SQLite file that's cleaned up afterwards. Covers:
registration/login, household creation and joining via code, membership and
join-code management, promoting a member to admin, the admin-succession rule when
the last admin leaves, a household being deleted once its last member leaves, and
that a household's data isn't accessible to users outside it.

In addition to the automated suite, the app was manually tested across desktop
and mobile (Chrome and Firefox), covering the responsive layout, multi-tab/
multi-user session behavior, form validation and error display, a slow/unreliable
network connection, and recovering cleanly after a server restart.

## Project structure

```
server/
  index.js            Express app setup, session config, route mounting
  db.js               SQLite schema + connection
  middleware/
    auth.js           requireAuth session guard
    household.js       requireHouseholdMember/Admin guards + admin-succession logic
  routes/
    auth.js            register / login / logout
    households.js      create/join/delete households, members, join code, promote
    lists.js            lists and items CRUD
  utils/
    joinCode.js         random join-code generation
public/
  index.html, app.html  the two pages (auth, main app)
  css/style.css
  js/                   frontend logic (api.js, login.js, app.js)
tests/
  api.test.js           integration tests against the real HTTP API
```

## Deliberately out of scope

Live updates between simultaneously open browser tabs, email verification, and
password reset are not implemented. They are reasonable extensions but are not
needed to demonstrate the core concept, and leaving them out keeps the
implementation small and well-tested. Demoting a co-admin back to a regular member
is also not implemented (promoting a member is; demoting wasn't needed since
promote alone already allows several admins, and the admin-succession logic is
already exercised via leave/removal) — someone who wants to give up their own
admin status can leave and rejoin via the join code instead. Multi-language
support (i18n/localization) is also out of scope; the UI is English-only.

Account deletion (a user removing their own account entirely) is not implemented
either. It would be a reasonable future improvement, but it is more involved than
it first looks: it would need to walk every household the user belongs to and run
the same admin-succession logic already used for leave/removal (promote the next
member or delete the household if none remain), and the `lists.created_by` foreign
key would need an explicit `ON DELETE` rule so deleting a user who created a list
doesn't fail outright.

## Use of AI tools

AI coding assistance (GitHub Copilot) was used during implementation. The concept,
data model, household/membership rules, and all key design decisions were planned
and specified by me, drawing on my professional background as a software architect
and developer. All code was reviewed and tested by me before being committed.
