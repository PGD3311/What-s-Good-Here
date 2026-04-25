# Google OAuth Setup Guide

The frontend code for Google OAuth is fully implemented. This guide covers the Supabase and Google Cloud configuration needed to make it work.

## Prerequisites

- Supabase project admin access
- Google Cloud Console access

## Step 1: Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select your existing one
3. Navigate to **APIs & Services > Credentials**
4. Click **+ CREATE CREDENTIALS > OAuth client ID**
5. If prompted, configure the **OAuth consent screen** first:
   - User Type: **External**
   - App name: **What's Good Here**
   - Support email: your email
   - Authorized domains: add `wghapp.com` and your Supabase project domain (e.g., `supabase.co`)
   - Scopes: `email`, `profile`, `openid` (defaults)
6. Back in Credentials, create OAuth client ID:
   - Application type: **Web application**
   - Name: **WGH Production**
   - Authorized JavaScript origins:
     - `https://wghapp.com`
     - `http://localhost:5173` (for local dev)
   - Authorized redirect URIs:
     - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
7. Copy the **Client ID** and **Client Secret**

## Step 2: Supabase Auth Provider

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication > Providers**
3. Find **Google** in the list and click to expand
4. Toggle **Enable Sign in with Google**
5. Paste the **Client ID** and **Client Secret** from Step 1
6. Save

## Step 3: Verify Redirect URLs

In **Authentication > URL Configuration**:
- **Site URL**: `https://wghapp.com`
- **Redirect URLs** (add all):
  - `https://wghapp.com/**`
  - `http://localhost:5173/**` (for local dev)

## Step 4: Run the `handle_new_user` Trigger

Run the migration in Supabase SQL Editor:

```sql
-- File: supabase/migrations/20260221_handle_new_user_trigger.sql
-- This creates a trigger that auto-creates a profiles row for new users
```

Copy the contents of that file and run it in **SQL Editor**.

## Step 5: Test

1. Open the app (local or preview deploy)
2. Click any voting action (to trigger LoginModal)
3. Click "Continue with Google"
4. Authenticate with Google
5. Verify:
   - You're redirected back to the app
   - WelcomeModal shows (skips name step if Google provided your name)
   - Your profile exists in the `profiles` table

## How It Works

1. User clicks "Continue with Google" in LoginModal
2. Supabase redirects to Google OAuth consent via `supabase.auth.signInWithOAuth()`
3. Google redirects back to `{supabase_url}/auth/v1/callback`
4. Supabase redirects to the app with tokens in the URL hash
5. `detectSessionInUrl: true` in the Supabase client picks up the tokens
6. `handle_new_user` trigger creates a profiles row with display_name from Google
7. `AuthContext` detects `SIGNED_IN` event
8. `WelcomeModal` shows for onboarding (category preferences)

## CSP Notes

The current Content-Security-Policy in `vercel.json` is compatible with Google OAuth. The OAuth flow uses full-page redirects (not AJAX), and all Supabase API calls are covered by `https://*.supabase.co` in `connect-src`.

## Cost

$0 - Google OAuth is free for consumer apps.
