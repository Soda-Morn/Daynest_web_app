# Daynest + Supabase — setup guide

Daynest runs in two modes:

| Mode | When | Accounts | Data |
|---|---|---|---|
| **Local only** | no Supabase variables set | none | this browser only (as before) |
| **Cloud** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | email + password | your Supabase database, with an offline copy on each device |

---

## A. Use a hosted Supabase project (for real users)

### 1. Create a Supabase account and project
1. Go to <https://supabase.com> and sign up (GitHub sign-in is fine).
2. Click **New project**. Pick an organisation, a **name** (e.g. `daynest`), a strong **database password** (save it in your password manager) and the **region** closest to your users.
3. Wait about two minutes while the project is created.

### 2. Get the project URL and anon / publishable key
1. In the project, open **Project Settings → API** (newer dashboards: **Project Settings → API Keys** and **Data API**).
2. Copy the **Project URL** (`https://xxxx.supabase.co`).
3. Copy the **anon / publishable** key.
   *Never* copy the `service_role` / secret key into Daynest — it bypasses all security rules.

### 3. Configure environment variables
```bash
cp .env.example .env.local
```
Edit `.env.local`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
`.env.local` is git-ignored. On Vercel, add the same two variables under **Project → Settings → Environment Variables**.

### 4. Run the database migrations
Install nothing globally — use `npx`:
```bash
npx supabase login                       # opens the browser once
npx supabase link --project-ref xxxx     # "xxxx" from your project URL
npx supabase db push                     # applies supabase/migrations/*.sql
```
This creates all tables, indexes, triggers, Row Level Security policies, the private `avatars` storage bucket and the realtime publication. Re-run `db push` whenever a new migration file is added — never edit the production database by hand.

### 5. Configure authentication
In the dashboard, **Authentication**:
- **Sign In / Providers → Email**: enabled, *Confirm email* **on**.
- **URL Configuration → Site URL**: your app URL (e.g. `https://daynest.vercel.app`; `http://localhost:5181` for development).
- **Redirect URLs**: add `http://localhost:5181/**` and your production URL with `/**`.
- **Password**: minimum length 8, require letters and digits (matches the app’s checks).
- For real users, set up **custom SMTP** (Authentication → Emails → SMTP): the built-in sender is rate-limited and meant for testing.

### 6. Start Daynest locally
```bash
npm install
npm run dev        # http://localhost:5181
```

### 7. Test registration and login
1. Open <http://localhost:5181> — you’re sent to **Sign in**. Click **Create an account**.
2. Enter a name, email and password → “Check your email”.
3. Open the confirmation email and click the link → back in Daynest, signed in.
4. You’ll see your starter calendars and lists. Add a task, refresh — it’s still there.
5. Sign in on another browser or device with the same account — your tasks appear and changes show up live.
6. **Forgot password?** on the sign-in page sends a reset link → choose a new password.
7. **Account** (click your avatar): change name, picture and password, sign out.

---

## B. Develop and test against a local Supabase (Docker)

Requires Docker Desktop.
```bash
npx supabase start          # first run downloads the images (several GB)
npx supabase status         # shows API URL, anon key, Studio and Mailpit URLs
```
Put the **API URL** and **anon key** from `status` into `.env.local`, then `npm run dev`.

- Emails (confirmation, password reset) are caught by **Mailpit**: <http://127.0.0.1:54324>.
- Database UI (Studio): <http://127.0.0.1:54323>.
- Re-create the database from the migrations: `npm run db:reset`.
- Security tests (two real users; RLS, ownership, storage, performance): `npm run test:db`.
- Unit tests: `npm test`.

Stop with `npx supabase stop`.

---

## Database overview

```
auth.users ─1:1─ profiles
           ─1:1─ user_settings
           ─1:n─ categories  (“My calendars”)  ─┐
           ─1:n─ lists                          ├─ tasks (list_id, category_id)  ─1:n─ reminders
           ─1:n─ events      (reserved)        ─┘                                  ─1:n─ reminders
           ─1:n─ habits ─1:n─ habit_logs
```

- Every table has `user_id` (or is keyed by it) and **RLS on**, with owner-only SELECT / INSERT / UPDATE / DELETE policies using `auth.uid()`. Signed-out visitors have no table access.
- **Ownership across tables** uses composite foreign keys `(list_id, user_id) → lists(id, user_id)`, so a task can never point at another user’s list or calendar.
- **Owners can’t be changed**: a trigger rejects any update to `user_id`.
- `updated_at` is set by the database; `rev` only moves forward (optimistic concurrency).
- Calendars, lists and tasks use soft deletes (`deleted_at`) so offline devices learn about deletions.
- New users get a profile, settings and starter calendars/lists from a signup trigger.
- Profile pictures live in the private `avatars` bucket under `<user id>/…`; only the owner can read or write them (the app uses short-lived signed URLs).

Migrations: [`supabase/migrations`](../supabase/migrations).
