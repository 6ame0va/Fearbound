const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const ROUND_SECONDS = { discuss: 75, vote: 35, reveal: 20 };

const scenarios = [
  {
    title: "Room 404",
    setting: "At 2:13 AM, Mara Vale vanished from the sealed Room 404.",
    truth: "Mara staged the disappearance. She left through the maintenance hatch before locking the door from the inside with a timer.",
    clues: [
      "The door was locked from the inside when security arrived.",
      "A service elevator stopped on floor four at 2:11 AM.",
      "The building cameras went offline for exactly ninety seconds.",
      "A dusty maintenance hatch behind the wardrobe was left slightly open.",
      "Mara's phone sent: ‘Don't look for me in the room’ at 2:14 AM.",
      "A keycard log shows Mara entered alone at 2:06 AM."
    ]
  },
  {
    title: "The Last Broadcast",
    setting: "A radio host disappeared live on air after saying, ‘It is already inside.’",
    truth: "The host was hiding from a stalker who had entered the station. She triggered the prerecorded emergency loop and escaped through the sound booth exit.",
    clues: [
      "The final sentence was followed by exactly the same three notes heard in yesterday's broadcast.",
      "A wet footprint ends outside the sound booth, not inside it.",
      "The station's back-door alarm was disabled at 11:58 PM.",
      "A caller heard someone whispering before the host spoke.",
      "The host's bag was missing, but her coat was still on the chair.",
      "A taxi camera caught the host entering a car at 12:07 AM."
    ]
  },
  {
    title: "The Ashen Gallery",
    setting: "An art gallery burned down, leaving one painting untouched in the center of the room.",
    truth: "The curator started a controlled fire to destroy forged records, protecting the painting in a fireproof display case.",
    clues: [
      "The untouched painting was inside a display case rated for extreme heat.",
      "The fire began beside a cabinet of provenance records.",
      "The sprinkler system had been put into maintenance mode earlier that night.",
      "The curator's gloves smelled faintly of accelerant.",
      "The gallery's insurance had lapsed two days before the fire.",
      "The painting's authentication seal was discovered to be counterfeit."
    ]
  }
];

function code() {
  let value;
  do value = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms.has(value));
  return value;
}

function publicRoom(room, playerId) {
  const player = room.players.get(playerId);
  const phase = room.phase;
  return {
    roomCode: room.code,
    phase,
    hostId: room.hostId,
    me: player ? { id: player.id, name: player.name } : null,
    players: [...room.players.values()].map(({ id, name }) => ({ id, name })),
    round: room.round,
    endsAt: room.endsAt,
    scenario: room.scenario && {
      title: room.scenario.title,
      setting: room.scenario.setting,
      truth: phase === "reveal" ? room.scenario.truth : null
    },
    clue: phase === "discuss" || phase === "vote" ? room.clues.get(playerId) || null : null,
    role: phase === "discuss" || phase === "vote" ? (room.deceiverId === playerId ? "DECEIVER" : "INVESTIGATOR") : null,
    votes: phase === "reveal" ? [...room.votes.entries()].map(([voter, target]) => ({ voter, target })) : [],
    score: Object.fromEntries(room.scores),
    message: room.message || null
  };
}

function send(room, playerId) {
  const state = `event: state\ndata: ${JSON.stringify(publicRoom(room, playerId))}\n\n`;
  for (const client of room.clients.get(playerId) || []) client.write(state);
}

function broadcast(room) {
  for (const playerId of room.players.keys()) send(room, playerId);
}

function clearTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}

function setPhase(room, phase) {
  clearTimer(room);
  room.phase = phase;
  room.endsAt = Date.now() + ROUND_SECONDS[phase] * 1000;
  room.timer = setTimeout(() => {
    if (phase === "discuss") setPhase(room, "vote");
    else if (phase === "vote") reveal(room);
    else resetToLobby(room);
  }, ROUND_SECONDS[phase] * 1000);
  broadcast(room);
}

function startRound(room) {
  if (room.players.size < 3) throw new Error("FEARBOUND needs at least 3 players to begin.");
  room.round += 1;
  room.scenario = scenarios[(room.round - 1) % scenarios.length];
  const players = [...room.players.keys()];
  room.deceiverId = players[Math.floor(Math.random() * players.length)];
  room.votes = new Map();
  room.clues = new Map(players.map((id, index) => [id, room.scenario.clues[index % room.scenario.clues.length]]));
  room.message = null;
  setPhase(room, "discuss");
}

