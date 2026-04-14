// ============================================================
// shared.js — Firebase, constants, wheel renderer, payouts
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, updateDoc,
  onSnapshot, addDoc, getDocs, writeBatch, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ─── Firebase Config ─────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCYc5K8UP2gLrWE_hLKXv2A7wBlGygxwGY",
  authDomain: "apple-spice-list-manager.firebaseapp.com",
  projectId: "apple-spice-list-manager",
  storageBucket: "apple-spice-list-manager.firebasestorage.app",
  messagingSenderId: "223352105923",
  appId: "1:223352105923:web:717c8b5b75b254187bab76",
  measurementId: "G-T7LCD6T5BQ"
};

const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);

// ─── Constants ───────────────────────────────────────────────
export const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
export const BLACK_NUMBERS = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

// American wheel order (clockwise)
export const WHEEL_ORDER = [
  '0','28','9','26','30','11','7','20','32','17','5','22','34','15','3','24',
  '36','13','1','00','27','10','25','29','12','8','19','31','18','6','21',
  '33','16','4','23','35','14','2'
];

export const ALL_NUMBERS = ['0','00',...Array.from({length:36},(_,i)=>(i+1).toString())];

// ─── Helpers ─────────────────────────────────────────────────
export function getNumberColor(num) {
  if (num === '0' || num === '00') return 'green';
  return RED_NUMBERS.includes(parseInt(num)) ? 'red' : 'black';
}

// ─── Player Management ──────────────────────────────────────
export async function joinOrCreatePlayer(playerId, username) {
  const ref = doc(db, 'players', playerId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { username });
    return snap.data();
  }
  const data = { playerId, username, balance: 1000 };
  await setDoc(ref, data);
  return data;
}

export function listenToPlayer(playerId, cb) {
  return onSnapshot(doc(db, 'players', playerId), s => { if (s.exists()) cb(s.data()); });
}

export function listenToAllPlayers(cb) {
  return onSnapshot(collection(db, 'players'), snap => {
    const players = [];
    snap.forEach(d => players.push({ id: d.id, ...d.data() }));
    cb(players);
  });
}

export async function updatePlayerBalance(playerId, newBalance) {
  await updateDoc(doc(db, 'players', playerId), { balance: newBalance });
}

// ─── Bet Management ──────────────────────────────────────────
export async function placeBet(playerId, username, betType, betValue, amount) {
  // Deduct balance atomically
  await updateDoc(doc(db, 'players', playerId), { balance: increment(-amount) });
  // Push bet
  await addDoc(collection(db, 'bets'), {
    playerId, username, betType, betValue, amount,
    timestamp: serverTimestamp()
  });
}

export function listenToBets(cb) {
  return onSnapshot(collection(db, 'bets'), snap => {
    const bets = [];
    snap.forEach(d => bets.push({ id: d.id, ...d.data() }));
    cb(bets);
  });
}

export async function clearAllBets() {
  const snap = await getDocs(collection(db, 'bets'));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// ─── Game State ──────────────────────────────────────────────
export function listenToGameState(cb) {
  return onSnapshot(doc(db, 'game', 'state'), s => cb(s.exists() ? s.data() : null));
}

export async function setGameState(state) {
  await setDoc(doc(db, 'game', 'state'), state, { merge: true });
}

export async function initGameState() {
  const ref = doc(db, 'game', 'state');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { phase: 'betting', winningNumber: null, roundId: crypto.randomUUID(), history: [] });
  }
}

// ─── Payout Calculator ──────────────────────────────────────
// Returns total amount received (including original stake) or 0
export function calculateBetPayout(bet, winningNumber) {
  const { betType, betValue, amount } = bet;
  const winInt = (winningNumber === '00') ? -1 : parseInt(winningNumber);

  switch (betType) {
    case 'straight':
      return betValue === winningNumber ? amount * 36 : 0;

    case 'red':
      return RED_NUMBERS.includes(winInt) ? amount * 2 : 0;

    case 'black':
      return (!RED_NUMBERS.includes(winInt) && winInt > 0) ? amount * 2 : 0;

    case 'odd':
      return (winInt > 0 && winInt % 2 === 1) ? amount * 2 : 0;

    case 'even':
      return (winInt > 0 && winInt % 2 === 0) ? amount * 2 : 0;

    case 'low':
      return (winInt >= 1 && winInt <= 18) ? amount * 2 : 0;

    case 'high':
      return (winInt >= 19 && winInt <= 36) ? amount * 2 : 0;

    case 'dozen':
      if (betValue === '1st' && winInt >= 1  && winInt <= 12) return amount * 3;
      if (betValue === '2nd' && winInt >= 13 && winInt <= 24) return amount * 3;
      if (betValue === '3rd' && winInt >= 25 && winInt <= 36) return amount * 3;
      return 0;

    case 'column':
      if (winInt <= 0) return 0;
      if (betValue === '1' && winInt % 3 === 1) return amount * 3;
      if (betValue === '2' && winInt % 3 === 2) return amount * 3;
      if (betValue === '3' && winInt % 3 === 0) return amount * 3;
      return 0;

    default: return 0;
  }
}

