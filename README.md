# Resume Strategist

An AI-powered resume tailoring app built with Next.js and Claude.

---

## What you need before starting

- A computer with internet access
- [Node.js](https://nodejs.org) installed (download the "LTS" version)
- An Anthropic API key (get one free at [console.anthropic.com](https://console.anthropic.com))
- A free [Vercel account](https://vercel.com) for hosting
- A free [GitHub account](https://github.com) (optional but recommended)

---

## Step 1 — Set up the project locally

Open Terminal (Mac) or Command Prompt (Windows), navigate to where you want the project, then run:

```bash
# Install dependencies
npm install

# Start the local development server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser. You should see the password screen.

---

## Step 2 — Add your API key and password

Open the file `.env.local` in a text editor and fill in your values:

```
ANTHROPIC_API_KEY=sk-ant-...     ← paste your key from console.anthropic.com
APP_PASSWORD=yourpassword123     ← choose any password to share with friends
```

Save the file, then restart the dev server (`Ctrl+C` then `npm run dev` again).

---

## Step 3 — Test it locally

1. Go to [http://localhost:3000](http://localhost:3000)
2. Enter the password you set in `.env.local`
3. Upload a resume and try a conversation

Everything working? You're ready to deploy.

---

## Step 4 — Deploy to Vercel (your live public URL)

### Option A — Via GitHub (recommended, enables auto-deploy on changes)

1. Create a new repository on [github.com](https://github.com/new)
2. Push this project to it:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/resume-app.git
   git push -u origin main
   ```
3. Go to [vercel.com](https://vercel.com), click **Add New Project**, and import your GitHub repo
4. In the **Environment Variables** section, add:
   - `ANTHROPIC_API_KEY` = your key
   - `APP_PASSWORD` = your password
5. Click **Deploy**

Your app will be live at `https://resume-app.vercel.app` (or similar) in about 60 seconds.

From now on, every time you push a change to GitHub, Vercel automatically redeploys. ✨

---

### Option B — Direct Vercel deploy (no GitHub needed)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow the prompts, then add your env vars:
vercel env add ANTHROPIC_API_KEY
vercel env add APP_PASSWORD

# Redeploy with the env vars
vercel --prod
```

---

## Step 5 — Set a spending limit (important!)

Go to [console.anthropic.com/settings/limits](https://console.anthropic.com/settings/limits) and set a monthly spending limit (e.g. $10). This prevents any surprise charges if usage spikes.

At typical usage (a few friends doing occasional resume sessions), expect **$1–3/month**.

---

## Making changes

### Using Claude (chat interface)
1. Ask Claude to make a change
2. Copy the updated code
3. Paste it into `src/components/ResumeAgent.jsx`
4. Test with `npm run dev`
5. Push to GitHub → Vercel auto-deploys

### Using Claude Code (recommended for faster iteration)
```bash
# Inside the project folder
claude "add a dark mode toggle"
claude "fix the export button on mobile"
```
Claude Code reads and edits your files directly — no copy-pasting needed.

---

## Project structure

```
resume-app/
├── src/
│   ├── app/
│   │   ├── page.jsx              ← password gate + app entry point
│   │   ├── layout.jsx            ← HTML wrapper
│   │   └── api/
│   │       ├── auth/route.js     ← password check (server-side)
│   │       └── claude/route.js   ← Anthropic API proxy (hides your key)
│   └── components/
│       └── ResumeAgent.jsx       ← the main app (edit this for changes)
├── .env.local                    ← your secrets (never commit this)
├── .env.example                  ← safe template to share/commit
├── .gitignore                    ← keeps .env.local out of git
├── next.config.js
└── package.json
```

---

## Sharing with friends & family

Just send them:
1. Your Vercel URL (e.g. `https://resume-app.vercel.app`)
2. The password you set in `APP_PASSWORD`

That's it. No accounts, no installs on their end.
