# Deploy Skill

Deploy Jargon frontend (Netlify) and backend (Cloudflare Worker).

## Steps

1. Verify working directory is the Jargon project root (has `wrangler.toml` and `package.json`)
2. Run `npm run lint` — abort if errors
3. Run `npx vitest run` — abort if failures
4. Run `npm run build` — abort if build fails
5. Run `npx wrangler deploy` — deploy Cloudflare Worker
6. Run `git push origin main` — triggers Netlify redeploy
7. Confirm both URLs respond:
   - Frontend: https://playjargon.com
   - API: https://api.playjargon.com
