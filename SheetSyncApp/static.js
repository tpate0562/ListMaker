// Target URL
const scriptUrl = 'https://script.google.com/macros/s/AKfycbyg1ywdChhD_wR1UwCA-9Fbl3l8VjjUqXpSwXw-RGR61bamZopIe4GieRqelOk4fSkl/exec';

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

async function fetchAndRenderData() {
    try {
        const response = await fetch(scriptUrl);
        const data = await response.json();

        if (data.error) throw new Error(data.error);

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

    } catch (error) {
        console.error('Fetch error:', error);
        inventoryList.innerHTML = '<li class="empty-state" style="color: red;">Failed to load data.</li>';
        neededList.innerHTML = '<li class="empty-state" style="color: red;">Failed to load data.</li>';
    }
}

// Initial fetch
fetchAndRenderData();
