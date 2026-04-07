# Battleship Mode Design

> Replace bingo line selection with battleship-style hidden square placement. Core meeting-driven marking loop unchanged.

## Overview

Players each secretly place 5 squares on the shared daily card. During the meeting, both mark squares as they hear buzzwords. Marking an opponent's hidden square = a "hit." First to 5 hits wins instantly; otherwise most hits at midnight wins.

## What Changes

| Aspect | Before (Bingo) | After (Battleship) |
|--------|----------------|---------------------|
| Secret selection | 1 line (row/col/diagonal) | 5 individual squares |
| Selection timing | Alternating turns | Simultaneous |
| Scoring | Marks + bingo lines x3 | Hit count only |
| Instant win | Complete opponent's line | Hit all 5 opponent squares |
| End-of-day winner | Highest score | Most hits |
| Tiebreaker | Most bingo lines | Most total marks |

## What Stays the Same

- Daily seeded card (Mulberry32 PRNG, 25 buzzwords, UTC midnight reset)
- Room creation/joining with 4-char code
- Mark squares when you hear buzzwords
- WebSocket sync + HTTP polling fallback
- Shared single board, both players' marks visible
- Pairing persistence across days
- Yesterday snapshot system

## Game Flow

1. **Unpaired** — Enter name, create room or join with code (unchanged)
2. **Waiting** — Host shares code with partner (unchanged)
3. **Selecting** — Both players simultaneously pick 5 squares. Can adjust until pressing "Ready." Game starts when both ready.
4. **Playing** — Mark squares when heard. Hits tracked in real-time. Hit counter visible.
5. **Finished** — All 5 hits (instant) or midnight (most hits wins). Both placements revealed.

## Selection Phase

- Both players select simultaneously (no turn order)
- Any 5 squares valid — no adjacency or pattern constraint
- Both players can select the same square (overlap allowed)
- Tap to toggle selection, "Ready" button enabled at exactly 5 selected
- Can deselect/reselect until Ready is pressed
- Backend validates exactly 5 squares submitted

## During Gameplay

### Board Visibility
- **Your hidden squares**: Subtle persistent indicator (only you see these)
- **Your marks**: Standard mark styling
- **Opponent marks**: Visible (existing behavior)
- **Hits you landed**: Special "hit" styling — you marked a square that was opponent's hidden square
- **Hits on you**: Your hidden square marked by opponent — distinct "been hit" styling

### Hit Event
- When a player marks a square that is one of the opponent's 5 hidden squares:
  - Special hit animation plays (both players see it)
  - Square gets permanent "hit" styling for rest of game
  - Hit counter updates
- Marking your own hidden square does NOT count as a hit against you

### Score Display
- Hit counter: "You: X/5 — Them: Y/5"
- No point-based scoring — purely hit tracking

## Win Conditions

1. **Instant win**: First player to hit all 5 of opponent's squares
2. **Midnight**: UTC date changes → most hits wins
3. **Tiebreaker**: If equal hits, player with most total marked squares wins
4. **Draw**: If still tied, it's a draw

## Game Over Screen

- Winner announcement
- Both players' hidden squares revealed
- Hit count summary
- Share card (emoji grid showing placements + hits)
- Countdown to next daily card

## Backend Changes (worker.js)

- Selection storage: array of 5 square indices per player (replaces `LineSelection` type)
- Selection validation: exactly 5 indices, all 0-24, no duplicates per player
- Remove turn-based selection logic (simultaneous, both submit independently)
- `computeScore` → `computeHits`: count opponent marks on your hidden squares
- `checkBonusBingo` → `checkAllHit`: all 5 of opponent's squares marked
- Remove `countCompletedLines` and bingo line scoring
- Game over message includes both players' square placements

## Frontend Changes

### Types
- `LineSelection` type replaced with `squares: number[]` (array of 5 indices)
- Score fields become hit count fields
- Remove line-related types

### Components
- **LineSelector** → **SquareSelector**: Tap squares to toggle, 5 max, Ready button
- **BingoCard**: Add hit styling, hidden-square indicators, hit animation
- **DuoScoreboard**: Show hit counters instead of point scores
- **GameOverScreen**: Reveal both placements, hit summary
- **ShareCard**: Emoji grid showing hidden squares + hits instead of lines
- **BingoModal**: Repurpose for hit celebration (or remove)

### Stores
- `duoStore`: Replace line selection with square selection, hits instead of scores
- Remove bingo line calculation logic

## Share Card Format

Emoji grid showing the game result:
- Standard marked square
- Your hidden square
- Opponent's hidden square
- Hit (opponent marked your hidden square)
- Overlap (both players hid on same square)

Exact emoji choices decided during implementation based on what reads well.

## Testing Updates

- Update unit tests: replace line completion tests with hit counting tests
- Update API integration tests: battleship selection, hit detection, instant win, midnight win, tiebreaker
- Selection validation tests: exactly 5, range 0-24, no duplicates
- Self-mark-not-a-hit test
