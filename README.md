# Focus Flow — Pomodoro Timer

A distraction-free Pomodoro timer with tasks, local analytics, ambient music, and YouTube playback.

Live app: **https://gtmsudarshan.github.io/timer/**

## Features

- Focus / short break / long break timer with automatic cycle tracking
- Up to five persistent focus tasks
- Local statistics: today’s totals, streaks, consistency, weekly/monthly breakdowns, and activity heatmap
- Ambient audio tracks (Howler.js) or YouTube playback (IFrame API)
- Adjustable durations, auto-start, tick sound, and music autoplay
- CSV export of saved sessions with formula-injection protection
- Responsive layout for desktop, tablet, and mobile
- Quotes fetched from [`dummyjson.com`](https://dummyjson.com/docs/quotes), with offline fallback quotes

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the URL printed by Vite (usually `http://localhost:5173/timer/`).

Other scripts:

```bash
npm test       # unit tests
npm run lint   # ESLint
npm run build  # production build into dist/
npm run preview
```

The app uses `localStorage`, so settings, tasks, and session history stay on the current browser/device.
Clearing site data removes them.

## Deployment

Pushes to `master` run `.github/workflows/deploy.yml`, which lints, tests, builds, and publishes `dist/`
to GitHub Pages using the official Pages actions.

In repository settings, keep **Settings → Pages → Build and deployment → Source** set to
**GitHub Actions**. The custom domain was removed on purpose; the canonical URL is the `github.io` one.

## Project structure

```text
src/
  App.jsx              Main app and UI components
  main.jsx             React entry point
  styles.css           Extracted stylesheet
  lib/
    audio.js           Shared AudioContext and UI sounds
    csv.js             CSV building and sanitization
    dates.js           Local-date helpers
    storage.js         localStorage wrapper
    youtube.js         URL parsing and IFrame API loader
  test/                Test setup
```

## Notes

- Session dates use the browser’s **local calendar day**, not UTC, so streaks and “Today” are correct
  around midnight.
- Audio starts only after a user gesture, as required by modern browsers.
- The previous single-file/CDN version is still available in Git history as `pomodoro.jsx`.
