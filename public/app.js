const entry = document.querySelector("#entry"), game = document.querySelector("#game"), error = document.querySelector("#error"), content = document.querySelector("#content"), players = document.querySelector("#players"), timer = document.querySelector("#timer"), roomDisplay = document.querySelector("#room-display");
let session = JSON.parse(localStorage.getItem("fearbound-session") || "null"), source, current;
const rules = document.querySelector("#rules");
const esc = value => { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; };
async function post(path, body) { const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload; }
function playerName() { return document.querySelector("#name").value.trim(); }
function save(next) { session = next; localStorage.setItem("fearbound-session", JSON.stringify(next)); connect(); }
document.querySelector("#help").onclick = () => rules.showModal();
document.querySelector("#close-rules").onclick = () => rules.close();
document.querySelector("#create").onclick = async () => { try { error.textContent = ""; save(await post("/api/rooms", { name: playerName(), difficulty: document.querySelector("#difficulty").value })); } catch (reason) { error.textContent = reason.message; } };
document.querySelector("#join").onclick = async () => { try { error.textContent = ""; save(await post("/api/join", { name: playerName(), roomCode: document.querySelector("#room-code").value.toUpperCase() })); } catch (reason) { error.textContent = reason.message; } };
function connect() { if (!session) return; source?.close(); source = new EventSource(`/events?room=${encodeURIComponent(session.roomCode)}&player=${encodeURIComponent(session.playerId)}`); source.addEventListener("state", event => { current = JSON.parse(event.data); render(); }); }
function render() {
  entry.hidden = true; game.hidden = false; roomDisplay.textContent = current.roomCode;
  players.innerHTML = current.players.map(player => `<div class="player"><span>${esc(player.name)}${player.id === current.hostId ? " · HOST" : ""}</span><b>${current.score[player.id] || 0}</b></div>`).join("");
  const isHost = current.me.id === current.hostId;
  if (current.phase === "lobby") {
    content.innerHTML = `<p class="eyebrow">${esc(current.difficulty)} cases · awaiting players</p><h2>Gather your witnesses</h2><p>Share <strong>${current.roomCode}</strong>. Once 3–8 players arrive, the host begins the case.</p><div class="how"><strong>How to play</strong><ol><li>Read your private clue.</li><li>Discuss what happened.</li><li>Choose the true theory and accuse the Deceiver.</li></ol></div>${isHost ? `<button id="start" ${current.players.length < 3 ? "disabled" : ""}>Begin case</button>` : "<p class=\"muted\">Waiting for the host.</p>"}${current.message ? `<p class="result">${esc(current.message)}</p>` : ""}`;
    document.querySelector("#start")?.addEventListener("click", () => post("/api/start", session).catch(reason => alert(reason.message)));
  } else if (current.phase === "discuss") {
    const brief = current.scenario.deceiverBrief ? `<div class="brief"><span>Your false theory</span><strong>${esc(current.scenario.deceiverBrief)}</strong></div>` : "";
    const role = current.role === "DECEIVER" ? "You are the Deceiver. Sell your false theory without drawing suspicion." : "You are an Investigator. Compare clues, discover the truth, and identify the Deceiver.";
    content.innerHTML = `<p class="eyebrow">Case ${current.round} · ${current.role}</p><h2>${esc(current.scenario.title)}</h2><p class="setting">${esc(current.scenario.setting)}</p><div class="clue"><span>Your private clue</span><strong>${esc(current.clue)}</strong></div>${brief}<p>${role}</p><p class="muted">Your clue is private. Share it—or withhold it—during discussion.</p>`;
  } else if (current.phase === "vote") {
    content.innerHTML = `<p class="eyebrow">Final decision</p><h2>Close the case</h2><p>${esc(current.scenario.setting)}</p><div class="clue"><span>Your clue</span><strong>${esc(current.clue)}</strong></div><h3>1. What happened?</h3><div class="theories">${current.scenario.theories.map((theory, index) => `<label class="theory"><input type="radio" name="theory" value="${index}"><span>${esc(theory)}</span></label>`).join("")}</div><h3>2. Who is the Deceiver?</h3><div class="vote-list">${current.players.filter(player => player.id !== current.me.id).map(player => `<button class="vote" data-id="${player.id}">${esc(player.name)}</button>`).join("")}</div><p class="muted">Choose a theory, then choose who you accuse. Your answer is private until reveal.</p>`;
    document.querySelectorAll(".vote").forEach(button => button.onclick = async () => { const choice = document.querySelector("input[name=theory]:checked"); if (!choice) return alert("Choose the theory you believe first."); try { await post("/api/vote", { ...session, targetId: button.dataset.id, theoryId: Number(choice.value) }); } catch (reason) { alert(reason.message); } });
  } else {
    const answers = current.votes.map(vote => `${esc(current.players.find(player => player.id === vote.voter)?.name || "Unknown")} → ${esc(current.players.find(player => player.id === vote.targetId)?.name || "No accusation")} · Theory ${Number(vote.theoryId) + 1}`).join("<br>");
    const deceiver = current.players.find(player => player.id === current.deceiverId)?.name || "Unknown";
    content.innerHTML = `<p class="eyebrow">Case closed</p><h2>${esc(current.message)}</h2><p class="setting">${esc(current.scenario.setting)}</p><div class="truth"><span>The truth</span><strong>${esc(current.scenario.truth)}</strong></div><p><strong>The Deceiver was ${esc(deceiver)}.</strong></p><p>Answers:<br>${answers || "No answers submitted."}</p>`;
  }
}
setInterval(() => { timer.textContent = current?.endsAt ? `${Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000))}s` : ""; }, 250);
connect();
