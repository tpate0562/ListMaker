// ============================================================
// app.js — User page controller
// ============================================================

import {
  db, joinOrCreatePlayer, listenToPlayer, listenToBets,
  listenToGameState, initGameState, placeBet, calculateTotalPayout,
  buildRouletteTable, renderChipsOnTable, renderHistory,
  RouletteWheel, getNumberColor, ALL_NUMBERS
} from './shared.js';

import { doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ─── State ───────────────────────────────────────────────────
let currentPlayer = null;       // { playerId, username, balance }
let selectedChip = 25;          // default chip value
let allBets = [];               // live bets from Firebase
let wheel = null;               // RouletteWheel instance
let lastProcessedRound = null;  // prevent double payout processing
let bettingLocked = false;

// ─── DOM refs ────────────────────────────────────────────────
const joinModal     = document.getElementById('join-modal');
const gameContainer = document.getElementById('game-container');
const usernameInput = document.getElementById('username-input');
const playerIdInput = document.getElementById('playerid-input');
const joinBtn       = document.getElementById('join-btn');
const joinError     = document.getElementById('join-error');
const nameDisplay   = document.getElementById('player-name-display');
const balanceDisplay= document.getElementById('player-balance-display');
const tableEl       = document.getElementById('roulette-table');
const yourBetsList  = document.getElementById('your-bets-list');
const yourBetTotal  = document.getElementById('your-bet-total');
const allBetsList   = document.getElementById('all-bets-list');
const phaseDisplay  = document.getElementById('game-phase-display');
const historyStrip  = document.getElementById('history-strip');
const resultBanner  = document.getElementById('result-banner');
const toastContainer= document.getElementById('toast-container');

// ─── Toast helper ────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  toastContainer.append(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── Join Flow ───────────────────────────────────────────────
joinBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const playerId = playerIdInput.value.trim();
  if (!username || !playerId) {
    joinError.textContent = 'Please enter both fields.';
    return;
  }
  joinError.textContent = '';
  joinBtn.disabled = true;
  joinBtn.textContent = 'Joining...';

  try {
    await initGameState();
    const data = await joinOrCreatePlayer(playerId, username);
    currentPlayer = { playerId, username, balance: data.balance };

    // Show game
    joinModal.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    nameDisplay.innerHTML = `Playing as <strong>${username}</strong>`;
    updateBalanceDisplay(data.balance);

    // Init wheel
    wheel = new RouletteWheel(document.getElementById('roulette-wheel'));

    // Build table
    buildRouletteTable(tableEl, handleCellClick);

    // Start listeners
    startListeners();
  } catch (err) {
    console.error(err);
    joinError.textContent = 'Connection failed. Try again.';
    joinBtn.disabled = false;
    joinBtn.textContent = 'Take a Seat';
  }
});

// Allow Enter key to submit
[usernameInput, playerIdInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
});

// ─── Balance Display ─────────────────────────────────────────
function updateBalanceDisplay(balance) {
  currentPlayer.balance = balance;
  balanceDisplay.textContent = `$${balance.toLocaleString()}`;
  balanceDisplay.classList.add('changed');
  setTimeout(() => balanceDisplay.classList.remove('changed'), 500);
}

// ─── Chip Selector ───────────────────────────────────────────
document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedChip = parseInt(btn.dataset.value);
  });
});

document.getElementById('set-custom-btn').addEventListener('click', () => {
  const val = parseInt(document.getElementById('custom-amount').value);
  if (val > 0) {
    document.querySelectorAll('.chip').forEach(b => b.classList.remove('selected'));
    selectedChip = val;
    showToast(`Custom chip: $${val}`, 'info');
  }
});

// ─── Bet Placement ───────────────────────────────────────────
async function handleCellClick(betType, betValue, label) {
  if (bettingLocked) {
    showToast('Bets are locked!', 'lose');
    return;
  }
  if (selectedChip > currentPlayer.balance) {
    showToast('Not enough funds!', 'lose');
    return;
  }

  try {
    await placeBet(currentPlayer.playerId, currentPlayer.username, betType, betValue, selectedChip);
    showToast(`$${selectedChip} on ${label}`, 'info');
  } catch (err) {
    console.error('Bet failed:', err);
    showToast('Bet failed!', 'lose');
  }
}

// ─── Render bets lists ──────────────────────────────────────
function renderYourBets() {
  const mine = allBets.filter(b => b.playerId === currentPlayer.playerId);
  yourBetsList.innerHTML = '';
  let total = 0;
  mine.forEach(b => {
    total += b.amount;
    const el = document.createElement('div');
    el.className = 'bet-item';
    el.innerHTML = `
      <span class="bet-detail">${formatBetLabel(b)}</span>
      <span class="bet-amount">$${b.amount}</span>
    `;
    yourBetsList.append(el);
  });
  yourBetTotal.textContent = `Total: $${total.toLocaleString()}`;
}

