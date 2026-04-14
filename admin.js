// ============================================================
// admin.js — Admin page controller
// ============================================================

import {
  db, joinOrCreatePlayer, listenToPlayer, listenToAllPlayers,
  listenToBets, listenToGameState, initGameState, placeBet,
  calculateTotalPayout, clearAllBets, setGameState,
  updatePlayerBalance, buildRouletteTable, renderChipsOnTable,
  renderHistory, RouletteWheel, getNumberColor, ALL_NUMBERS
} from './shared.js';

import {
  doc, updateDoc, increment, getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ─── State ───────────────────────────────────────────────────
let currentPlayer = null;
let selectedChip = 25;
let allBets = [];
let wheel = null;
let lastProcessedRound = null;
let bettingLocked = false;
let currentGameState = null;

// ─── DOM refs ────────────────────────────────────────────────
const joinModal      = document.getElementById('join-modal');
const gameContainer  = document.getElementById('game-container');
const usernameInput  = document.getElementById('username-input');
const playerIdInput  = document.getElementById('playerid-input');
const joinBtn        = document.getElementById('join-btn');
const joinError      = document.getElementById('join-error');
const nameDisplay    = document.getElementById('player-name-display');
const balanceDisplay = document.getElementById('player-balance-display');
const tableEl        = document.getElementById('roulette-table');
const yourBetsList   = document.getElementById('your-bets-list');
const yourBetTotal   = document.getElementById('your-bet-total');
const allBetsList    = document.getElementById('all-bets-list');
const phaseDisplay   = document.getElementById('game-phase-display');
const historyStrip   = document.getElementById('history-strip');
const resultBanner   = document.getElementById('result-banner');
const toastContainer = document.getElementById('toast-container');
const spinBtn        = document.getElementById('spin-btn');
const newRoundBtn    = document.getElementById('new-round-btn');
const adminPlayersList = document.getElementById('admin-players-list');

// ─── Toast ───────────────────────────────────────────────────
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
  joinBtn.textContent = 'Connecting...';

  try {
    await initGameState();
    const data = await joinOrCreatePlayer(playerId, username);
    currentPlayer = { playerId, username, balance: data.balance };

    joinModal.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    nameDisplay.innerHTML = `Admin: <strong>${username}</strong>`;
    updateBalanceDisplay(data.balance);

    wheel = new RouletteWheel(document.getElementById('roulette-wheel'));
    buildRouletteTable(tableEl, handleCellClick);
    startListeners();
  } catch (err) {
    console.error(err);
    joinError.textContent = 'Connection failed. Try again.';
    joinBtn.disabled = false;
    joinBtn.textContent = 'Enter as Admin';
  }
});

[usernameInput, playerIdInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
});

// ─── Balance ─────────────────────────────────────────────────
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

// ─── Bet Placement (admin can also bet) ──────────────────────
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

// ─── Render Bets ─────────────────────────────────────────────
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

// ─── Admin: SPIN ─────────────────────────────────────────────
spinBtn.addEventListener('click', async () => {
  if (!currentGameState || currentGameState.phase !== 'betting') {
    showToast('Start a new round first!', 'lose');
    return;
  }

  // Generate random winning number
  const winningNumber = ALL_NUMBERS[Math.floor(Math.random() * ALL_NUMBERS.length)];

  // Update history
  const history = [...(currentGameState.history || []), winningNumber];

  spinBtn.disabled = true;

  try {
    await setGameState({
      phase: 'spinning',
      winningNumber,
      roundId: crypto.randomUUID(),
      history
    });
    showToast(`Wheel spinning! Ball landing on ${winningNumber}`, 'info');
  } catch (err) {
    console.error('Spin failed:', err);
    showToast('Spin failed!', 'lose');
    spinBtn.disabled = false;
  }
});

// ─── Admin: New Round ────────────────────────────────────────
newRoundBtn.addEventListener('click', async () => {
  try {
    await clearAllBets();
    await setGameState({
      phase: 'betting',
      winningNumber: null,
      roundId: crypto.randomUUID()
    });
    showToast('New round started!', 'info');
    spinBtn.disabled = false;
  } catch (err) {
    console.error('New round failed:', err);
    showToast('Failed to start new round!', 'lose');
  }
});

