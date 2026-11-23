# Put the Ninja Competition Manager online (about 15 minutes, $0)

When you're done you'll have:
- **An editor site** the coach signs in to from any iPad, phone or computer.
- **A public link + QR code** anyone can open with no login. It updates live.

You need two free accounts: **Supabase** (the database) and **Vercel** (the website host).

---

## Step 1: Create the database (Supabase)
1. Go to **supabase.com** ▸ **Start your project** ▸ sign up (signing in with GitHub is easiest).
2. Click **New project**. Pick any name (e.g. `ninja-comp`), make up a database password (save it somewhere), and pick the region closest to you. Click **Create** and wait about 2 minutes.
3. In the left menu open **SQL Editor** ▸ **New query**.
4. Open [`app/supabase/schema.sql`](app/supabase/schema.sql) in this repository and copy all of it (on GitHub, use the **Copy raw file** button).
5. Paste it into the SQL editor. On the **last line**, replace `YOUR-EMAIL@example.com` with the coach's email (the first person allowed to edit). Click **Run**. It should say "Success".
6. Go to **Project Settings ▸ API** (or the **Connect** button at the top) and keep this page open. You need:
   - **Project URL**, which looks like `https://abcdxyz.supabase.co`
   - **anon public** key (newer projects call it the **publishable** key)

## Step 2: Put the website online (Vercel)
1. Go to **vercel.com** ▸ **Sign Up** ▸ **Continue with GitHub**.
2. Click **Add New… ▸ Project**. Import **Repository-2**. If it isn't listed, click **Adjust GitHub App Permissions** and allow it.
3. On the setup screen:
   - **Root Directory:** click **Edit** and choose **`app`**.
   - **Environment Variables:** add two:
     - `VITE_SUPABASE_URL` = the Project URL from Step 1
     - `VITE_SUPABASE_ANON_KEY` = the anon (publishable) key from Step 1
4. Click **Deploy**. After about a minute you get a web address like `https://repository-2-abc.vercel.app`. That's your site.

## Step 3: Connect the two
1. In Supabase go to **Authentication ▸ URL Configuration**.
2. Set **Site URL** to your Vercel address and click **Save**. Confirmation emails then link back to your site.

## Step 4: First sign-in and import
1. Open your Vercel address. Tap **First time? Create password**, enter the coach's email (the one from the SQL) and choose a password.
2. Confirm the email Supabase sends, then sign in.
3. Go to **Import** and paste the Google Sheets link. Check the preview, give it a name and date, and tap **Create competition**.
4. Go to **Share** to copy the public link or print the QR poster.

**Add more editors:** **Settings ▸ People who can edit** ▸ add their email. They then use **First time? Create password** on the sign-in screen.

**On iPad:** open the site in Safari ▸ Share ▸ **Add to Home Screen** to get an app icon.

---

### Good to know
- **Saving:** every change saves instantly and shows on every device within a second or two. The public page also refreshes on its own every 15 seconds.
- **Undo:** each change can be undone from the toast, the athlete's history, or the **Changes** tab.
- **Hiding the schedule:** turn off **Settings ▸ Public schedule is visible** while you're still arranging things.
- **What's private:** the public page never shows notes or scratched athletes, and shows ages only if you turn that on.
- **Without Steps 1–3:** the site still works, but saves on that one device only.
- **Updates:** when new code is pushed to GitHub, Vercel redeploys automatically.