export function calculateTotalPayout(bets, playerId, winningNumber) {
  return bets
    .filter(b => b.playerId === playerId)
    .reduce((sum, b) => sum + calculateBetPayout(b, winningNumber), 0);
}

// ─── Roulette Wheel Renderer ─────────────────────────────────
export class RouletteWheel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.currentAngle = 0;
    this.spinning = false;
    this.dpr = window.devicePixelRatio || 1;
    this._setupHiDPI();
    this.draw();
  }

  _setupHiDPI() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.w = rect.width;
    this.h = rect.height;
  }

  draw() {
    const ctx = this.ctx;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const outerR = Math.min(cx, cy) - 4;

    ctx.clearRect(0, 0, this.w, this.h);

    // Outer decorative ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    const rimGrad = ctx.createRadialGradient(cx, cy, outerR - 18, cx, cy, outerR);
    rimGrad.addColorStop(0, '#8B6914');
    rimGrad.addColorStop(0.5, '#D4AF37');
    rimGrad.addColorStop(1, '#8B6914');
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.restore();

    const wheelR = outerR - 16;
    const segAngle = (Math.PI * 2) / 38;

    // Draw segments
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.currentAngle);

    for (let i = 0; i < 38; i++) {
      const startA = i * segAngle - Math.PI / 2;
      const endA = startA + segAngle;
      const num = WHEEL_ORDER[i];
      const color = getNumberColor(num);

      // Segment fill
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, wheelR, startA, endA);
      ctx.closePath();

      if (color === 'red') ctx.fillStyle = '#c0392b';
      else if (color === 'black') ctx.fillStyle = '#1a1a2e';
      else ctx.fillStyle = '#00864b';
      ctx.fill();

      // Segment border
      ctx.strokeStyle = '#D4AF3780';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Number label
      ctx.save();
      const midA = startA + segAngle / 2;
      ctx.rotate(midA);
      ctx.translate(wheelR * 0.82, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(10, wheelR * 0.065)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(num, 0, 0);
      ctx.restore();
    }

    // Inner ring
    const innerR = wheelR * 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR);
    innerGrad.addColorStop(0, '#2c1810');
    innerGrad.addColorStop(0.7, '#1a0f08');
    innerGrad.addColorStop(1, '#3e2723');
    ctx.fillStyle = innerGrad;
    ctx.fill();
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center hub
    ctx.beginPath();
    ctx.arc(0, 0, innerR * 0.35, 0, Math.PI * 2);
    const hubGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR * 0.35);
    hubGrad.addColorStop(0, '#D4AF37');
    hubGrad.addColorStop(1, '#8B6914');
    ctx.fillStyle = hubGrad;
    ctx.fill();

    // Spokes
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * innerR * 0.38, Math.sin(a) * innerR * 0.38);
      ctx.lineTo(Math.cos(a) * innerR * 0.95, Math.sin(a) * innerR * 0.95);
      ctx.strokeStyle = '#D4AF3780';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();

    // Pointer (fixed, top center)
    ctx.save();
    ctx.translate(cx, cy - outerR + 4);
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(-10, -6);
    ctx.lineTo(10, -6);
    ctx.closePath();
    ctx.fillStyle = '#D4AF37';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Spin to a specific winning number
  spin(winningNumber, duration = 6000) {
    if (this.spinning) return Promise.resolve();
    this.spinning = true;

    return new Promise(resolve => {
      const targetIndex = WHEEL_ORDER.indexOf(winningNumber);
      const segAngle = (Math.PI * 2) / 38;

      // Target angle: we want segment targetIndex to be at the top pointer
      // From the math: currentAngle / segAngle ≡ (38 - targetIndex) mod 38
      const targetSegPos = ((38 - targetIndex) % 38) * segAngle + segAngle / 2;
      const jitter = (Math.random() - 0.5) * segAngle * 0.5;
      const targetAngleMod = ((targetSegPos + jitter) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

      const currentMod = ((this.currentAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let delta = targetAngleMod - currentMod;
      if (delta < 0) delta += Math.PI * 2;

      const fullRotations = (Math.floor(Math.random() * 3) + 6) * Math.PI * 2;
      const totalDelta = delta + fullRotations;
      const startAngle = this.currentAngle;
      const startTime = performance.now();

      const animate = (time) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out quart for natural deceleration
        const eased = 1 - Math.pow(1 - progress, 4);
        this.currentAngle = startAngle + totalDelta * eased;
        this.draw();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.spinning = false;
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }
}

// ─── Table Builder ───────────────────────────────────────────
export function buildRouletteTable(container, onCellClick) {
  container.innerHTML = '';

  function makeCell(label, betType, betValue, colorClass, extraClass = '') {
    const cell = document.createElement('div');
    cell.className = `table-cell ${colorClass} ${extraClass}`.trim();
    cell.dataset.betType = betType;
    cell.dataset.betValue = betValue;
    cell.innerHTML = `<span class="cell-label">${label}</span><span class="cell-chips"></span>`;
    cell.addEventListener('click', () => onCellClick(betType, betValue, label));
    return cell;
  }

  // Row 1: 0 and 00
  const zeroCell = makeCell('0', 'straight', '0', 'green-cell', 'zero-cell');
  zeroCell.style.gridColumn = '1 / 8';
  const dblZeroCell = makeCell('00', 'straight', '00', 'green-cell', 'zero-cell');
  dblZeroCell.style.gridColumn = '8 / 14';
  container.append(zeroCell, dblZeroCell);

  // Number rows (top row = 3,6,9...; bottom row = 1,4,7...)
  const numberRows = [
    [3,6,9,12,15,18,21,24,27,30,33,36],   // column 3
    [2,5,8,11,14,17,20,23,26,29,32,35],   // column 2
    [1,4,7,10,13,16,19,22,25,28,31,34]    // column 1
  ];

  const colValues = ['3','2','1']; // column bet values for each row

  numberRows.forEach((row, ri) => {
    row.forEach(num => {
      const s = num.toString();
      container.append(makeCell(s, 'straight', s, `${getNumberColor(s)}-cell`, 'number-cell'));
    });
    // 2:1 column bet
    container.append(makeCell('2:1', 'column', colValues[ri], 'col-cell', 'col-bet-cell'));
  });

  // Dozens row
  const dozenData = [
    { label: '1st 12', value: '1st', span: '1 / 5' },
    { label: '2nd 12', value: '2nd', span: '5 / 9' },
    { label: '3rd 12', value: '3rd', span: '9 / 14' },
  ];
  dozenData.forEach(d => {
    const cell = makeCell(d.label, 'dozen', d.value, 'outside-cell', 'dozen-cell');
    cell.style.gridColumn = d.span;
    container.append(cell);
  });

  // Outside bets row
  const outsideData = [
    { label: '1–18',  betType: 'low',   betValue: 'low',   span: '1 / 3' },
    { label: 'EVEN',  betType: 'even',  betValue: 'even',  span: '3 / 5' },
    { label: '◆ RED', betType: 'red',   betValue: 'red',   span: '5 / 8',  extra: 'red-outside' },
    { label: '◆ BLK', betType: 'black', betValue: 'black', span: '8 / 11', extra: 'black-outside' },
    { label: 'ODD',   betType: 'odd',   betValue: 'odd',   span: '11 / 13' },
    { label: '19–36', betType: 'high',  betValue: 'high',  span: '13 / 14' },
  ];
  outsideData.forEach(d => {
    const cell = makeCell(d.label, d.betType, d.betValue, `outside-cell ${d.extra || ''}`, 'outside-bet-cell');
    cell.style.gridColumn = d.span;
    container.append(cell);
  });
}

// ─── Update chips displayed on table cells ───────────────────
export function renderChipsOnTable(container, bets, currentPlayerId) {
  // Clear existing chip indicators
  container.querySelectorAll('.cell-chips').forEach(el => { el.textContent = ''; el.classList.remove('has-chip'); });

  // Aggregate bets by cell
  const cellTotals = {};    // key: `${betType}:${betValue}`
  const myTotals = {};
  bets.forEach(b => {
    const key = `${b.betType}:${b.betValue}`;
    cellTotals[key] = (cellTotals[key] || 0) + b.amount;
    if (b.playerId === currentPlayerId) {
      myTotals[key] = (myTotals[key] || 0) + b.amount;
    }
  });

  container.querySelectorAll('.table-cell').forEach(cell => {
    const key = `${cell.dataset.betType}:${cell.dataset.betValue}`;
    const total = cellTotals[key];
    if (total) {
      const chipEl = cell.querySelector('.cell-chips');
      const myAmt = myTotals[key] || 0;
      chipEl.textContent = `$${total}`;
      chipEl.classList.add('has-chip');
      if (myAmt > 0) chipEl.classList.add('my-chip');
      else chipEl.classList.remove('my-chip');
    }
  });
}

// ─── History display ─────────────────────────────────────────
export function renderHistory(container, history) {
  container.innerHTML = '';
  (history || []).slice(-15).reverse().forEach(num => {
    const dot = document.createElement('span');
    dot.className = `history-dot ${getNumberColor(num)}-dot`;
    dot.textContent = num;
    container.append(dot);
  });
}
