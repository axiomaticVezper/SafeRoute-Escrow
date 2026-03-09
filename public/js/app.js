/* ================================================
   EscrowChain — Frontend Application
   Smart Contract Escrow Payment System
   ================================================ */

// ---- STATE ----
let authToken = null;
let currentUser = null;
let orders = [];
let currentView = 'dashboard';

// ---- API CLIENT ----
const API = {
  base: '/api',

  async request(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(`${this.base}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // Auth
  login: (username, password) => API.request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getProfile: () => API.request('/auth/me'),

  // Orders
  getOrders: () => API.request('/orders'),
  getOrder: (id) => API.request(`/orders/${id}`),
  getDrivers: () => API.request('/orders/drivers'),
  createOrder: (data) => API.request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  payOrder: (id) => API.request(`/orders/${id}/pay`, { method: 'POST' }),
  assignDriver: (id, driverId) => API.request(`/orders/${id}/assign`, { method: 'POST', body: JSON.stringify({ driverId }) }),
  submitProof: (id, data) => {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(`${API.base}/orders/${id}/proof`, {
      method: 'POST',
      headers,
      body: data  // FormData
    }).then(r => r.json());
  },
  confirmDelivery: (id) => API.request(`/orders/${id}/confirm`, { method: 'POST' }),
  raiseDispute: (id, reason) => API.request(`/orders/${id}/dispute`, { method: 'POST', body: JSON.stringify({ reason }) }),
  resolveDispute: (id, decision, amount) => API.request(`/orders/${id}/resolve`, { method: 'POST', body: JSON.stringify({ decision, amount }) }),
  getOrderHistory: (id) => API.request(`/orders/${id}/history`),

  // Blockchain
  getChain: () => API.request('/blockchain/chain'),
  validateChain: () => API.request('/blockchain/validate'),
  getStats: () => API.request('/blockchain/stats'),

  // Users (admin)
  getUsers: () => API.request('/auth/users'),
  getActiveUsers: () => API.request('/auth/users/active'),
  promoteUser: (id) => API.request(`/auth/users/${id}/promote`, { method: 'POST' }),
  demoteUser: (id, newRole) => API.request(`/auth/users/${id}/demote`, { method: 'POST', body: JSON.stringify({ newRole }) }),
  deleteUser: (id) => API.request(`/auth/users/${id}`, { method: 'DELETE' }),
  registerUser: (data) => API.request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  logoutServer: () => API.request('/auth/logout', { method: 'POST' }),
};

// ---- TOAST NOTIFICATIONS ----
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ---- AUTH ----
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  try {
    errorEl.textContent = '';
    const data = await API.login(username, password);
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('escrow_token', authToken);
    localStorage.setItem('escrow_user', JSON.stringify(currentUser));
    enterApp();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

function enterApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  updateUserUI();
  switchView('dashboard');
  loadDashboard();
}

async function logout() {
  try { await API.logoutServer(); } catch(e) { /* ignore */ }
  authToken = null;
  currentUser = null;
  localStorage.removeItem('escrow_token');
  localStorage.removeItem('escrow_user');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

document.getElementById('logout-btn').addEventListener('click', logout);

// Auto-login from localStorage
(function autoLogin() {
  const token = localStorage.getItem('escrow_token');
  const user = localStorage.getItem('escrow_user');
  if (token && user) {
    authToken = token;
    currentUser = JSON.parse(user);
    enterApp();
  }
})();

function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('user-display-name').textContent = currentUser.name;
  document.getElementById('user-avatar').textContent = currentUser.name.charAt(0);
  const roleTag = document.getElementById('user-role-tag');
  roleTag.textContent = currentUser.role;
  roleTag.className = `role-tag ${currentUser.role}`;

  // Show/hide new order button based on role
  const newOrderBtns = document.querySelectorAll('#btn-new-order, #btn-new-order-2');
  newOrderBtns.forEach(btn => {
    btn.classList.toggle('hidden', currentUser.role !== 'customer');
  });

  // Show/hide users tab — visible for admin
  const usersNav = document.getElementById('nav-users');
  if (usersNav) usersNav.classList.toggle('hidden', currentUser.role !== 'admin');
}

// ---- NAVIGATION ----
document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
  });
});

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  if (view === 'dashboard') loadDashboard();
  else if (view === 'orders') loadOrders();
  else if (view === 'users') loadUsers();
  else if (view === 'blockchain') loadBlockchain();
}

// ---- DASHBOARD ----
async function loadDashboard() {
  try {
    orders = await API.getOrders();
    renderStats();
    renderOrders(document.getElementById('dashboard-orders'), orders.slice(0, 5));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderStats() {
  const container = document.getElementById('stats-container');
  const total = orders.length;
  const active = orders.filter(o => !['SETTLED', 'RESOLVED'].includes(o.status)).length;
  const settled = orders.filter(o => o.status === 'SETTLED').length;
  const disputed = orders.filter(o => o.status === 'DISPUTED').length;
  const totalValue = orders.reduce((s, o) => s + (o.amount || 0), 0);

  const statsConfig = {
    customer: [
      { icon: '📦', cls: 'indigo', value: total, label: 'Total Orders' },
      { icon: '⏳', cls: 'amber', value: active, label: 'Active' },
      { icon: '✅', cls: 'emerald', value: settled, label: 'Settled' },
      { icon: '💰', cls: 'cyan', value: `₹${totalValue.toLocaleString()}`, label: 'Total Value' },
    ],
    driver: [
      { icon: '🚚', cls: 'indigo', value: total, label: 'Assigned' },
      { icon: '📍', cls: 'amber', value: orders.filter(o => o.status === 'IN_TRANSIT').length, label: 'In Transit' },
      { icon: '✅', cls: 'emerald', value: settled, label: 'Delivered' },
      { icon: '📸', cls: 'cyan', value: orders.filter(o => o.status === 'PROOF_SUBMITTED').length, label: 'Proof Pending' },
    ],
    admin: [
      { icon: '📊', cls: 'indigo', value: total, label: 'Total Orders' },
      { icon: '⚠️', cls: 'rose', value: disputed, label: 'Disputes' },
      { icon: '✅', cls: 'emerald', value: settled + orders.filter(o => o.status === 'RESOLVED').length, label: 'Resolved' },
      { icon: '💰', cls: 'cyan', value: `₹${totalValue.toLocaleString()}`, label: 'Total Value' },
    ],
    supplier: [
      { icon: '📦', cls: 'indigo', value: total, label: 'Orders' },
      { icon: '⏳', cls: 'amber', value: active, label: 'Pending' },
      { icon: '✅', cls: 'emerald', value: settled, label: 'Settled' },
      { icon: '💰', cls: 'cyan', value: `₹${totalValue.toLocaleString()}`, label: 'Earnings' },
    ]
  };

  const stats = statsConfig[currentUser.role] || statsConfig.customer;
  container.innerHTML = stats.map(s => `
    <div class="stat-card slide-up">
      <div class="stat-icon ${s.cls}">${s.icon}</div>
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
}

// ---- RENDER ORDERS ----
function renderOrders(container, orderList) {
  if (!orderList || orderList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>No Orders Yet</h3>
        <p>${currentUser.role === 'customer' ? 'Create your first order to get started!' : 'No orders assigned to you yet.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = orderList.map(order => `
    <div class="order-card slide-up" data-order-id="${order.orderId}">
      <div class="order-card-header">
        <span class="order-id">${order.orderId}</span>
        <span class="status-badge ${order.status}">${formatStatus(order.status)}</span>
      </div>
      <div class="order-card-body">
        <div class="order-details-grid">
          <div class="order-detail">
            <div class="detail-label">Description</div>
            <div class="detail-value">${order.description || 'N/A'}</div>
          </div>
          <div class="order-detail">
            <div class="detail-label">Amount</div>
            <div class="detail-value amount">₹${(order.amount || 0).toLocaleString()}</div>
          </div>
          <div class="order-detail">
            <div class="detail-label">Customer</div>
            <div class="detail-value">${order.customerName || order.customerId}</div>
          </div>
          <div class="order-detail">
            <div class="detail-label">Supplier</div>
            <div class="detail-value">${order.supplierName || order.supplierId}</div>
          </div>
          <div class="order-detail">
            <div class="detail-label">Pickup</div>
            <div class="detail-value">${order.pickup || 'N/A'}</div>
          </div>
          <div class="order-detail">
            <div class="detail-label">Delivery</div>
            <div class="detail-value">${order.delivery || 'N/A'}</div>
          </div>
          ${order.driverName ? `
          <div class="order-detail">
            <div class="detail-label">Driver</div>
            <div class="detail-value">🚚 ${order.driverName}</div>
          </div>` : ''}
          <div class="order-detail">
            <div class="detail-label">Created</div>
            <div class="detail-value">${formatDate(order.createdAt)}</div>
          </div>
        </div>

        ${order.deliveryProof ? renderProofSection(order.deliveryProof) : ''}
        ${order.resolution ? renderResolution(order.resolution) : ''}
        ${order.disputeReason ? `
          <div class="dispute-evidence">
            <h4>⚠️ Dispute Reason</h4>
            <p style="font-size:0.85rem; color:var(--text-secondary);">${order.disputeReason}</p>
          </div>` : ''}
      </div>
      <div class="order-card-actions">
        ${renderOrderActions(order)}
      </div>
    </div>
  `).join('');
}

function renderProofSection(proof) {
  return `
    <div class="proof-details">
      <h4 style="color:var(--accent-cyan); font-size:0.82rem; margin-bottom:0.5rem;">📸 Delivery Proof</h4>
      <div class="proof-row"><span class="proof-label">GPS</span><span class="proof-value">${proof.gpsLat?.toFixed(4)}, ${proof.gpsLng?.toFixed(4)}</span></div>
      <div class="proof-row"><span class="proof-label">Notes</span><span class="proof-value">${proof.notes || 'N/A'}</span></div>
      <div class="proof-row"><span class="proof-label">Hash</span><span class="proof-value text-mono" style="font-size:0.68rem; word-break:break-all;">${proof.hash?.slice(0, 32)}...</span></div>
      <div class="proof-row"><span class="proof-label">Time</span><span class="proof-value">${formatDate(proof.submittedAt || proof.timestamp)}</span></div>
    </div>`;
}

function renderResolution(resolution) {
  const colors = { RELEASE: 'var(--accent-emerald)', REFUND: 'var(--accent-rose)', PARTIAL: 'var(--accent-amber)' };
  return `
    <div class="proof-details" style="background:rgba(168,85,247,0.05); border-color:rgba(168,85,247,0.15);">
      <h4 style="color:var(--accent-purple); font-size:0.82rem; margin-bottom:0.5rem;">⚖️ Resolution</h4>
      <div class="proof-row"><span class="proof-label">Decision</span><span class="proof-value" style="color:${colors[resolution.decision] || 'inherit'}">${resolution.decision}</span></div>
      ${resolution.supplierAmount !== undefined ? `<div class="proof-row"><span class="proof-label">Supplier Gets</span><span class="proof-value">₹${resolution.supplierAmount.toLocaleString()}</span></div>` : ''}
      ${resolution.refundAmount !== undefined ? `<div class="proof-row"><span class="proof-label">Refund</span><span class="proof-value">₹${resolution.refundAmount.toLocaleString()}</span></div>` : ''}
    </div>`;
}

function renderOrderActions(order) {
  const actions = [];
  const role = currentUser.role;

  if (role === 'customer') {
    if (order.status === 'CREATED') {
      actions.push(`<button class="btn btn-primary btn-sm" onclick="payForOrder('${order.orderId}')">💳 Pay & Lock Escrow</button>`);
    }
    if (order.status === 'LOCKED') {
      actions.push(`<button class="btn btn-outline btn-sm" onclick="assignDriverToOrder('${order.orderId}')">🚚 Assign Driver</button>`);
    }
    if (order.status === 'PROOF_SUBMITTED') {
      actions.push(`<button class="btn btn-success btn-sm" onclick="confirmOrder('${order.orderId}')">✅ Confirm Delivery</button>`);
      actions.push(`<button class="btn btn-danger btn-sm" onclick="showDisputeModal('${order.orderId}')">⚠️ Raise Dispute</button>`);
    }
  }

  if (role === 'driver') {
    if (order.status === 'IN_TRANSIT') {
      actions.push(`<button class="btn btn-primary btn-sm" onclick="showProofModal('${order.orderId}')">📸 Submit Proof</button>`);
    }
  }

  if (role === 'admin') {
    if (order.status === 'DISPUTED') {
      actions.push(`<button class="btn btn-primary btn-sm" onclick="showResolveModal('${order.orderId}')">⚖️ Resolve Dispute</button>`);
    }
  }

  // All roles can view history
  actions.push(`<button class="btn btn-outline btn-sm" onclick="showHistoryModal('${order.orderId}')">🔗 Blockchain Log</button>`);

  return actions.join('');
}

// ---- LOAD ORDERS VIEW ----
async function loadOrders() {
  try {
    orders = await API.getOrders();
    renderOrders(document.getElementById('orders-list'), orders);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---- BLOCKCHAIN EXPLORER ----
async function loadBlockchain() {
  try {
    const [chainData, stats] = await Promise.all([API.getChain(), API.getStats()]);
    renderBlockchainStats(stats);
    renderBlockchain(chainData);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderBlockchainStats(stats) {
  const container = document.getElementById('blockchain-stats');
  container.innerHTML = `
    <div class="stat-card slide-up">
      <div class="stat-icon indigo">⛓️</div>
      <div class="stat-value">${stats.totalBlocks}</div>
      <div class="stat-label">Total Blocks</div>
    </div>
    <div class="stat-card slide-up">
      <div class="stat-icon emerald">✅</div>
      <div class="stat-value">${stats.chainValid ? 'Valid' : 'Invalid!'}</div>
      <div class="stat-label">Chain Integrity</div>
    </div>
    <div class="stat-card slide-up">
      <div class="stat-icon cyan">📊</div>
      <div class="stat-value">${Object.keys(stats.transactionTypes).length}</div>
      <div class="stat-label">Transaction Types</div>
    </div>
    <div class="stat-card slide-up">
      <div class="stat-icon amber">🕐</div>
      <div class="stat-value">${formatDate(stats.latestTimestamp)}</div>
      <div class="stat-label">Last Block</div>
    </div>
  `;
}

function renderBlockchain(chainData) {
  const container = document.getElementById('blockchain-chain');
  const blocks = chainData.chain.slice().reverse(); // newest first

  container.innerHTML = blocks.map((block, i) => `
    ${i > 0 ? '<div class="block-connector"></div>' : ''}
    <div class="block-card ${block.index === 0 ? 'genesis' : ''} slide-up">
      <div class="block-header">
        <span class="block-index">Block #${block.index}</span>
        <span class="block-timestamp">${formatDate(block.timestamp)}</span>
      </div>
      <div class="block-type">
        ${getBlockIcon(block.data?.type)} ${block.data?.type || 'GENESIS'}
        ${block.data?.orderId ? `<span style="color:var(--text-muted); font-size:0.72rem; margin-left:0.5rem;">${block.data.orderId}</span>` : ''}
        ${block.data?.status ? `<span class="status-badge ${block.data.status}" style="margin-left:0.5rem;">${block.data.status}</span>` : ''}
      </div>
      <div class="block-hash"><span>Hash:</span> ${block.hash}</div>
      <div class="block-hash"><span>Prev:</span> ${block.previousHash}</div>
    </div>
  `).join('');
}

function getBlockIcon(type) {
  const icons = {
    'GENESIS': '🌐',
    'ORDER_CREATED': '📦',
    'PAYMENT_LOCKED': '🔒',
    'DRIVER_ASSIGNED': '🚚',
    'PROOF_SUBMITTED': '📸',
    'DELIVERY_CONFIRMED': '✅',
    'PAYMENT_RELEASED': '💰',
    'DISPUTE_RAISED': '⚠️',
    'DISPUTE_RESOLVED': '⚖️',
  };
  return icons[type] || '📄';
}

async function validateChain() {
  try {
    const result = await API.validateChain();
    showToast(result.message, result.valid ? 'success' : 'error');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---- ORDER ACTIONS ----
async function payForOrder(orderId) {
  try {
    const result = await API.payOrder(orderId);
    showToast(`Payment locked in escrow! Ref: ${result.paymentRef}`, 'success');
    refreshCurrentView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function assignDriverToOrder(orderId) {
  try {
    const drivers = await API.getDrivers();
    if (!drivers || drivers.length === 0) {
      return showToast('No drivers available in the system', 'error');
    }

    const options = drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    const body = `
      <div class="form-group">
        <label>Select Driver</label>
        <select class="form-input" id="assign-driver-select">
          ${options}
        </select>
      </div>
      <div style="background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.15); border-radius:8px; padding:0.75rem; font-size:0.82rem; color:var(--accent-cyan);">
        🚚 The selected driver will be notified and the order will move to IN TRANSIT.
      </div>`;

    const footer = `
      <button class="btn btn-outline" onclick="closeModalForce()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAssignDriver('${orderId}')">🚚 Assign Driver</button>`;

    showModal('Assign Driver', body, footer);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitAssignDriver(orderId) {
  try {
    const driverId = document.getElementById('assign-driver-select').value;
    const result = await API.assignDriver(orderId, driverId);
    closeModalForce();
    showToast(`Driver assigned: ${result.driverName || driverId}`, 'success');
    refreshCurrentView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmOrder(orderId) {
  try {
    const result = await API.confirmDelivery(orderId);
    showToast('Delivery confirmed! Payment released to supplier.', 'success');
    refreshCurrentView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function refreshCurrentView() {
  if (currentView === 'dashboard') loadDashboard();
  else if (currentView === 'orders') loadOrders();
  else if (currentView === 'users') loadUsers();
  else if (currentView === 'blockchain') loadBlockchain();
}

// ---- MODALS ----
function showModal(title, bodyHTML, footerHTML = '') {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="closeModalForce()">✕</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
      </div>
    </div>`;
}

function closeModal(e) {
  if (e && e.target.classList.contains('modal-overlay')) {
    document.getElementById('modal-container').innerHTML = '';
  }
}

function closeModalForce() {
  document.getElementById('modal-container').innerHTML = '';
}

// NEW ORDER MODAL
function showNewOrderModal() {
  if (currentUser.role !== 'customer') return;

  const body = `
    <form id="new-order-form">
      <div class="form-group">
        <label>Supplier</label>
        <select class="form-input" id="order-supplier" required>
          <option value="USR-S001">TransCo Logistics</option>
        </select>
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" class="form-input" id="order-desc" placeholder="e.g. Electronics shipment" required>
      </div>
      <div class="form-group">
        <label>Amount (₹)</label>
        <input type="number" class="form-input" id="order-amount" placeholder="5000" min="100" required>
      </div>
      <div class="form-group">
        <label>Pickup Address</label>
        <input type="text" class="form-input" id="order-pickup" placeholder="Warehouse A, Delhi" value="Warehouse A, New Delhi">
      </div>
      <div class="form-group">
        <label>Delivery Address</label>
        <input type="text" class="form-input" id="order-delivery" placeholder="Office B, Mumbai" value="Office B, Mumbai">
      </div>
    </form>`;

  const footer = `
    <button class="btn btn-outline" onclick="closeModalForce()">Cancel</button>
    <button class="btn btn-primary" onclick="submitNewOrder()">📦 Create Order</button>`;

  showModal('Create New Order', body, footer);
}

async function submitNewOrder() {
  try {
    const data = {
      supplierId: document.getElementById('order-supplier').value,
      description: document.getElementById('order-desc').value,
      amount: document.getElementById('order-amount').value,
      pickupAddress: document.getElementById('order-pickup').value,
      deliveryAddress: document.getElementById('order-delivery').value,
    };
    const result = await API.createOrder(data);
    closeModalForce();
    showToast(`Order created: ${result.orderId}`, 'success');
    refreshCurrentView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// DELIVERY PROOF MODAL
function showProofModal(orderId) {
  const body = `
    <form id="proof-form">
      <div class="form-group">
        <label>GPS Latitude</label>
        <input type="number" step="0.0001" class="form-input" id="proof-lat" value="28.6139" required>
      </div>
      <div class="form-group">
        <label>GPS Longitude</label>
        <input type="number" step="0.0001" class="form-input" id="proof-lng" value="77.2090" required>
      </div>
      <div class="form-group">
        <label>Delivery Notes</label>
        <textarea class="form-input" id="proof-notes" placeholder="Delivered at front gate. Received by security guard.">Delivered at front gate. Signed by recipient.</textarea>
      </div>
      <div class="form-group">
        <label>Photo Proof (optional)</label>
        <input type="file" class="form-input" id="proof-image" accept="image/*">
      </div>
    </form>`;

  const footer = `
    <button class="btn btn-outline" onclick="closeModalForce()">Cancel</button>
    <button class="btn btn-primary" onclick="submitProof('${orderId}')">📸 Submit Proof</button>`;

  showModal('Submit Delivery Proof', body, footer);
}

async function submitProof(orderId) {
  try {
    const formData = new FormData();
    formData.append('gpsLat', document.getElementById('proof-lat').value);
    formData.append('gpsLng', document.getElementById('proof-lng').value);
    formData.append('notes', document.getElementById('proof-notes').value);

    const imageFile = document.getElementById('proof-image').files[0];
    if (imageFile) formData.append('image', imageFile);

    const result = await API.submitProof(orderId, formData);
    if (result.error) throw new Error(result.error);

    closeModalForce();
    showToast(`Proof submitted! Hash: ${result.proofHash?.slice(0, 16)}...`, 'success');
    refreshCurrentView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// DISPUTE MODAL
function showDisputeModal(orderId) {
  const body = `
    <form id="dispute-form">
      <div class="form-group">
        <label>Reason for Dispute</label>
        <textarea class="form-input" id="dispute-reason" placeholder="Describe the issue with the delivery..." required style="min-height:120px;"></textarea>
      </div>
      <div style="background:rgba(244,63,94,0.08); border:1px solid rgba(244,63,94,0.15); border-radius:8px; padding:0.75rem; font-size:0.82rem; color:var(--accent-rose);">
        ⚠️ Raising a dispute will freeze the escrowed funds until an administrator reviews the case.
      </div>
    </form>`;

  const footer = `
    <button class="btn btn-outline" onclick="closeModalForce()">Cancel</button>
    <button class="btn btn-danger" onclick="submitDispute('${orderId}')">⚠️ Raise Dispute</button>`;

  showModal('Raise Dispute', body, footer);
}

async function submitDispute(orderId) {
  try {
    const reason = document.getElementById('dispute-reason').value;
    if (!reason.trim()) return showToast('Please provide a reason', 'error');

    await API.raiseDispute(orderId, reason);
    closeModalForce();
    showToast('Dispute raised. Funds frozen in escrow.', 'info');
    refreshCurrentView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// RESOLVE DISPUTE MODAL (Admin)
function showResolveModal(orderId) {
  const order = orders.find(o => o.orderId === orderId);
  const body = `
    <div class="dispute-evidence">
      <h4>📋 Order Details</h4>
      <div class="proof-row"><span class="proof-label">Order</span><span class="proof-value">${orderId}</span></div>
      <div class="proof-row"><span class="proof-label">Amount</span><span class="proof-value">₹${(order?.amount || 0).toLocaleString()}</span></div>
      <div class="proof-row"><span class="proof-label">Dispute</span><span class="proof-value">${order?.disputeReason || 'N/A'}</span></div>
    </div>
    ${order?.deliveryProof ? renderProofSection(order.deliveryProof) : '<p style="color:var(--text-muted); font-size:0.85rem; margin:0.5rem 0;">No delivery proof available.</p>'}
    <div class="form-group mt-2">
      <label>Resolution Decision</label>
      <select class="form-input" id="resolve-decision">
        <option value="RELEASE">RELEASE — Pay supplier in full</option>
        <option value="REFUND">REFUND — Refund customer in full</option>
        <option value="PARTIAL">PARTIAL — Split payment</option>
      </select>
    </div>
    <div class="form-group" id="partial-amount-group" style="display:none;">
      <label>Supplier Amount (₹)</label>
      <input type="number" class="form-input" id="resolve-amount" placeholder="Amount to pay supplier" min="0" max="${order?.amount || 0}">
    </div>`;

  const footer = `
    <button class="btn btn-outline" onclick="closeModalForce()">Cancel</button>
    <button class="btn btn-primary" onclick="submitResolve('${orderId}')">⚖️ Resolve</button>`;

  showModal('Resolve Dispute', body, footer);

  // Toggle partial amount visibility
  setTimeout(() => {
    const select = document.getElementById('resolve-decision');
    if (select) {
      select.addEventListener('change', () => {
        const partialGroup = document.getElementById('partial-amount-group');
        if (partialGroup) partialGroup.style.display = select.value === 'PARTIAL' ? 'block' : 'none';
      });
    }
  }, 100);
}

async function submitResolve(orderId) {
  try {
    const decision = document.getElementById('resolve-decision').value;
    const amount = decision === 'PARTIAL' ? document.getElementById('resolve-amount').value : null;

    if (decision === 'PARTIAL' && (!amount || amount <= 0)) {
      return showToast('Please enter a valid partial amount', 'error');
    }

    await API.resolveDispute(orderId, decision, amount);
    closeModalForce();
    showToast(`Dispute resolved: ${decision}`, 'success');
    refreshCurrentView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// BLOCKCHAIN HISTORY MODAL
async function showHistoryModal(orderId) {
  try {
    const history = await API.getOrderHistory(orderId);

    const body = `
      <div style="margin-bottom:1rem;">
        <span class="order-id" style="font-size:0.9rem;">${orderId}</span>
        <span style="color:var(--text-muted); font-size:0.82rem; margin-left:0.5rem;">${history.length} transactions</span>
      </div>
      <div class="timeline">
        ${history.map((block, i) => `
          <div class="timeline-item ${i === history.length - 1 ? 'active' : ''}">
            <div class="tl-type">${getBlockIcon(block.data?.type)} ${block.data?.type || 'Unknown'}</div>
            <div class="tl-time">${formatDate(block.timestamp)} · Block #${block.index}</div>
            <div class="tl-hash">🔑 ${block.hash.slice(0, 40)}...</div>
          </div>
        `).join('')}
      </div>`;

    showModal(`Blockchain History`, body);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---- UTILS ----
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function formatStatus(status) {
  return (status || '').replace(/_/g, ' ');
}

// ---- USER MANAGEMENT (ADMIN) ----
let allUsersData = { users: [], stats: {} };
let currentUsersFilter = 'all';

async function loadUsers() {
  if (currentUser.role !== 'admin') return;
  try {
    allUsersData = await API.getUsers();
    renderUsersStats(allUsersData.stats);
    filterUsers(currentUsersFilter);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderUsersStats(stats) {
  const container = document.getElementById('users-stats');
  container.innerHTML = `
    <div class="stat-card slide-up">
      <div class="stat-icon indigo">👥</div>
      <div class="stat-value">${stats.totalUsers}</div>
      <div class="stat-label">Total Users</div>
    </div>
    <div class="stat-card slide-up">
      <div class="stat-icon emerald">🟢</div>
      <div class="stat-value">${stats.activeUsers}</div>
      <div class="stat-label">Active Now</div>
    </div>
    <div class="stat-card slide-up">
      <div class="stat-icon rose">🛡️</div>
      <div class="stat-value">${stats.adminCount}</div>
      <div class="stat-label">Admins</div>
    </div>
    <div class="stat-card slide-up">
      <div class="stat-icon cyan">📈</div>
      <div class="stat-value">${stats.roleBreakdown ? `${stats.roleBreakdown.customer}C / ${stats.roleBreakdown.driver}D / ${stats.roleBreakdown.supplier}S` : '—'}</div>
      <div class="stat-label">Role Breakdown</div>
    </div>
  `;
}

function filterUsers(filter, tabBtn) {
  currentUsersFilter = filter;
  // Update tab UI
  if (tabBtn) {
    document.querySelectorAll('#users-tab-bar .tab-btn').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');
  }

  let filtered = allUsersData.users || [];
  if (filter === 'active') filtered = filtered.filter(u => u.is_active === 1);
  else if (filter === 'admin') filtered = filtered.filter(u => u.role === 'admin');
  else if (filter === 'customer') filtered = filtered.filter(u => u.role === 'customer');
  else if (filter === 'driver') filtered = filtered.filter(u => u.role === 'driver');
  else if (filter === 'supplier') filtered = filtered.filter(u => u.role === 'supplier');

  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const container = document.getElementById('users-table-container');

  if (!users || users.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3>No Users Found</h3>
        <p>No users match the current filter.</p>
      </div>`;
    return;
  }

  const header = `
    <div class="user-row header">
      <div></div>
      <div>User</div>
      <div>Contact</div>
      <div>Role</div>
      <div>Status</div>
      <div style="text-align:right;">Actions</div>
    </div>`;

  const rows = users.map(user => {
    const isMe = user.id === currentUser.id;
    const isActive = user.is_active === 1;
    const initial = user.name ? user.name.charAt(0) : '?';

    let actions = '';
    if (!isMe) {
      if (user.role !== 'admin') {
        actions += `<button class="btn btn-outline btn-sm" onclick="promoteToAdmin('${user.id}')" title="Grant admin access">🛡️ Promote</button>`;
      } else {
        actions += `<button class="btn btn-outline btn-sm" onclick="showDemoteModal('${user.id}', '${user.name}')" title="Revoke admin access">⬇️ Demote</button>`;
      }
      actions += `<button class="btn btn-danger btn-sm" onclick="deleteUserConfirm('${user.id}', '${user.name}')" title="Delete user" style="padding:0.3rem 0.5rem;">🗑️</button>`;
    } else {
      actions = '<span style="font-size:0.72rem; color:var(--text-muted);">You</span>';
    }

    return `
      <div class="user-row slide-up">
        <div class="user-avatar ${user.role}-av">${initial}</div>
        <div class="user-info">
          <div class="user-name">${user.name}${isMe ? ' (You)' : ''}</div>
          <div class="user-username">@${user.username}</div>
        </div>
        <div class="user-email">${user.email || '—'}</div>
        <div><span class="role-tag ${user.role}">${user.role}</span></div>
        <div>
          <span class="active-dot ${isActive ? 'online' : 'offline'}">${isActive ? 'Online' : 'Offline'}</span>
        </div>
        <div class="user-actions">${actions}</div>
      </div>`;
  }).join('');

  container.innerHTML = header + rows;
}

async function promoteToAdmin(userId) {
  try {
    const result = await API.promoteUser(userId);
    showToast(result.message, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showDemoteModal(userId, userName) {
  const body = `
    <p style="margin-bottom:1rem;">Change <strong>${userName}</strong> from Admin to:</p>
    <div class="form-group">
      <label>New Role</label>
      <select class="form-input" id="demote-role">
        <option value="customer">Customer</option>
        <option value="driver">Driver</option>
        <option value="supplier">Supplier</option>
      </select>
    </div>
    <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.15); border-radius:8px; padding:0.75rem; font-size:0.82rem; color:var(--accent-amber);">
      ⚠️ This will revoke all admin privileges from this user.
    </div>`;

  const footer = `
    <button class="btn btn-outline" onclick="closeModalForce()">Cancel</button>
    <button class="btn btn-danger" onclick="submitDemote('${userId}')">⬇️ Demote</button>`;

  showModal('Revoke Admin Access', body, footer);
}

async function submitDemote(userId) {
  try {
    const newRole = document.getElementById('demote-role').value;
    const result = await API.demoteUser(userId, newRole);
    closeModalForce();
    showToast(result.message, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUserConfirm(userId, userName) {
  const body = `
    <p style="margin-bottom:1rem;">Are you sure you want to <strong style="color:var(--accent-rose);">permanently delete</strong> the user <strong>${userName}</strong>?</p>
    <div style="background:rgba(244,63,94,0.08); border:1px solid rgba(244,63,94,0.15); border-radius:8px; padding:0.75rem; font-size:0.82rem; color:var(--accent-rose);">
      ⚠️ This action cannot be undone. All user data will be removed.
    </div>`;

  const footer = `
    <button class="btn btn-outline" onclick="closeModalForce()">Cancel</button>
    <button class="btn btn-danger" onclick="executeDeleteUser('${userId}')">🗑️ Delete User</button>`;

  showModal('Delete User', body, footer);
}

async function executeDeleteUser(userId) {
  try {
    const result = await API.deleteUser(userId);
    closeModalForce();
    showToast(result.message, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showAddUserModal() {
  const body = `
    <form id="add-user-form">
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" class="form-input" id="new-user-name" placeholder="e.g. Rahul Verma" required>
      </div>
      <div class="form-group">
        <label>Username</label>
        <input type="text" class="form-input" id="new-user-username" placeholder="e.g. rahul_v" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" class="form-input" id="new-user-password" placeholder="Min 6 characters" required>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" class="form-input" id="new-user-email" placeholder="rahul@example.com">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="text" class="form-input" id="new-user-phone" placeholder="9876543210">
      </div>
      <div class="form-group">
        <label>Role</label>
        <select class="form-input" id="new-user-role">
          <option value="customer">Customer</option>
          <option value="supplier">Supplier</option>
          <option value="driver">Driver</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </form>`;

  const footer = `
    <button class="btn btn-outline" onclick="closeModalForce()">Cancel</button>
    <button class="btn btn-primary" onclick="submitAddUser()">👤 Create User</button>`;

  showModal('Add New User', body, footer);
}

async function submitAddUser() {
  try {
    const data = {
      name: document.getElementById('new-user-name').value,
      username: document.getElementById('new-user-username').value,
      password: document.getElementById('new-user-password').value,
      email: document.getElementById('new-user-email').value,
      phone: document.getElementById('new-user-phone').value,
      role: document.getElementById('new-user-role').value,
    };
    if (!data.name || !data.username || !data.password) {
      return showToast('Name, username, and password are required', 'error');
    }
    await API.registerUser(data);
    closeModalForce();
    showToast(`User ${data.name} created as ${data.role}`, 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
