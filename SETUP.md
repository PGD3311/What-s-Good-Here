# Setup Instructions

Follow these steps to get "What's Good Here" running locally and deployed.

## Step 1: Create Supabase Project (5 minutes)

1. Go to https://supabase.com and sign up/log in
2. Click "New Project"
3. Choose:
   - Name: `whats-good-here` (or your preferred name)
   - Database Password: Generate a strong password (save this!)
   - Region: Choose closest to your location
4. Click "Create new project" and wait 2-3 minutes for provisioning

## Step 2: Set Up Database (3 minutes)

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click "New Query"
3. Open `~/whats-good-here/supabase/schema.sql` on your computer
4. Copy ALL the contents and paste into the SQL Editor
5. Click "Run" (or press Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned" - this is correct!

7. Click "New Query" again
8. Open `~/whats-good-here/supabase/seed.sql`
9. Copy ALL the contents and paste into the SQL Editor
10. Click "Run"
11. You should see confirmation that ~30 restaurants and ~120 dishes were inserted

## Step 3: Configure Authentication (2 minutes)

1. In Supabase dashboard, go to **Authentication > Providers**
2. Find "Email" and toggle it ON
3. (Optional but recommended) Enable Google OAuth:
   - Find "Google" provider
   - Toggle it ON
   - Add your Google OAuth credentials (or skip for now and test with email only)
4. Scroll down to **Redirect URLs**
   - Add: `http://localhost:5173`
   - Click "Save"

## Step 4: Get API Keys (1 minute)

1. In Supabase dashboard, go to **Settings > API** (bottom of left sidebar)
2. You'll see two important values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: A long string starting with `eyJ...`
3. Keep this page open - you'll need these values next

## Step 5: Configure Environment Variables (1 minute)

1. Open `~/whats-good-here/.env.local` in your text editor
2. Replace the placeholder values with your actual Supabase credentials:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Save the file

## Step 6: Run the App Locally (1 minute)

1. Open Terminal
2. Navigate to the project:
   ```bash
   cd ~/whats-good-here
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser to http://localhost:5173

You should see:
- A header "What's Good Here"
- Location picker showing your current location (or Mission District, SF if denied)
- Category filter chips
- A feed of dishes with photos, ratings, and vote buttons

## Step 7: Test the App (5 minutes)

### Test Authentication
1. Click on any "Worth It" or "Avoid" button
2. You should see the login modal
3. Enter your email and click "Send magic link"
4. Check your email for the login link
5. Click the link - you should be redirected back to the app, now logged in

### Test Voting
1. Once logged in, click "Worth It" on a dish
2. The button should turn green and the vote count should update
3. Refresh the page - your vote should persist

### Test Filtering
1. Click on a category chip (e.g., "Burgers")
2. The feed should show only burger dishes
3. Click "All" to see all dishes again

### Test Radius
1. Change the radius dropdown from 5 miles to 1 mile
2. The feed should update to show fewer dishes (only those within 1 mile)

## Step 8: Deploy to Vercel (10 minutes)

### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to https://vercel.com and sign up/log in
2. Click "Add New Project"
3. Import your git repository (or upload the folder)
4. Configure the project:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Add Environment Variables:
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key
6. Click "Deploy"

### Option B: Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
cd ~/whats-good-here
vercel
```

Follow the prompts and add environment variables when asked.

### After Deployment

1. Copy your production URL (e.g., `https://wghapp.com`)
2. Go back to Supabase dashboard > **Authentication > URL Configuration**
3. Add your Vercel URL to **Site URL** and **Redirect URLs**
4. Test authentication on your live site

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure `.env.local` has the correct values
- Restart the dev server: Stop with Ctrl+C and run `npm run dev` again

### "Function get_ranked_dishes does not exist"
- Make sure you ran the `schema.sql` file in Supabase SQL Editor
- Check for any error messages when running the SQL

### No dishes showing up
- Check browser console for errors (F12 > Console tab)
- Verify seed data was inserted: Go to Supabase > Table Editor > dishes table
- Make sure geolocation is enabled in your browser

### Login not working
- Check that Email provider is enabled in Supabase Authentication settings
- Check redirect URLs are configured correctly
- Look for errors in browser console

### Votes not persisting
- Make sure Row Level Security policies were created (they're in `schema.sql`)
- Check browser console for authentication errors
- Try logging out and back in

## Next Steps

Once everything is working:

1. Test on mobile devices (iOS Safari and Android Chrome)
2. Share with friends and ask them to rate 5-10 dishes
3. Monitor usage in Supabase dashboard
4. Check for errors in Vercel logs

## Need Help?

- Check the main README.md for more details
- Review the implementation plan in `.claude/plans/`
- Supabase docs: https://supabase.com/docs
- Vercel docs: https://vercel.com/docs

**Remember: Ship over perfect!**
