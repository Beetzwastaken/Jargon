# Jargon Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, duplicate files, and stale artifacts from the Jargon codebase before launch.

**Architecture:** Cleanup only — no new features. Delete unused files, sync duplicates, update .gitignore, verify nothing breaks after each deletion.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind, Zustand, Cloudflare Workers

---

### Task 1: Delete Unused SVG Assets

**Files:**
- Delete: `src/assets/bingo-logo.svg`
- Delete: `src/assets/checkmark.svg`
- Delete: `src/assets/corporate-bingo-logo.svg`
- Delete: `src/assets/logo-fluff.svg`
- Delete: `src/assets/logo-pivot.svg`
- Delete: `src/assets/react.svg`
- Delete: `src/assets/reset-icon.svg`
- Delete: `src/assets/room-icon.svg`
- Delete: `src/assets/stats-icon.svg`

Only `jargon-logo.svg` is imported (by `ModeSelector.tsx` and `SoloGame.tsx`). The rest are old branding or template artifacts with zero imports.

- [ ] **Step 1: Verify no imports reference these files**

Run: `grep -r "bingo-logo\|checkmark\|corporate-bingo-logo\|logo-fluff\|logo-pivot\|react\.svg\|reset-icon\|room-icon\|stats-icon" src/`
Expected: No matches

- [ ] **Step 2: Delete the 9 unused SVG files**

```bash
cd "C:/Users/Ryan/CC/Projects/Corporate Bingo"
rm src/assets/bingo-logo.svg src/assets/checkmark.svg src/assets/corporate-bingo-logo.svg src/assets/logo-fluff.svg src/assets/logo-pivot.svg src/assets/react.svg src/assets/reset-icon.svg src/assets/room-icon.svg src/assets/stats-icon.svg
```

- [ ] **Step 3: Verify build still passes**

Run: `npm run build`
Expected: Build succeeds, no missing asset errors

- [ ] **Step 4: Commit**

```bash
git add -u src/assets/
git commit -m "delete 9 unused SVG assets"
```

---

### Task 2: Remove Dead Stores

**Files:**
- Delete: `src/stores/gameStore.ts` (335 LOC, not imported anywhere — not even in barrel export)
- Modify: `src/stores/uiStore.ts` — evaluate below
- Modify: `src/stores/index.ts` — remove uiStore re-export if deleting

**Context:** `gameStore.ts` is a v1.x scoring system. It's not imported by any component or the barrel file (`stores/index.ts`). Fully dead.

`uiStore.ts` (51 LOC) is exported from `stores/index.ts` but `useUIStore` is never imported by any component. Also dead.

- [ ] **Step 1: Verify gameStore has zero imports**

Run: `grep -r "gameStore\|useGameStore" src/`
Expected: Only hits inside `gameStore.ts` itself (self-references)

- [ ] **Step 2: Verify uiStore is unused by components**

Run: `grep -r "useUIStore" src/ --include="*.tsx" --include="*.ts" | grep -v "stores/"`
Expected: No matches (only defined/exported in stores/, never consumed)

- [ ] **Step 3: Delete gameStore.ts and uiStore.ts**

```bash
rm src/stores/gameStore.ts src/stores/uiStore.ts
```

- [ ] **Step 4: Update stores/index.ts — remove uiStore export**

Replace contents of `src/stores/index.ts` with:

```typescript
// Central export for all stores
export { useConnectionStore } from './connectionStore';
export { useDuoStore, regenerateDailyCardIfNeeded } from './duoStore';

// Export types from shared types
export type { BingoSquare, BingoPlayer, BingoRoom } from '../types';
export type { LineSelection, DuoPhase } from './duoStore';
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/stores/gameStore.ts src/stores/uiStore.ts src/stores/index.ts
git commit -m "delete dead gameStore + uiStore (unused)"
```

---

### Task 3: Sync Buzzwords Duplicate

**Files:**
- Modify: `src/data/buzzwords.js` — sync content from `.ts` version
- Keep: `src/data/buzzwords.ts` — source of truth for frontend

