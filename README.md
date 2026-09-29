# FEARBOUND

A realtime, browser-based mystery deduction game for 3–8 people. Players join using a room code, receive private clues, discuss the case, vote for the hidden Deceiver, and see the result together.

## Play locally

Use Node.js 20 or newer, then run:

```sh
npm start
```

Open `http://localhost:3000`. To test multiplayer locally, open the game in separate browser profiles or devices on the same network (using the host computer's local network address).

## Rules

1. The host creates a room and shares its four-letter code.
2. Once three or more players enter, the host begins a case.
3. Everyone gets a private clue. One player is secretly the Deceiver.
4. Discuss the clues before time runs out, then vote for the person you think is misleading the group.
5. Investigators gain a point when the Deceiver is identified; otherwise the Deceiver gains two.

## Deployment

The app has no external runtime dependencies and can be deployed to any Node-capable host. Set `PORT` if the host supplies one; the start command is `npm start`.
