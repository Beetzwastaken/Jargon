# Jargon

Buzzword bingo you play during real work meetings. Open the app, get a card of corporate buzzwords, and tap them as you hear them.

## How It Works

**Solo** — Play during any meeting. Random card, tap buzzwords as they come up, track your score across games.

**Duo** — Pair with a colleague in the same meeting. You both get the same daily card (Wordle-style, one per day). Each secretly picks a line. Score points by marking squares (+1) and completing bingo lines (+3). Complete your opponent's secret line for a Bonus Bingo — instant win! No Bonus Bingo by midnight? Highest score wins.

## Play

https://playjargon.com

Works best on your phone during meetings. No app install needed — it's a PWA.

## Development

```bash
npm install
npm run dev          # Frontend at localhost:5175
npm run build        # Production build
npm test             # Run tests
npx wrangler dev     # Local backend
npx wrangler deploy  # Deploy Cloudflare Worker
```

## Stack

React 19 + TypeScript + Vite + Tailwind for the frontend. Zustand for state. Cloudflare Workers + Durable Objects for the duo backend. WebSocket real-time sync with HTTP polling fallback. Hosted on Netlify (frontend) and Cloudflare (backend).

## License

MIT
