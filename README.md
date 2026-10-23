# Swell Rider

A small three.js jet ski game. You ride open water with choppy waves, hit swells to launch into big air, spin tricks, and fly through rings.

## Controls
- **W / ↑** throttle, **S / ↓** brake/reverse, **A D / ← →** steer
- **Space** pop jump, **Shift** boost
- **A / D in the air** spin (land facing your direction of travel or you wipe out)
- **P / Esc** pause, **R** restart, **M** mute
- Touch: left stick to ride and steer (pull down to brake), JUMP and BOOST buttons

## Run
```
npm install
npm run dev        # http://127.0.0.1:5188
```

## Put it on your site
```
npm run build
```
Upload the contents of `dist/` (`index.html` plus `assets/`) to any static host or subfolder. Asset paths are relative, so you don't need any server config.

## Testing
`npm run build:test` builds with deterministic test hooks (`window.__THREE_GAME_TEST_HOOKS__`). The production `build` has no hooks. The playtest sections are in `scripts/playtest/`.
