# IronCan: Manual Test User Setup Guide

## Prerequisites

1. Run `supabase-migration-v2.sql` on your Supabase database first
2. Have access to Supabase SQL Editor

## Quick Setup (3 Steps)

### Step 1: Create Auth Users in Supabase Dashboard

Go to **Supabase Dashboard → Auth → Users → Add User**

Create these test users:

| Email | Password | Role (notes) |
|-------|----------|-------------|
| client@example.com | test123456 | Regular client |
| trainer@example.com | test123456 | Trainer (approved) |
| trainer-pending@example.com | test123456 | Trainer (pending approval) |

**Important:** Email confirmation is NOT required for testing (default Supabase behavior).

### Step 2: Get User UUIDs

Run this query in Supabase SQL Editor:

```sql
SELECT id, email FROM auth.users WHERE email LIKE '%@example.com';
```

You'll get output like:

```
id                                    | email
--------------------------------------|-------------------------
550e8400-e29b-41d4-a716-446655440000 | client@example.com
550e8400-e29b-41d4-a716-446655440001 | trainer@example.com
550e8400-e29b-41d4-a716-446655440002 | trainer-pending@example.com
```

### Step 3: Create Profiles

Replace the UUIDs in `scripts-create-test-users.sql`:

```
'test-client-id'::uuid              → '550e8400-e29b-41d4-a716-446655440000'::uuid
'test-trainer-id'::uuid             → '550e8400-e29b-41d4-a716-446655440001'::uuid
'test-trainer-pending-id'::uuid     → '550e8400-e29b-41d4-a716-446655440002'::uuid
```

Then run the entire `scripts-create-test-users.sql` in Supabase SQL Editor.

## Verify Setup

After running the script, check:

```sql
-- View profiles
SELECT email, display_name, role, status, is_trainer, trainer_status
FROM user_profiles
WHERE email LIKE '%@example.com'
ORDER BY created_at DESC;

-- View trainer-client relationships
SELECT
  t.display_name as trainer,
  u.display_name as client,
  tu.status,
  tu.joined_at
FROM trainer_users tu
JOIN user_profiles t ON tu.trainer_id = t.id
JOIN auth.users u ON tu.user_id = u.id;
```

## Test Login Flow

Now you can test:

1. **Regular Client:** Login with `client@example.com` → Should see MainTabs (Workout, Stats, Diet, etc.)
2. **Approved Trainer:** Login with `trainer@example.com` → Should see TrainerTabs (Dashboard, My Users, Diet Plans)
3. **Pending Trainer:** Login with `trainer-pending@example.com` → Should see pending approval screen

## Cleanup (Optional)

Delete test users when done:

```sql
-- Delete profiles (cascade deletes related data)
DELETE FROM user_profiles WHERE email LIKE '%@example.com';

-- Delete auth users (use Supabase Dashboard)
-- Auth → Users → Select user → Delete
```

## Troubleshooting

**Error: `duplicate key value violates unique constraint`**
- The profile already exists. Either delete it first or the script will update existing rows.

**Error: `role IN ('trainer', 'user')`**
- You haven't run `supabase-migration-v2.sql` yet. Run it first!

**Trainer still routes to client page**
- Verify the profile has `role = 'trainer'` and `is_trainer = true`:
  ```sql
  SELECT role, is_trainer, trainer_status FROM user_profiles WHERE email = 'trainer@example.com';
  ```

**Client profile not found after auth**
- The trigger `on_auth_user_created` should auto-create a basic profile when the auth user is created.
- If missing, manually insert via `scripts-create-test-users.sql`
