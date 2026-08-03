# GitHub README Generator

An open source, AI-powered documentation generator for any public GitHub repository. Paste a repo URL, select a doc type, and get a complete markdown document in seconds.

**Live demo:** [github-docs-generator](https://github-docs-generator.vercel.app/)

---

## Features

- Generates comprehensive README and concise Quickstart documentation
- Recursively inspects repository structure and selects high-value source files
- Summarizes large files in bounded chunks before generating evidence-based docs
- Generates GitHub-compatible architecture and data-flow diagrams when supported
- Includes a rendered Markdown and Mermaid preview before copying
- Powered by GLM 5.2 through NVIDIA's secure API
- No API key required for end users
- Clean, responsive dark UI

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Backend | Vercel Serverless Function (Node.js) |
| AI | GLM 5.2 via NVIDIA API |
| Hosting | Vercel (free tier) |

---

## Project structure

```
github-docs-generator/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── api/
│   ├── lib/
│   ├── inspect.js
│   ├── analyze.js
│   └── generate.js
├── test/
├── .env              ← gitignored
├── .gitignore
├── vercel.json
├── DEPLOY.md
└── README.md

```
---

## Local development

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [Vercel CLI](https://vercel.com/docs/cli): `npm install -g vercel`
- An NVIDIA API key with access to `z-ai/glm-5.2`

### Setup

1. Clone the repo:

```bash
git clone https://github.com/manueldezman/github-docs-generator.git
cd github-docs-generator
```

2. Create a `.env` file in the root:

```bash
NVIDIA_API_KEY=your_nvidia_api_key_here
GITHUB_TOKEN=your_github_token_here
```

The GitHub token only needs read access to public repositories. It is used server-side
to improve API rate limits and is never sent to the browser.

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

- Add a light mode toggle
- Improve mobile responsiveness

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