function renderAllBets() {
  allBetsList.innerHTML = '';
  allBets.forEach(b => {
    const el = document.createElement('div');
    el.className = 'bet-item';
    el.innerHTML = `
      <span class="bet-player">${b.username}</span>
      <span class="bet-detail">${formatBetLabel(b)}</span>
      <span class="bet-amount">$${b.amount}</span>
    `;
    allBetsList.append(el);
  });
}

function formatBetLabel(bet) {
  switch (bet.betType) {
    case 'straight': return `#${bet.betValue}`;
    case 'red': return '◆ Red';
    case 'black': return '◆ Black';
    case 'odd': return 'Odd';
    case 'even': return 'Even';
    case 'low': return '1–18';
    case 'high': return '19–36';
    case 'dozen': return `${bet.betValue} 12`;
    case 'column': return `Col ${bet.betValue}`;
    default: return bet.betType;
  }
}

// ─── Game State Handler ──────────────────────────────────────
function handleGameState(state) {
  if (!state) return;

  // Update phase display
  const phaseText = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
  phaseDisplay.innerHTML = `<span class="game-phase phase-${state.phase}">${phaseText}</span>`;

  // Update history
  renderHistory(historyStrip, state.history);

  // Lock/unlock betting
  if (state.phase === 'betting') {
    bettingLocked = false;
    tableEl.querySelectorAll('.table-cell').forEach(c => c.classList.remove('locked'));
    resultBanner.classList.add('hidden');
    resultBanner.innerHTML = '';
    // Remove winner highlights
    tableEl.querySelectorAll('.winner-cell').forEach(c => c.classList.remove('winner-cell'));
  }

  if (state.phase === 'spinning' && state.winningNumber != null) {
    bettingLocked = true;
    tableEl.querySelectorAll('.table-cell').forEach(c => c.classList.add('locked'));

    // Only process this spin once
    if (lastProcessedRound !== state.roundId) {
      lastProcessedRound = state.roundId;
      runSpinAnimation(state.winningNumber);
    }
  }

  if (state.phase === 'result') {
    bettingLocked = true;
    tableEl.querySelectorAll('.table-cell').forEach(c => c.classList.add('locked'));
  }
}

// ─── Spin Animation & Payout ─────────────────────────────────
async function runSpinAnimation(winningNumber) {
  showToast('No more bets! Wheel is spinning...', 'info');

  await wheel.spin(winningNumber, 6000);

  // Show result banner
  const color = getNumberColor(winningNumber);
  resultBanner.classList.remove('hidden');

  // Calculate payout
  const totalReturn = calculateTotalPayout(allBets, currentPlayer.playerId, winningNumber);
  const myBetTotal = allBets
    .filter(b => b.playerId === currentPlayer.playerId)
    .reduce((s, b) => s + b.amount, 0);
  const profit = totalReturn - myBetTotal;

  let payoutHTML = '';
  if (myBetTotal === 0) {
    payoutHTML = `<div class="result-payout info">No bets placed</div>`;
  } else if (totalReturn > 0) {
    payoutHTML = `<div class="result-payout win">Won $${totalReturn.toLocaleString()}!</div>`;
    showToast(`🎉 You won $${totalReturn.toLocaleString()}!`, 'win');
  } else {
    payoutHTML = `<div class="result-payout lose">Lost $${myBetTotal.toLocaleString()}</div>`;
    showToast(`😔 Lost $${myBetTotal.toLocaleString()}`, 'lose');
  }

  resultBanner.innerHTML = `
    <div class="result-number ${color}-result">${winningNumber}</div>
    ${payoutHTML}
  `;

  // Highlight winner cell on table
  tableEl.querySelectorAll('.table-cell').forEach(cell => {
    if (cell.dataset.betType === 'straight' && cell.dataset.betValue === winningNumber) {
      cell.classList.add('winner-cell');
    }
  });

  // Credit winnings to player balance in Firebase
  if (totalReturn > 0) {
    try {
      await updateDoc(doc(db, 'players', currentPlayer.playerId), {
        balance: increment(totalReturn)
      });
    } catch (err) {
      console.error('Balance update failed:', err);
    }
  }
}

// ─── Firebase Listeners ──────────────────────────────────────
function startListeners() {
  // Player balance
  listenToPlayer(currentPlayer.playerId, (data) => {
    updateBalanceDisplay(data.balance);
  });

  // All bets
  listenToBets((bets) => {
    allBets = bets;
    renderYourBets();
    renderAllBets();
    renderChipsOnTable(tableEl, bets, currentPlayer.playerId);
  });

  // Game state
  listenToGameState(handleGameState);
}
