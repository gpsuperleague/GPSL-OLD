// ===============================
// SQUAD.JS — First Team Squad Logic
// ===============================

import { supabase } from "./supabase_client.js";
import { applyPESDBRowClicks } from "./global_ui.js";
import { initGlobal } from "./global.js";
import { loadClubsMap } from "./clubs_lookup.js";

// GLOBAL STATE
let currentUserShort = null;
let userObj = null;
let activeListingsCache = [];
let selectedPlayerForListing = null;

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await initGlobal();

  const { data: { user } } = await supabase.auth.getUser();
  userObj = user;

  const { data: club } = await supabase
    .from("Clubs")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  currentUserShort = club.ShortName;

  document.getElementById("userEmail").textContent = user.email;
  document.getElementById("clubBadgeHeader").src =
    `images/club_badges/${currentUserShort}.png`;

  await loadClubsMap();
  await loadActiveListingsCache();
  await loadSquad();

  // Load modal HTML
  const modalContainer = document.getElementById("modal-container");
  const modalHTML = await fetch("list_player_modal.html").then(r => r.text());
  modalContainer.innerHTML = modalHTML;

  wireModalButtons();
});

// ===============================
// ACTIVE LISTINGS CACHE
// ===============================
async function loadActiveListingsCache() {
  const { data } = await supabase
    .from("Player_Transfer_Listings")
    .select("*")
    .eq("seller_club_id", currentUserShort)
    .eq("status", "Active");

  activeListingsCache = data || [];
}

// ===============================
// LOAD SQUAD
// ===============================
async function loadSquad() {
  const { data } = await supabase
    .from("Players")
    .select("*")
    .eq("Contracted_Team", currentUserShort);

  renderSquad(data || []);
}