// ─── Admin: Player Balance Editor ────────────────────────────
function renderPlayersList(players) {
  adminPlayersList.innerHTML = '';
  players.forEach(p => {
    const item = document.createElement('div');
    item.className = 'admin-player-item';
    item.innerHTML = `
      <span class="apl-name" title="${p.playerId}">${p.username}</span>
      <input type="number" value="${p.balance}" data-pid="${p.playerId}">
      <button class="apl-save" data-pid="${p.playerId}">Set</button>
    `;
    // Save handler
    item.querySelector('.apl-save').addEventListener('click', async () => {
      const input = item.querySelector('input');
      const newBal = parseInt(input.value);
      if (isNaN(newBal) || newBal < 0) { showToast('Invalid amount', 'lose'); return; }
      try {
        await updatePlayerBalance(p.playerId, newBal);
        showToast(`${p.username} balance set to $${newBal}`, 'info');
      } catch (err) {
        console.error(err);
        showToast('Update failed', 'lose');
      }
    });
    adminPlayersList.append(item);
  });
}

// ─── Game State Handler ──────────────────────────────────────
function handleGameState(state) {
  if (!state) return;
  currentGameState = state;

  const phaseText = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
  phaseDisplay.innerHTML = `<span class="game-phase phase-${state.phase}">${phaseText}</span>`;

  renderHistory(historyStrip, state.history);

  // Lock/unlock
  if (state.phase === 'betting') {
    bettingLocked = false;
    tableEl.querySelectorAll('.table-cell').forEach(c => c.classList.remove('locked'));
    resultBanner.classList.add('hidden');
    resultBanner.innerHTML = '';
    tableEl.querySelectorAll('.winner-cell').forEach(c => c.classList.remove('winner-cell'));
    spinBtn.disabled = false;
  }

  if (state.phase === 'spinning' && state.winningNumber != null) {
    bettingLocked = true;
    tableEl.querySelectorAll('.table-cell').forEach(c => c.classList.add('locked'));
    spinBtn.disabled = true;

    if (lastProcessedRound !== state.roundId) {
      lastProcessedRound = state.roundId;
      runSpinAnimation(state.winningNumber);
    }
  }

  if (state.phase === 'result') {
    bettingLocked = true;
    tableEl.querySelectorAll('.table-cell').forEach(c => c.classList.add('locked'));
    spinBtn.disabled = true;
  }
}

// ─── Spin Animation & Payout ─────────────────────────────────
async function runSpinAnimation(winningNumber) {
  showToast('No more bets! Wheel is spinning...', 'info');
  await wheel.spin(winningNumber, 6000);

  const color = getNumberColor(winningNumber);
  resultBanner.classList.remove('hidden');

  const totalReturn = calculateTotalPayout(allBets, currentPlayer.playerId, winningNumber);
  const myBetTotal = allBets
    .filter(b => b.playerId === currentPlayer.playerId)
    .reduce((s, b) => s + b.amount, 0);

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

  tableEl.querySelectorAll('.table-cell').forEach(cell => {
    if (cell.dataset.betType === 'straight' && cell.dataset.betValue === winningNumber) {
      cell.classList.add('winner-cell');
    }
  });

  // Credit winnings
  if (totalReturn > 0) {
    try {
      await updateDoc(doc(db, 'players', currentPlayer.playerId), {
        balance: increment(totalReturn)
      });
    } catch (err) {
      console.error('Balance update failed:', err);
    }
  }

  // Auto-transition to result phase after animation
  try {
    await setGameState({ phase: 'result' });
  } catch (err) {
    console.error('Phase transition failed:', err);
  }
}

// ─── Firebase Listeners ──────────────────────────────────────
function startListeners() {
  listenToPlayer(currentPlayer.playerId, (data) => {
    updateBalanceDisplay(data.balance);
  });

  listenToBets((bets) => {
    allBets = bets;
    renderYourBets();
    renderAllBets();
    renderChipsOnTable(tableEl, bets, currentPlayer.playerId);
  });

  listenToGameState(handleGameState);

  listenToAllPlayers(renderPlayersList);
}
