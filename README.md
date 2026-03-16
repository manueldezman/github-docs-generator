# GitHub Docs Generator

An open source, AI-powered documentation generator for any public GitHub repository. Paste a repo URL, select a doc type, and get a complete markdown document in seconds.

**Live demo:** [your-vercel-url.vercel.app](https://your-vercel-url.vercel.app)

---

## Features

- Generates 6 documentation types: README, API Reference, Full Docs, Contributing guide, Quickstart, and Changelog
- Fetches real repo metadata, file structure, and existing README from the GitHub public API
- Powered by Google Gemini 2.0 Flash via a secure backend proxy
- No API key required for end users
- Clean, responsive dark UI

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Backend | Vercel Serverless Function (Node.js) |
| AI | Google Gemini 2.0 Flash |
| Hosting | Vercel (free tier) |

---

## Project structure

```
github-docs-generator/
├── public/
│   ├── index.html      # HTML structure
│   ├── styles.css      # All styling
│   └── app.js          # All frontend logic
├── api/
│   └── generate.js     # Serverless proxy (keeps API key secure)
├── vercel.json         # Vercel configuration
├── DEPLOY.md           # Deployment guide
└── README.md           # This file
```

---

## Local development

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [Vercel CLI](https://vercel.com/docs/cli): `npm install -g vercel`
- A free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### Setup

1. Clone the repo:

```bash
git clone https://github.com/YOUR_USERNAME/github-docs-generator.git
cd github-docs-generator
```

2. Create a `.env` file in the root:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

3. Start the local dev server:

```bash
vercel dev
```

4. Open `http://localhost:3000` in your browser.

---

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the full step-by-step guide to deploying on Vercel.

---

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Commit: `git commit -m "feat: describe your change"`
5. Push: `git push origin feature/your-feature-name`
6. Open a Pull Request

### Good first issues

- Add a new documentation type (e.g. Docker setup guide, Security policy)
- Add a light mode toggle
- Improve mobile responsiveness
- Add syntax highlighting to the markdown output

### Commit message format

Use conventional commits:

```
feat: add new doc type
fix: handle private repo error gracefully
style: update button hover state
docs: update README
```

---

## License

MIT — free to use, modify, and distribute.

---

Built by [0xdezman](https://0xdezman.hashnode.dev)
