document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const availableList = document.getElementById('availableList');
    const selectedList = document.getElementById('selectedList');
    const availableCount = document.getElementById('availableCount');
    const selectedCount = document.getElementById('selectedCount');

    const newItemInput = document.getElementById('newItemInput');
    const addItemBtn = document.getElementById('addItemBtn');
    const syncBtn = document.getElementById('syncBtn');
    const searchInput = document.getElementById('searchInput');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    // --- State ---
    let state = {
        available: [],
        selected: [],
        searchQuery: ""
    };
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbyg1ywdChhD_wR1UwCA-9Fbl3l8VjjUqXpSwXw-RGR61bamZopIe4GieRqelOk4fSkl/exec';

    // --- Initialization ---
    fetchFromSheet(false);
    renderLists();

    // Start auto-sync every 10 seconds (Push only)
    setInterval(() => {
        syncToSheet(true);
    }, 10000);

    // --- Event Listeners ---

    // Add new item
    const handleAddItem = () => {
        const val = newItemInput.value.trim();
        if (val) {
            state.available.push(val);
            newItemInput.value = '';
            renderLists();
        }
    };
    addItemBtn.addEventListener('click', handleAddItem);
    newItemInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddItem();
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        renderLists();
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        renderLists();
    });

    syncBtn.addEventListener('click', () => syncToSheet(false));

    // --- Core Functions ---

    // --- Drag and Drop State ---
    let draggedItemIndex = null;

    function renderLists() {
        // Clear DOM
        availableList.innerHTML = '';
        selectedList.innerHTML = '';

        // Render Available
        const filteredAvailable = state.available.filter(item =>
            item.toLowerCase().includes(state.searchQuery)
        );

        if (filteredAvailable.length === 0) {
            if (state.available.length === 0) {
                availableList.innerHTML = '<li class="empty-state">No items available. Add one below!</li>';
            } else {
                availableList.innerHTML = '<li class="empty-state">No items match your search.</li>';
            }
        } else {
            filteredAvailable.forEach((item) => {
                const originalIndex = state.available.indexOf(item);
                const li = document.createElement('li');
                li.className = 'list-item';
                li.innerHTML = `
                    <span class="item-text">${escapeHtml(item)}</span>
                    <i class="ph ph-arrow-right action-icon"></i>
                `;
                li.querySelector('.action-icon').addEventListener('click', () => moveItem(originalIndex, 'available', 'selected'));
                availableList.appendChild(li);
            });
        }

        // Render Selected
        if (state.selected.length === 0) {
            selectedList.innerHTML = '<li class="empty-state">No items selected.</li>';
        } else {
            state.selected.forEach((item, index) => {
                const li = document.createElement('li');
                li.className = 'list-item';
                li.setAttribute('draggable', 'true');
                li.dataset.index = index;
                li.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <i class="ph ph-dots-six-vertical drag-handle" style="cursor: grab; opacity: 0.5;"></i>
                        <span class="item-text">${escapeHtml(item)}</span>
                    </div>
                    <i class="ph ph-arrow-left action-icon"></i>
                `;

                // Click to move
                li.querySelector('.action-icon').addEventListener('click', () => moveItem(index, 'selected', 'available'));

                // Drag and Drop events
                li.addEventListener('dragstart', handleDragStart);
                li.addEventListener('dragover', handleDragOver);
                li.addEventListener('dragleave', handleDragLeave);
                li.addEventListener('drop', handleDrop);
                li.addEventListener('dragend', handleDragEnd);

                selectedList.appendChild(li);
            });
        }

        // Update counts
        availableCount.textContent = state.available.length;
        selectedCount.textContent = state.selected.length;
    }

    // --- Drag and Drop Handlers ---

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
            renderLists();

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

    function moveItem(index, fromList, toList) {
        const item = state[fromList].splice(index, 1)[0];
        state[toList].push(item);
        renderLists();
    }

    // --- API Interactions ---

    async function fetchFromSheet(isAutoFetch = false) {
        if (!isAutoFetch) {
            syncBtn.classList.add('loading'); // Just showing loader somewhere since fetchBtn is gone
            syncBtn.disabled = true;
        }

        try {
            // The JSONP strategy is sometimes needed to avoid CORS issues entirely if redirect happens,
            // but for doGet returning JSON with a proper MimeType and execution as "Anyone", fetch works.
            const response = await fetch(scriptUrl);
            const data = await response.json();

            if (data.error) throw new Error(data.error);

            if (data.available || data.selected) {
                state.available = data.available || [];
                state.selected = data.selected || [];
                renderLists();

                if (!isAutoFetch) {
                    showToast('Data loaded from sheet!', 'success');
                }
            }
        } catch (error) {
            console.error('Fetch error:', error);
            if (!isAutoFetch) {
                showToast('Failed to load data. Check URL and permissions.', 'error');
            }
        } finally {
            if (!isAutoFetch) {
                syncBtn.classList.remove('loading');
                syncBtn.disabled = false;
            }
        }
    }

    async function syncToSheet(isAutoSync = false) {
        const icon = syncBtn.querySelector('i');
        if (!isAutoSync) {
            syncBtn.classList.add('loading');
            icon.className = 'ph ph-spinner';
            syncBtn.disabled = true;
        }

        const payload = {
            available: state.available,
            selected: state.selected
        };

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
        } finally {
            if (!isAutoSync) {
                syncBtn.classList.remove('loading');
                icon.className = 'ph ph-arrows-clockwise';
                syncBtn.disabled = false;
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
