import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYc5K8UP2gLrWE_hLKXv2A7wBlGygxwGY",
  authDomain: "apple-spice-list-manager.firebaseapp.com",
  projectId: "apple-spice-list-manager",
  storageBucket: "apple-spice-list-manager.firebasestorage.app",
  messagingSenderId: "223352105923",
  appId: "1:223352105923:web:717c8b5b75b254187bab76",
  measurementId: "G-T7LCD6T5BQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const listDocRef = doc(db, 'lists', 'main');

document.addEventListener('DOMContentLoaded', () => {
    const adminInventoryList = document.getElementById('adminInventoryList');
    const adminAvailableList = document.getElementById('adminAvailableList');
    
    const newInventoryInput = document.getElementById('newInventoryInput');
    const addInventoryBtn = document.getElementById('addInventoryBtn');
    
    const newAvailableInput = document.getElementById('newAvailableInput');
    const addAvailableBtn = document.getElementById('addAvailableBtn');
    
    const jsonEditor = document.getElementById('jsonEditor');
    const saveJsonBtn = document.getElementById('saveJsonBtn');

    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    let state = {
        inventory: [],
        available: [],
        selected: []
    };

    let isEditingJson = false;

    // --- Toast Helper ---
    let toastTimeout;
    function showToast(message, type = 'info') {
        clearTimeout(toastTimeout);
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        
        const icon = toast.querySelector('i');
        if (type === 'success') icon.className = 'ph-fill ph-check-circle';
        else if (type === 'error') icon.className = 'ph-fill ph-warning-circle';
        else icon.className = 'ph-fill ph-info';

        toast.classList.remove('hidden');
        toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // --- Render Lists ---
    function escapeHtml(unsafe) {
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function renderAdminLists() {
        // Render Inventory
        adminInventoryList.innerHTML = '';
        if (state.inventory.length === 0) {
            adminInventoryList.innerHTML = '<li><span class="empty-state">No items in inventory.</span></li>';
        } else {
            state.inventory.forEach((itemObj, index) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${escapeHtml(itemObj.name)} <small>(Qty: ${itemObj.qty})</small></span>
                    <i class="ph ph-trash action-icon delete-btn" style="color: var(--danger); cursor: pointer;" title="Remove Item"></i>
                `;
                li.querySelector('.delete-btn').addEventListener('click', () => {
                    if(confirm(`Remove "${itemObj.name}" from Grab & Go?`)) {
                        state.inventory.splice(index, 1);
                        syncToSheet();
                    }
                });
                adminInventoryList.appendChild(li);
            });
        }

        // Render Available
        adminAvailableList.innerHTML = '';
        if (state.available.length === 0) {
            adminAvailableList.innerHTML = '<li><span class="empty-state">No available items.</span></li>';
        } else {
            state.available.forEach((itemString, index) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${escapeHtml(itemString)}</span>
                    <i class="ph ph-trash action-icon delete-btn" style="color: var(--danger); cursor: pointer;" title="Remove Item"></i>
                `;
                li.querySelector('.delete-btn').addEventListener('click', () => {
                    if(confirm(`Remove "${itemString}" from Items Not Needed?`)) {
                        state.available.splice(index, 1);
                        syncToSheet();
                    }
                });
                adminAvailableList.appendChild(li);
            });
        }
        
        // Update JSON editor if it is not actively being typed in
        if (!isEditingJson && document.activeElement !== jsonEditor) {
            jsonEditor.value = JSON.stringify(state, null, 4);
        }
    }

    // --- Interactions ---
    addInventoryBtn.addEventListener('click', () => {
        const val = newInventoryInput.value.trim();
        if (val) {
            if (!state.inventory.some(i => i.name === val)) {
                state.inventory.push({ name: val, qty: 0 });
                newInventoryInput.value = '';
                syncToSheet();
            } else {
                showToast('Item already exists in Grab & Go!', 'error');
            }
        }
    });

    newInventoryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addInventoryBtn.click();
    });

    addAvailableBtn.addEventListener('click', () => {
        const val = newAvailableInput.value.trim();
        if (val) {
            if (!state.available.includes(val)) {
                state.available.push(val);
                newAvailableInput.value = '';
                syncToSheet();
            } else {
                showToast('Item already exists in Items Not Needed!', 'error');
            }
        }
    });

    newAvailableInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addAvailableBtn.click();
    });

    // Handle JSON Editor changes manually
    jsonEditor.addEventListener('focus', () => isEditingJson = true);
    jsonEditor.addEventListener('blur', () => isEditingJson = false);

    saveJsonBtn.addEventListener('click', () => {
        try {
            const parsed = JSON.parse(jsonEditor.value);
            // Basic validation
            if (!Array.isArray(parsed.inventory) || !Array.isArray(parsed.available) || !Array.isArray(parsed.selected)) {
                throw new Error("Invalid structure: inventory, available, and selected must be arrays.");
            }
            state = parsed;
            syncToSheet(true);
        } catch (error) {
            showToast('Invalid JSON: ' + error.message, 'error');
        }
    });

    // --- Firebase Sync ---
    onSnapshot(listDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.available = data.available || [];
            state.inventory = (data.inventory || []).map(invObj => {
                return { name: invObj.name, qty: invObj.qty || 0 };
            });
            state.selected = (data.selected || []).map(selObj => {
                if (typeof selObj === 'string') return { name: selObj, qty: 1 };
                return { name: selObj.name, qty: selObj.qty || 1 };
            });
            renderAdminLists();
        } else {
            showToast('No database document found. Syncing empty state.', 'error');
            syncToSheet();
        }
    }, (error) => {
        console.error('Firestore subscription error:', error);
        showToast('Failed to connect to Firebase', 'error');
    });

    async function syncToSheet(showSuccessToast = false) {
        try {
            await setDoc(listDocRef, {
                inventory: state.inventory,
                available: state.available,
                selected: state.selected
            });
            if(showSuccessToast) showToast('Saved to Database!', 'success');
        } catch (error) {
            console.error('Firestore save error:', error);
            showToast('Failed to save to Firebase', 'error');
        }
    }
});
