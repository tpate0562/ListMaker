import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

// DOM Elements
const inventoryList = document.getElementById('inventoryList');
const neededList = document.getElementById('neededList');

// Helper to escape HTML and prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setupRealtimeListener() {
    onSnapshot(listDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            // Render Inventory (Only items with QTY > 0)
            let inventoryHTML = '';
            const inventoryItems = data.inventory || [];
            const activeInventory = inventoryItems.filter(item => item.qty > 0);

            if (activeInventory.length === 0) {
                inventoryHTML = '<li class="empty-state">No items currently in inventory.</li>';
            } else {
                activeInventory.forEach(item => {
                    inventoryHTML += `
                        <li class="list-item">
                            <span>${escapeHtml(item.name)}</span>
                            <strong>${item.qty}</strong>
                        </li>
                    `;
                });
            }
            inventoryList.innerHTML = inventoryHTML;

            // Render Needed Items (All needed items)
            let neededHTML = '';
            const neededItems = data.selected || [];
            
            if (neededItems.length === 0) {
                neededHTML = '<li class="empty-state">No items needed.</li>';
            } else {
                neededItems.forEach(item => {
                    // Handle backwards compatibility if needed items were stored as strings
                    const name = typeof item === 'string' ? item : item.name;
                    
                    neededHTML += `
                        <li class="list-item">
                            <span>${escapeHtml(name)}</span>
                        </li>
                    `;
                });
            }
            neededList.innerHTML = neededHTML;
        } else {
            inventoryList.innerHTML = '<li class="empty-state">No data found in Firebase.</li>';
            neededList.innerHTML = '<li class="empty-state">No data found in Firebase.</li>';
        }
    }, (error) => {
        console.error('Firestore error:', error);
        inventoryList.innerHTML = '<li class="empty-state" style="color: red;">Failed to load data.</li>';
        neededList.innerHTML = '<li class="empty-state" style="color: red;">Failed to load data.</li>';
    });
}

// Initial fetch
setupRealtimeListener();