function reveal(room) {
  clearTimer(room);
  room.phase = "reveal";
  room.endsAt = Date.now() + ROUND_SECONDS.reveal * 1000;
  const accused = [...room.votes.values()].filter(Boolean);
  const counts = accused.reduce((result, id) => ({ ...result, [id]: (result[id] || 0) + 1 }), {});
  const mostVoted = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0];
  const investigatorsWin = mostVoted === room.deceiverId;
  for (const id of room.players.keys()) {
    const current = room.scores.get(id) || 0;
    room.scores.set(id, current + (id === room.deceiverId ? (investigatorsWin ? 0 : 2) : (investigatorsWin ? 1 : 0)));
  }
  room.message = investigatorsWin ? "The investigators exposed the Deceiver." : "The Deceiver escaped suspicion.";
  room.timer = setTimeout(() => resetToLobby(room), ROUND_SECONDS.reveal * 1000);
  broadcast(room);
}

function resetToLobby(room) {
  clearTimer(room);
  room.phase = "lobby";
  room.endsAt = null;
  room.scenario = null;
  room.clues = new Map();
  room.message = "Round complete. The host can begin the next case.";
  broadcast(room);
}

function getRoom(code) {
  const room = rooms.get(String(code || "").toUpperCase());
  if (!room) throw new Error("That room does not exist.");
  return room;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => { body += chunk; if (body.length > 20_000) request.destroy(); });
    request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid request.")); } });
  });
}

function respond(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function api(request, response) {
  const body = await readJson(request);
  if (request.url === "/api/rooms" && request.method === "POST") {
    const name = String(body.name || "").trim().slice(0, 24);
    if (!name) throw new Error("Enter a name first.");
    const room = { code: code(), hostId: randomUUID(), players: new Map(), clients: new Map(), phase: "lobby", round: 0, scores: new Map(), clues: new Map(), votes: new Map(), timer: null, endsAt: null };
    room.players.set(room.hostId, { id: room.hostId, name });
    room.scores.set(room.hostId, 0);
    rooms.set(room.code, room);
    return respond(response, 201, { roomCode: room.code, playerId: room.hostId });
  }
  if (request.url === "/api/join" && request.method === "POST") {
    const room = getRoom(body.roomCode);
    if (room.phase !== "lobby") throw new Error("This case is already in progress.");
    if (room.players.size >= 8) throw new Error("This room is full.");
    const name = String(body.name || "").trim().slice(0, 24);
    if (!name) throw new Error("Enter a name first.");
    const playerId = randomUUID();
    room.players.set(playerId, { id: playerId, name });
    room.scores.set(playerId, 0);
    broadcast(room);
    return respond(response, 200, { roomCode: room.code, playerId });
  }
  const room = getRoom(body.roomCode);
  if (!room.players.has(body.playerId)) throw new Error("Your session is no longer in this room.");
  if (request.url === "/api/start" && request.method === "POST") {
    if (room.hostId !== body.playerId) throw new Error("Only the host can begin a case.");
    startRound(room);
    return respond(response, 200, { ok: true });
  }
  if (request.url === "/api/vote" && request.method === "POST") {
    if (room.phase !== "vote") throw new Error("Voting has not started.");
    if (!room.players.has(body.targetId) || body.targetId === body.playerId) throw new Error("Choose another player.");
    room.votes.set(body.playerId, body.targetId);
    if (room.votes.size === room.players.size) reveal(room); else send(room, body.playerId);
    return respond(response, 200, { ok: true });
  }
  respond(response, 404, { error: "Not found." });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/events" && request.method === "GET") {
      const room = getRoom(url.searchParams.get("room"));
      const playerId = url.searchParams.get("player");
      if (!room.players.has(playerId)) throw new Error("Unknown player.");
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const clients = room.clients.get(playerId) || new Set();
      clients.add(response); room.clients.set(playerId, clients); send(room, playerId);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (url.pathname.startsWith("/api/")) return await api(request, response);
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!["index.html", "app.js", "styles.css"].includes(file)) return respond(response, 404, { error: "Not found." });
    const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "application/javascript" : "text/html";
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    response.end(await readFile(path.join(__dirname, "public", file)));
  } catch (error) {
    respond(response, 400, { error: error.message || "Something went wrong." });
  }
});

server.listen(PORT, () => console.log(`FEARBOUND is listening on http://localhost:${PORT}`));
