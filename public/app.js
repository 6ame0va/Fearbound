const entry = document.querySelector("#entry");
const game = document.querySelector("#game");
const error = document.querySelector("#error");
const content = document.querySelector("#content");
const players = document.querySelector("#players");
const timer = document.querySelector("#timer");
const roomDisplay = document.querySelector("#room-display");
let session = JSON.parse(localStorage.getItem("fearbound-session") || "null");
let source;
let current;

async function post(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error);
  return payload;
}
function name() { return document.querySelector("#name").value.trim(); }
function showError(message) { error.textContent = message; }
function save(next) { session = next; localStorage.setItem("fearbound-session", JSON.stringify(next)); connect(); }
function esc(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }

document.querySelector("#create").onclick = async () => { try { showError(""); const result = await post("/api/rooms", { name: name() }); save(result); } catch (e) { showError(e.message); } };
document.querySelector("#join").onclick = async () => { try { showError(""); const result = await post("/api/join", { name: name(), roomCode: document.querySelector("#room-code").value.toUpperCase() }); save(result); } catch (e) { showError(e.message); } };

function connect() {
  if (!session) return;
  source?.close();
  source = new EventSource(`/events?room=${encodeURIComponent(session.roomCode)}&player=${encodeURIComponent(session.playerId)}`);
  source.addEventListener("state", event => { current = JSON.parse(event.data); render(); });
  source.onerror = () => { /* EventSource retries automatically. */ };
}
function render() {
  entry.hidden = true; game.hidden = false; roomDisplay.textContent = current.roomCode;
  players.innerHTML = current.players.map(player => `<div class="player"><span>${esc(player.name)}${player.id === current.hostId ? " · HOST" : ""}</span><b>${current.score[player.id] || 0}</b></div>`).join("");
  const isHost = current.me.id === current.hostId;
  if (current.phase === "lobby") {
    content.innerHTML = `<p class="eyebrow">Awaiting players</p><h2>Gather your witnesses</h2><p>Share <strong>${current.roomCode}</strong> with friends. Every player needs their own browser or device. When there are at least 3 players, the host begins the case.</p>${isHost ? `<button id="start" ${current.players.length < 3 ? "disabled" : ""}>Begin case</button>` : "<p class=\"muted\">Waiting for the host to begin.</p>"}${current.message ? `<p class="result">${esc(current.message)}</p>` : ""}`;
    document.querySelector("#start")?.addEventListener("click", actionStart);
  } else if (current.phase === "discuss") {
    content.innerHTML = `<p class="eyebrow">Case ${current.round} · ${current.role}</p><h2>${esc(current.scenario.title)}</h2><p class="setting">${esc(current.scenario.setting)}</p><div class="clue"><span>Your private clue</span><strong>${esc(current.clue)}</strong></div><p>${current.role === "DECEIVER" ? "You are the Deceiver. Keep suspicion away from yourself and steer the group toward the wrong answer." : "You are an Investigator. Compare clues, reconstruct the truth, and identify the Deceiver."}</p><p class="muted">Discuss openly. Your private clue is yours to share—or withhold.</p>`;
  } else if (current.phase === "vote") {
    content.innerHTML = `<p class="eyebrow">Final decision</p><h2>Who is deceiving the room?</h2><p>${esc(current.scenario.setting)}</p><div class="clue"><span>Your clue</span><strong>${esc(current.clue)}</strong></div><div class="vote-list">${current.players.filter(player => player.id !== current.me.id).map(player => `<button class="vote" data-id="${player.id}">${esc(player.name)}</button>`).join("")}</div><p class="muted">Your vote is private until the reveal.</p>`;
    document.querySelectorAll(".vote").forEach(button => button.onclick = () => actionVote(button.dataset.id));
  } else {
    const voteRows = current.votes.map(vote => `${esc(current.players.find(player => player.id === vote.voter)?.name || "Unknown")} → ${esc(current.players.find(player => player.id === vote.target)?.name || "No vote")}`).join("<br>");
    content.innerHTML = `<p class="eyebrow">Case closed</p><h2>${esc(current.message)}</h2><p class="setting">${esc(current.scenario.setting)}</p><div class="truth"><span>The truth</span><strong>${esc(current.scenario.truth)}</strong></div><p>Votes:<br>${voteRows || "No votes cast."}</p>`;
  }
}
async function actionStart() { try { await post("/api/start", session); } catch (e) { alert(e.message); } }
async function actionVote(targetId) { try { await post("/api/vote", { ...session, targetId }); } catch (e) { alert(e.message); } }
setInterval(() => { if (current?.endsAt) { const seconds = Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000)); timer.textContent = `${seconds}s`; } else timer.textContent = ""; }, 250);
connect();
