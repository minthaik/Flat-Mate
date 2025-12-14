commit 90c7e245ea95d4fbcab57574d83f5a4105425fc8
Author: minthaik <minthaik.ep@gmail.com>
Date:   Sat Dec 13 22:28:03 2025 -0600

    Add API contract documentation

diff --git a/docs/api-contract.md b/docs/api-contract.md
new file mode 100644
index 0000000..683bc83
--- /dev/null
+++ b/docs/api-contract.md
@@ -0,0 +1,51 @@
+# API Contract
+
+A thin, stable API layer keeps the Flutter client and web app consistent even if the backend moves off WordPress later. Endpoints and IDs stay the same; only implementations change.
+
+## Authentication
+- **Tokens:** Short-lived access token + refresh token (JWT).
+- **Subject:** The JWT `sub` claim is the durable `app_user_id` that maps to the backend user record.
+- **WordPress today:** Use a JWT plugin or custom endpoint that issues tokens; avoid Basic Auth or app passwords for real clients.
+
+### Auth endpoints
+- `POST /auth/login` ΓÇö exchange credentials for `access_token` + `refresh_token`.
+- `POST /auth/refresh` ΓÇö exchange a valid refresh token for a new access token pair.
+- `GET /me` ΓÇö returns the current user profile for the access token.
+
+## Users
+- Store a **global user ID** `app_user_id` (UUID) that survives migrations.
+- Map WordPress user ΓåÆ `app_user_id`; never key the system solely by email.
+
+## Houses
+- `POST /houses` ΓÇö create a house.
+- `GET /houses/:id` ΓÇö fetch a house by ID.
+
+## Chores
+- `GET /houses/:id/chores` ΓÇö list chores for a house.
+- `POST /chores` ΓÇö create a chore (body includes `house_id`).
+- `PATCH /chores/:id` ΓÇö update status or details for a chore.
+
+## Expenses
+- `GET /houses/:id/expenses` ΓÇö list expenses for a house.
+- `POST /expenses` ΓÇö create an expense (body includes `house_id`).
+- `PATCH /expenses/:id` ΓÇö update an expense (status, amount, splits, etc.).
+
+## Notes
+- `GET /houses/:id/notes` ΓÇö list notes for a house.
+- `POST /notes` ΓÇö create a note (body includes `house_id`).
+- `PATCH /notes/:id` ΓÇö update a note.
+
+## Response shape (example)
+Use a consistent, typed envelope:
+```json
+{
+  "data": { "id": "...", "type": "chore", "attributes": { ... } },
+  "meta": { "request_id": "..." },
+  "errors": []
+}
+```
+
+## Migration principles
+- Keep the public contract identical when replacing WordPress with a new backend.
+- New services must issue JWTs with the same `sub` mapping (`app_user_id`).
+- Backward-compatible evolution: add fields or endpoints; avoid breaking changes to paths, IDs, or token semantics.
