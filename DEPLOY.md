# Deployment Guide

## Step 1 — Push to GitHub

1. Go to [github.com](https://github.com) and create a **new repository**
   - Name it: `github-docs-generator`
   - Set visibility to **Public** (required for open source)
   - Do NOT initialise with a README

2. Open your terminal inside the project folder and run:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/github-docs-generator.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Step 2 — Import to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Find and import your `github-docs-generator` repository
4. Leave all build settings as default
5. **Do not click Deploy yet** — complete Step 3 first

---

## Step 3 — Add your NVIDIA API key

Before deploying:

1. Scroll down to **"Environment Variables"**
2. Add the following variable:
   - **Name:** `NVIDIA_API_KEY`
   - **Value:** your NVIDIA API key with access to `z-ai/glm-5.2`
3. Click **"Add"**
4. Now click **"Deploy"**

---

## Step 4 — You're live

Vercel will give you a public URL like:

```
https://github-docs-generator-xyz.vercel.app
```

Share it with anyone — no API key required on their end.

---

## Updating the app

Any time you push changes to GitHub, Vercel redeploys automatically:

```bash
git add .
git commit -m "your update message"
git push
```

---

## Local development

Install the Vercel CLI and run locally with your `.env` file:

```bash
npm install -g vercel
vercel dev
```

Make sure your `.env` file in the project root contains:

```
NVIDIA_API_KEY=your_key_here
```
