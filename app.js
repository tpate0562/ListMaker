document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const inventoryList = document.getElementById('inventoryList');
    const allList = document.getElementById('availableList'); // Kept ID same in HTML for simplicity right now
    const selectedList = document.getElementById('selectedList');
    const inventoryCount = document.getElementById('inventoryCount');
    const allCount = document.getElementById('availableCount');
    const selectedCount = document.getElementById('selectedCount');




    const searchInput = document.getElementById('searchInput');
    const allSearchInput = document.getElementById('availableSearchInput');
    const neededSearchInput = document.getElementById('neededSearchInput');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    // --- State ---
    let state = {
        available: [], // Array of global item names (strings) - keep internal logic 'available'
        inventory: [], // Array of objects matching global indices: [{name: "Apples", qty: 0}, ...]
        selected: [],  // Array of needed items: [{name: "Apples", qty: 1}, ...]
        searchQuery: {
            inventory: "",
            all: "",
            needed: ""
        }
    };
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbyg1ywdChhD_wR1UwCA-9Fbl3l8VjjUqXpSwXw-RGR61bamZopIe4GieRqelOk4fSkl/exec';
    let lastPushTime = 0; // Tracks when we last pushed, to avoid fetch overwriting local changes

    // --- Initialization ---
    fetchFromSheet(false);
    renderLists();

    // Auto-pull from sheet every 5 seconds to stay in sync
    setInterval(() => {
        // Skip fetch if we pushed recently (give sheet time to update)
        if (Date.now() - lastPushTime < 8000) return;
        fetchFromSheet(true);
    }, 5000);

    // --- Event Listeners ---

    // Custom Quantity Prompt (for numeric keyboard)
    const qtyPromptModal = document.getElementById('qtyPromptModal');
    const qtyPromptMessage = document.getElementById('qtyPromptMessage');
    const qtyPromptInput = document.getElementById('qtyPromptInput');
    const qtyPromptCancel = document.getElementById('qtyPromptCancel');
    const qtyPromptSubmit = document.getElementById('qtyPromptSubmit');

    function showQuantityPrompt(message, defaultValue = '') {
        return new Promise((resolve) => {
            qtyPromptMessage.textContent = message;
            qtyPromptInput.value = defaultValue;
            qtyPromptModal.classList.remove('hidden');
            qtyPromptModal.classList.add('active');
            qtyPromptInput.focus();
            
            // Auto-select the text for easy rapid overwriting
            setTimeout(() => qtyPromptInput.select(), 50);

            const cleanup = () => {
                qtyPromptModal.classList.remove('active');
                setTimeout(() => qtyPromptModal.classList.add('hidden'), 300);
                qtyPromptSubmit.removeEventListener('click', handleSubmit);
                qtyPromptCancel.removeEventListener('click', handleCancel);
                qtyPromptInput.removeEventListener('keypress', handleEnter);
            };

            const handleSubmit = () => {
                cleanup();
                resolve(qtyPromptInput.value);
            };

            const handleCancel = () => {
                cleanup();
                resolve(null);
            };

            const handleEnter = (e) => {
                if (e.key === 'Enter') handleSubmit();
            };

            qtyPromptSubmit.addEventListener('click', handleSubmit);
            qtyPromptCancel.addEventListener('click', handleCancel);
            qtyPromptInput.addEventListener('keypress', handleEnter);
        });
    }

    // Add to All Items
    const handleAddAllItem = (inputElem) => {
        const val = inputElem.value.trim();
        if (val && !state.available.includes(val)) {
            const pin = prompt('Enter PIN to add custom item:');
            if (pin !== '949521' && pin !== '928461') {
                showToast('Incorrect PIN', 'error');
                return;
            }
            state.available.push(val);
            inputElem.value = '';
            renderLists(['available']);
            syncToSheet(true);
        } else if (state.available.includes(val)) {
            showToast('Item already exists in All Items!', 'error');
        }
    };

    // All Items column add events
    const newAllItemInput = document.getElementById('newAvailableItemInput');
    const addAllItemBtn = document.getElementById('addAvailableItemBtn');
    if (addAllItemBtn && newAllItemInput) {
        addAllItemBtn.addEventListener('click', () => handleAddAllItem(newAllItemInput));
        newAllItemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAddAllItem(newAllItemInput);
        });
    }

    // Search input (Inventory)
    searchInput.addEventListener('input', (e) => {
        state.searchQuery.inventory = e.target.value.toLowerCase();
        renderLists(['inventory']);
    });

    // Search input (All Items)
    allSearchInput.addEventListener('input', (e) => {
        state.searchQuery.all = e.target.value.toLowerCase();
        renderLists(['available']);
    });

    // Search input (Needed Items)
    neededSearchInput.addEventListener('input', (e) => {
        state.searchQuery.needed = e.target.value.toLowerCase();
        renderLists(['selected']);
    });



    // --- Core Functions ---

    // --- Drag and Drop State ---
    let draggedItemIndex = null;

    function renderLists(columnsToRender = ['inventory', 'available', 'selected']) {
        // Clear DOM conditionally
        if (columnsToRender.includes('inventory')) inventoryList.innerHTML = '';
        if (columnsToRender.includes('available')) allList.innerHTML = '';
        if (columnsToRender.includes('selected')) selectedList.innerHTML = '';

        // --- Render Inventory (Left panel) ---
        if (columnsToRender.includes('inventory')) {
            const filteredInventory = state.inventory.filter(itemObj =>
                itemObj.name.toLowerCase().includes(state.searchQuery.inventory)
            );

            if (filteredInventory.length === 0) {
                if (state.inventory.length === 0) {
                    inventoryList.innerHTML = '<li class="empty-state">No items in inventory. Add one below!</li>';
                } else {
                    inventoryList.innerHTML = '<li class="empty-state">No items match your search.</li>';
                }
            } else {
                filteredInventory.forEach((itemObj) => {
                    const originalIndex = state.inventory.indexOf(itemObj); // Keep original index based on inventory array

                    const li = document.createElement('li');
                    li.className = 'list-item';

                    li.innerHTML = `
                        <div class="item-name-group">
                            <span class="item-text">${escapeHtml(itemObj.name)}</span>
                        </div>
                        <div class="item-controls" style="display: flex; align-items: center; gap: 1rem;">
                            <span class="qty-badge" data-index="${originalIndex}" title="Tap to edit quantity">${itemObj.qty}</span>
                        </div>
                    `;

                    // Tap to edit quantity via prompt
                    const qtyBadge = li.querySelector('.qty-badge');
                    qtyBadge.addEventListener('click', async () => {
                        const newVal = await showQuantityPrompt(`Qty for "${itemObj.name}":`, String(itemObj.qty));
                        if (newVal !== null) {
                            const newQty = parseInt(newVal) || 0;
                            state.inventory[originalIndex].qty = newQty;
                            qtyBadge.textContent = newQty;
                            syncToSheet(true);
                        }
                    });

                    inventoryList.appendChild(li);
                });
            }
        }

        // --- Render All Items (Middle panel) ---
        if (columnsToRender.includes('available')) {
            // Exclude items that are currently in the Selected (Needed) list so they naturally "move"
            const filteredAll = state.available.filter(item => {
                const matchesSearch = item.toLowerCase().includes(state.searchQuery.all);
                const isSelected = state.selected.some(sel => sel.name === item);
                return matchesSearch && !isSelected; // Hide from All Items if it's already Needed
            });

            if (state.available.length === 0) {
                allList.innerHTML = '<li class="empty-state">No items available. Add to inventory!</li>';
            } else if (filteredAll.length === 0) {
                if (state.available.length === state.selected.length) {
                    allList.innerHTML = '<li class="empty-state">All items are currently needed!</li>';
                } else {
                    allList.innerHTML = '<li class="empty-state">No items match your search.</li>';
                }
            } else {
                filteredAll.forEach((itemString) => {
                    const li = document.createElement('li');
                    li.className = 'list-item';

                    // Action controls container
                    const btnConfig = `
                        <div class="item-controls" style="display: flex; align-items: center; gap: 0.25rem;">
                            <i class="ph ph-pencil-simple action-icon edit-btn" style="color: var(--text-secondary);" title="Edit Item"></i>
                            <i class="ph ph-trash action-icon delete-btn" style="color: var(--danger);" title="Remove Item"></i>
                            <span class="action-text-btn move-btn" title="Add to Needed">Add</span>
                        </div>
                    `;

                    li.innerHTML = `
                        <span class="item-text">${escapeHtml(itemString)}</span>
                        ${btnConfig}
                    `;

                    // Event listeners
                    li.querySelector('.move-btn').addEventListener('click', () => moveToSelected(itemString));
                    li.querySelector('.edit-btn').addEventListener('click', () => handleEditAllItem(itemString));
                    li.querySelector('.delete-btn').addEventListener('click', () => handleDeleteAllItem(itemString));

                    allList.appendChild(li);
                });
            }
        }

        // --- Render Selected / Needed (Right panel) ---
        if (columnsToRender.includes('selected')) {
            const filteredNeeded = state.selected.filter(selObj =>
                selObj.name.toLowerCase().includes(state.searchQuery.needed)
            );

            if (state.selected.length === 0) {
                selectedList.innerHTML = '<li class="empty-state">No items needed.</li>';
            } else if (filteredNeeded.length === 0) {
                selectedList.innerHTML = '<li class="empty-state">No items match your search.</li>';
            } else {
                filteredNeeded.forEach((selItemObj) => {
                    const originalIndex = state.selected.indexOf(selItemObj); // Get original index for correct operations

                    const li = document.createElement('li');
                    li.className = 'list-item';
                    li.setAttribute('draggable', 'true');
                    li.dataset.index = originalIndex;
                    li.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i class="ph ph-dots-six-vertical drag-handle" style="cursor: grab; opacity: 0.5;"></i>
                            <span class="item-text">${escapeHtml(selItemObj.name)}</span>
                        </div>
                        <div class="item-controls" style="display: flex; align-items: center; gap: 1rem;">
                            <span class="action-text-btn remove-btn" title="Move back to All Items">Remove</span>
                        </div>
                    `;

                    // Click to remove from Needed and move back to All Items
                    li.querySelector('.remove-btn').addEventListener('click', () => removeFromSelected(originalIndex));

                    // Drag and Drop events
                    li.addEventListener('dragstart', handleDragStart);
                    li.addEventListener('dragover', handleDragOver);
                    li.addEventListener('dragleave', handleDragLeave);
                    li.addEventListener('drop', handleDrop);
                    li.addEventListener('dragend', handleDragEnd);

                    selectedList.appendChild(li);
                });
            }
        }

        // Update counts conditionally or globally (global is cheap since it's just textContent)
        inventoryCount.textContent = state.inventory.length;
        const remainingAll = state.available.length - state.selected.length;
        allCount.textContent = remainingAll > 0 ? remainingAll : 0;
        selectedCount.textContent = state.selected.length;
    }

    // --- Actions ---

    function handleEditAllItem(oldName) {
        const pin = prompt('Enter PIN to modify this item:');
        if (pin !== '949521' && pin !== '928461') {
            showToast('Incorrect PIN', 'error');
            return;
        }

        const newName = prompt('Edit item name:', oldName);
        if (newName && newName.trim() !== '' && newName !== oldName) {
            const index = state.available.indexOf(oldName);
            if (index > -1) {
                state.available[index] = newName.trim();
                renderLists(['available']);
                syncToSheet(true);
            }
        }
    }

    function handleDeleteAllItem(itemName) {
        const pin = prompt('Enter PIN to modify this item:');
        if (pin !== '949521' && pin !== '928461') {
            showToast('Incorrect PIN', 'error');
            return;
        }

        // Using standard confirm here since it doesn't need an alphanumeric input
        if (confirm(`Are you sure you want to permanently delete "${itemName}" from All Items?`)) {
            const index = state.available.indexOf(itemName);
            if (index > -1) {
                state.available.splice(index, 1);
                renderLists(['available']);
                syncToSheet(true);
            }
        }
    }

    function moveToSelected(itemName) {
        if (!state.selected.some(sel => sel.name === itemName)) {
            state.selected.push({ name: itemName, qty: 1 }); // Default needed qty is 1
            renderLists(['available', 'selected']);
            syncToSheet(true);
        }
    }

    function removeFromSelected(selectedIndex) {
        state.selected.splice(selectedIndex, 1);
        renderLists(['available', 'selected']);
        syncToSheet(true);
    }

    function handleDragStart(e) {
        draggedItemIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Required for Firefox
        e.dataTransfer.setData('text/plain', this.dataset.index);
    }

    function handleDragOver(e) {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.stopPropagation();
        this.classList.remove('drag-over');

        const dropIndex = parseInt(this.dataset.index);

        if (draggedItemIndex !== null && draggedItemIndex !== dropIndex) {
            // Reorder array
            const item = state.selected.splice(draggedItemIndex, 1)[0];
            state.selected.splice(dropIndex, 0, item);
            renderLists(['selected']);

            // Auto sync on reorder
            syncToSheet(true);
        }
        return false;
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        const items = selectedList.querySelectorAll('.list-item');
        items.forEach(item => item.classList.remove('drag-over'));
        draggedItemIndex = null;
    }



    // --- API Interactions ---

    async function fetchFromSheet(isAutoFetch = false) {
        try {
            const response = await fetch(scriptUrl);
            const data = await response.json();

            if (data.error) throw new Error(data.error);

            // Discard stale responses that arrive during the push cooldown
            if (isAutoFetch && Date.now() - lastPushTime < 8000) return;

            if (data.available || data.inventory || data.selected) {
                const newAvailable = data.available || [];
                const newInventory = (data.inventory || []).map(invObj => {
                    return { name: invObj.name, qty: invObj.qty || 0 };
                });
                const newSelected = (data.selected || []).map(selObj => {
                    if (typeof selObj === 'string') return { name: selObj, qty: 1 };
                    return { name: selObj.name, qty: selObj.qty || 1 };
                });

                // Only re-render if data actually changed
                const hasChanged = JSON.stringify(newAvailable) !== JSON.stringify(state.available) ||
                    JSON.stringify(newInventory) !== JSON.stringify(state.inventory) ||
                    JSON.stringify(newSelected) !== JSON.stringify(state.selected);

                state.available = newAvailable;
                state.inventory = newInventory;
                state.selected = newSelected;

                if (!isAutoFetch || hasChanged) {
                    renderLists();
                }

                if (!isAutoFetch) {
                    showToast('Data loaded successfully!', 'success');
                }
            }
        } catch (error) {
            console.error('Fetch error:', error);
            if (!isAutoFetch) {
                showToast('Failed to load data. Check URL and permissions.', 'error');
            }
        }
    }

    async function syncToSheet(isAutoSync = false) {
        const payload = {
            available: state.available,
            inventory: state.inventory,
            selected: state.selected
        };

        lastPushTime = Date.now();

        try {
            // Using no-cors because Apps Script doPost sends a 302 redirect.
            // In no-cors mode, the browser transparently follows the redirect, 
            // but the response acts as 'opaque' so we can't read the response body.
            // We assume success if fetch completes without throwing a network error.
            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain', // MimeType must be text/plain for no-cors cross-origin
                },
                body: JSON.stringify(payload)
            });

            if (!isAutoSync) {
                showToast('Successfully synced to Sheet!', 'success');
            }
        } catch (error) {
            console.error('Sync error:', error);
            if (!isAutoSync) {
                showToast('Failed to sync. Network error.', 'error');
            }
        }
    }

    // --- Helpers ---

    let toastTimeout;
    function showToast(message, type = 'info') {
        clearTimeout(toastTimeout);

        toastMessage.textContent = message;
        toast.className = `toast ${type}`;

        // Update icon based on type
        const icon = toast.querySelector('i');
        if (type === 'success') icon.className = 'ph-fill ph-check-circle';
        else if (type === 'error') icon.className = 'ph-fill ph-warning-circle';
        else icon.className = 'ph-fill ph-info';

        // Show toast
        toast.classList.remove('hidden');

        // Hide after 3s
        toastTimeout = setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