**Context:** Both files exist because:
- `buzzwords.ts` → imported by frontend (dailyCard.ts, soloStore.ts) — 172 phrases, newer
- `buzzwords.js` → imported by `worker.js` (plain JS, no build step, can't import .ts) — 171 phrases, older

We can't delete `.js` because `worker.js` is deployed as plain JS to Cloudflare (wrangler.toml has `main = "worker.js"` with no build command). We can't delete `.ts` because the frontend needs typed imports.

**Solution:** Copy `.ts` content into `.js` so they match. Add a comment noting the duplication reason.

- [ ] **Step 1: Copy buzzwords.ts content into buzzwords.js**

Read `buzzwords.ts`, copy all phrases into `buzzwords.js`. Update the `.js` file header:

```javascript
// Jargon Buzzwords - Professional Curated List
// DUPLICATE: worker.js imports this .js file directly (no TS build step).
// Source of truth is buzzwords.ts — keep both files in sync.
// Total: 172 professionally selected buzzwords

export const JARGON_PHRASES = [
  // ... (exact same array as buzzwords.ts)
];
```

- [ ] **Step 2: Verify worker still works locally**

Run: `npx wrangler dev --local`
Expected: Worker starts without import errors

- [ ] **Step 3: Verify frontend build passes**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/data/buzzwords.js
git commit -m "sync buzzwords.js with .ts (172 phrases)"
```

---

### Task 4: Delete Stale Migration Script

**Files:**
- Delete: `public/clear-old-state.js`
- Delete: `public/vite.svg` (Vite template artifact, unused)

**Context:** v0.x migration helper that clears old localStorage format. Not referenced in `index.html` or any source file. Served as a static file but never loaded. Safe to delete.

- [ ] **Step 1: Verify no references**

Run: `grep -r "clear-old-state" . --include="*.html" --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules | grep -v dist`
Expected: No matches

- [ ] **Step 2: Delete the file**

```bash
rm public/clear-old-state.js public/vite.svg
```

- [ ] **Step 3: Commit**

```bash
git add public/clear-old-state.js
git commit -m "delete stale v0.x migration script + vite.svg"
```

---

### Task 5: Add dist/ to .gitignore + Clean Tracked dist Files

**Files:**
- Modify: `.gitignore` — add `dist/`
- Remove from tracking: `dist/` contents

**Context:** `dist/` is a Vite build output. Netlify runs `npm run build` on deploy, so tracking these artifacts is unnecessary and creates noisy diffs. Currently `.gitignore` has `dist-react/` but not `dist/`.

- [ ] **Step 1: Add dist/ to .gitignore**

Add this line under the `# Build outputs` section in `.gitignore`:

```
dist/
```

- [ ] **Step 2: Remove dist/ from git tracking**

```bash
git rm -r --cached dist/
```

- [ ] **Step 3: Verify git status shows only the expected changes**

Run: `git status`
Expected: `.gitignore` modified, `dist/` files shown as deleted (from index only)

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "gitignore dist/ and remove tracked build artifacts"
```

---

### Task 6: Update Project CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (project root)

**Context:** CLAUDE.md still says gameStore "needs re-wire" and solo mode "needs building." Both are stale after cleanup. Update to reflect current state.

- [ ] **Step 1: Update stores table**

Replace the stores table with:

```markdown
| Store | Purpose |
|-------|---------|
| `duoStore` | Pairing, lines, scores, game state |
| `connectionStore` | WebSocket/polling, routes messages |
| `soloStore` | Solo mode state + localStorage persist |
```

Remove the `gameStore` and `uiStore` rows.

- [ ] **Step 2: Update Solo mode status**

Change Solo status from:
> **Status**: Needs building (gameStore.ts exists but disconnected)

To:
> **Status**: Built — toggleable squares, undoable bingo, persistent score

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "update CLAUDE.md to reflect cleanup"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Verify file tree is clean**

Run: `git status`
Expected: Clean working tree, nothing untracked (except node_modules, .wrangler, etc. covered by .gitignore)

---

## Out of Scope (Phase 3 — requires domain purchase)

These are NOT part of this cleanup but noted for future reference:

- Hardcoded URL updates (config.ts, shareUtils.ts, BingoModal.tsx, worker.js, wrangler.toml, netlify.toml)
- OG meta tags + image
- CORS origin updates
- Deep link handling, line progress indicator, post-BINGO behavior
- Tutorial rewrite
- Mobile testing

## Unresolved Questions

None — all resolved.
