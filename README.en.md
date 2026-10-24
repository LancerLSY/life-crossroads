# Otherlife · 人生岔路

[简体中文](README.md) · [Releases](https://github.com/LancerLSY/life-crossroads/releases) · [Feedback](https://github.com/LancerLSY/life-crossroads/issues)

[![Verify game](https://github.com/LancerLSY/life-crossroads/actions/workflows/ci.yml/badge.svg)](https://github.com/LancerLSY/life-crossroads/actions/workflows/ci.yml)

![Otherlife: pixel scene rendered by the game](docs/media/otherlife-cover.png)

**Your birthplace is a draw. Your next steps are yours.**

Otherlife is a pixel life simulation with a Chinese-language game interface. Start with a randomly drawn identity, choose a historical, present-day or future setting, and follow a life shaped by relationships, spending, travel and unexpected events.

- **Weighted births across 172 countries and regions.** Reveal your birthplace, identity and family one step at a time.
- **Relationships with consequences.** Listening, helping, apologies and broken promises affect trust and closeness. A promise needs an action to fulfil it. Optional annual NPC assessments can also worsen a relationship when current facts support disappointment.
- **Stories that carry forward.** Relationships and paid actions can start or change ongoing story threads. Optional DeepSeek narration uses the current life, memories and active threads.
- **Branching timelines.** Return to an earlier decision, keep the original future and explore another path. Plans require real contributions across years; waiting, abandonment and completion have distinct recorded outcomes.
- **A changing pixel world.** Age, household, housing, occupation and the end of a life change the rendered scene.
- **Playable locally without an API key.** Connect your own DeepSeek account for richer dialogue and narration. The simulation owns age, money and consequential choices.

![Scenes from one simulated life at ages 0, 6, 18, 32 and 70](docs/media/life-stages.gif)

## Run locally

Requires Node.js **22.18 or later**. The current preview is self-hosted; there is no public hosted play link.

```sh
git clone https://github.com/LancerLSY/life-crossroads.git
cd life-crossroads
npm ci
npm run dev
```

Open http://127.0.0.1:5173 . The API server runs on port 3001.

## Optional DeepSeek connection

Copy `.env.example` to `.env.local` and set your own server-side API key, base URL and available model. Restart the server, then refresh the connection status in the game settings. The repository includes no working credentials. Keep real keys out of `VITE_` variables and Git.

World intelligence adjusts NPC activity, narration and continuing story threads. Without a key, or when a request fails, local simulation and fallback stories remain available.

## Project status

This is a public preview with a Chinese-language interface. It has 205 passing tests plus lint, type checking and a production build. Real DeepSeek dialogue, promises and travel-related stories have been checked, alongside desktop and mobile browser flows.

Birth conditions use independently sourced population data and weighted DHS surveys where covered; missing countries and fields use documented estimates. Future conditions and special story probabilities are game settings. Outcomes are simulation results, not personal or regional risk predictions.

Code, narration and art are independently implemented. See the Chinese [feature comparison](docs/parity.md), [data sources](docs/data-sources.md) and [art notes](docs/assets.md) for scope and provenance.

If this direction interests you, try a life, star the repository, or [tell us what happened](https://github.com/LancerLSY/life-crossroads/issues).