// ===============================
// RENDER SQUAD
// ===============================
function renderSquad(players) {
  const tbody = document.getElementById("squad-body");
  tbody.innerHTML = "";

  const groups = {
    "Goalkeepers": ["GK"],
    "Defenders": ["LB", "CB", "RB"],
    "Midfielders": ["DMF", "LMF", "CMF", "RMF", "AMF"],
    "Attackers": ["SS", "LW", "CF", "RW"]
  };

  for (const [groupName, positions] of Object.entries(groups)) {
    const headerRow = document.createElement("tr");
    headerRow.classList.add("squad-section-row");
    headerRow.innerHTML =
      `<td colspan="10" class="squad-section-title">${groupName}</td>`;
    tbody.appendChild(headerRow);

    const groupPlayers = players
      .filter(p => positions.includes(p.Position))
      .sort((a, b) => b.market_value - a.market_value);

    groupPlayers.forEach(p => {
      const isListed = activeListingsCache.some(
        l => l.player_id === p.Konami_ID
      );

      const status = isListed
        ? `<span class="status-pill status-listed">Listed</span>`
        : `<span class="status-pill status-not-listed">Not Listed</span>`;

      const tr = document.createElement("tr");
      tr.dataset.konamiId = p.Konami_ID;

      const imgURL = `https://pesdb.net/assets/img/card/b${p.Konami_ID}.png`;

      tr.innerHTML = `
        <td><img src="${imgURL}" class="player-thumb" onerror="this.src='https://i.imgur.com/3s8XQ7Y.png'"></td>
        <td>${p.Name}</td>
        <td>${p.Nation || "-"}</td>
        <td>${p.Position}</td>
        <td>${p.Rating || p.OVR}</td>
        <td>${p.Playstyle || "-"}</td>
        <td><span class="money">₿ ${Number(p.market_value).toLocaleString("en-GB")}</span></td>
        <td>${status}</td>
        <td>
          <select onchange="handlePlayerAction('${p.Konami_ID}', this.value)">
            <option value="">Action</option>
            <option value="list">Transfer List</option>
          </select>
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  applyPESDBRowClicks("squad-body");
}

// ===============================
// PLAYER ACTION HANDLER
// ===============================
window.handlePlayerAction = function(playerId, action) {
  if (action === "list") {
    openListPlayerModalByID({ Konami_ID: playerId });
  }
};

// ===============================
// MODAL LOGIC (unchanged from dashboard.js)
// ===============================

async function openListPlayerModalByID(playerRef) {
  const { data } = await supabase
    .from("Players")
    .select("*")
    .eq("Konami_ID", playerRef.Konami_ID)
    .single();

  openListPlayerModal(data);
}

function openListPlayerModal(player) {
  selectedPlayerForListing = player;

  document.getElementById("modalPlayerName").textContent = player.Name;
  document.getElementById("modalPlayerInfo").textContent =
    `${player.Position} • Rating ${player.Rating}`;

  document.getElementById("modalMarketValue").textContent =
    `₿ ${Number(player.market_value).toLocaleString("en-GB")}`;
  document.getElementById("modalMaxReserve").textContent =
    `₿ ${Number(player.Maximum_Reserve_Price).toLocaleString("en-GB")}`;

  const reserveInput = document.getElementById("reserveInput");
  const reserveError = document.getElementById("reserveError");

  reserveInput.value = "";
  reserveInput.style.border = "1px solid #444";
  reserveError.textContent = "";

  document.getElementById("list-player-modal-backdrop").style.display = "flex";
}

// ===============================
// RESERVE VALIDATION + INCREMENTS
// (unchanged from dashboard.js)
// ===============================

function parseNumericInput(value) {
  return Number(String(value).replace(/,/g, "")) || 0;
}

function formatNumeric(value) {
  return Number(value).toLocaleString("en-GB");
}

function validateReserveInput() {
  const input = document.getElementById("reserveInput");
  const errorBox = document.getElementById("reserveError");

  if (!selectedPlayerForListing) {
    errorBox.textContent = "No player selected.";
    input.style.border = "2px solid red";
    return false;
  }

  let raw = String(input.value).replace(/,/g, "").trim();
  if (raw === "") {
    errorBox.textContent = "";
    input.style.border = "1px solid #444";
    return false;
  }

  let value = Number(raw);
  if (Number.isNaN(value) || value <= 0) {
    errorBox.textContent = "Enter a valid positive number.";
    input.style.border = "2px solid red";
    return false;
  }

  input.value = formatNumeric(value);

  const mv = selectedPlayerForListing.market_value;
  const max = selectedPlayerForListing.Maximum_Reserve_Price;

  if (value < mv) {
    errorBox.textContent =
      `Reserve must be at least market value (₿ ${formatNumeric(mv)}).`;
    input.style.border = "2px solid red";
    return false;
  }

  if (value > max) {
    errorBox.textContent =
      `Reserve cannot exceed max allowed (₿ ${formatNumeric(max)}).`;
    input.style.border = "2px solid red";
    return false;
  }

  errorBox.textContent = "";
  input.style.border = "2px solid #4CAF50";
  return true;
}

function addReserveIncrement(amount) {
  const input = document.getElementById("reserveInput");
  let current = parseNumericInput(input.value);

  current += amount;

  if (current < 0) current = 0;

  const mv = selectedPlayerForListing.market_value;
  if (current < mv) current = mv;

  const max = selectedPlayerForListing.Maximum_Reserve_Price;
  if (current > max) current = max;

  input.value = formatNumeric(current);
  validateReserveInput();
}

function wireModalButtons() {
  document.getElementById("dec-500k-list").onclick = () => addReserveIncrement(-500000);
  document.getElementById("dec-1m-list").onclick = () => addReserveIncrement(-1000000);
  document.getElementById("dec-5m-list").onclick = () => addReserveIncrement(-5000000);

  document.getElementById("inc-500k-list").onclick = () => addReserveIncrement(500000);
  document.getElementById("inc-1m-list").onclick = () => addReserveIncrement(1000000);
  document.getElementById("inc-5m-list").onclick = () => addReserveIncrement(5000000);

  document.getElementById("useMarketValueBtn").onclick = () => {
    if (!selectedPlayerForListing) return;
    const input = document.getElementById("reserveInput");
    input.value = formatNumeric(selectedPlayerForListing.market_value);
    validateReserveInput();
  };

  document.getElementById("useMaxReserveBtn").onclick = () => {
    if (!selectedPlayerForListing) return;
    const input = document.getElementById("reserveInput");
    input.value = formatNumeric(selectedPlayerForListing.Maximum_Reserve_Price);
    validateReserveInput();
  };

  document.getElementById("reserveInput").oninput = () => validateReserveInput();

  document.getElementById("cancelListBtn").onclick = () => {
    document.getElementById("list-player-modal-backdrop").style.display = "none";
  };

  document.getElementById("confirmListBtn").onclick = validateAndCreateListing;
}

// ===============================
// CREATE LISTING
// (unchanged from dashboard.js)
// ===============================
async function validateAndCreateListing() {
  const input = document.getElementById("reserveInput");
  const reserve = parseNumericInput(input.value);
  const mv = selectedPlayerForListing.market_value;
  const max = selectedPlayerForListing.Maximum_Reserve_Price;

  if (!validateReserveInput()) return;

  const now = new Date().toISOString();
  const endTime = new Date(Date.now() + 86400000).toISOString();

  const { error } = await supabase
    .from("Player_Transfer_Listings")
    .insert({
      player_id: selectedPlayerForListing.Konami_ID,
      seller_club_id: currentUserShort,
      reserve_price: reserve,
      market_value: mv,
      start_time: now,
      end_time: endTime,
      status: "Active",
      listing_type: "standard",
      hidden_bids: false,
      random_end_time: null,
      special_rules: {},
      current_highest_bid: null,
      current_highest_bidder: null,
      seller_review_deadline: endTime,
      review_deadline: endTime,
      winning_bid: null,
      winning_club: null,
      transfer
