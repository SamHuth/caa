# Cards Against Angali

A mobile-first browser card game: match colour or number, play doubles and sums, jump in out of turn, and beat Angali. Single player vs CPUs, or multiplayer rooms where the host's browser runs the game peer-to-peer (WebRTC via PeerJS). No game server is needed.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run dev:lan    # HTTPS on your LAN, so phones can join (accept the self-signed cert)
npm test           # rules engine tests + CPU-vs-CPU match simulations
npm run build      # static site in dist/ — deploy to Cloudflare Pages / Netlify / GitHub Pages
```

WebRTC, Web Share and Wake Lock need a secure context, so test phones over `dev:lan` (HTTPS) or a deployed HTTPS URL.

## Multiplayer networking

- The host registers a PeerJS id from the 5-character room code, and guests connect straight to it. Signaling uses the free public PeerJS broker by default.
- The host's browser is authoritative. It runs the engine, timers and CPU seats, and sends each guest a view with other hands hidden.
- A guest who refreshes can rejoin by entering the same code, and gets their seat back. A CPU covers their seat while they're away.
- If the host closes the tab, the game ends for everyone. Hosts should keep the screen on; the app requests a wake lock.
- **Mobile data / strict NATs:** add a TURN server in `.env.local` (see `.env.example`). Otherwise some phone-to-phone connections will fail.

## Layout

```
src/engine/   pure rules: cards, validation, game reducer, match/round scoring, CPU, redacted views (+ tests)
src/host/     HostSession: runs a match (timers, CPUs, jump-in arbitration) + LocalTransport
src/net/      PeerJS host/guest, room codes, message protocol
src/ui/       screens (home, settings, multiplayer, lobby), game screen, touch/keyboard input
```

## Before pushing

Add every change to the top of `src/ui/changelog.ts`, one short player-facing line each. That list feeds What's New on the home screen, and its red badge counts changes a player hasn't seen yet.

## Open items

- Sounds and PWA install manifest.
