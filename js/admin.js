// =============================================
// Admin Dashboard Logic
// =============================================

// --- Auth Guard ---
requireAuth(['Admin']);

// --- State ---
let allDoctors = [];
let allReceptionists = [];
let allPatients = [];
let allAppointments = [];
let appointmentsChart = null;
let genderChart = null;

// --- Initialize on Auth Ready ---
document.addEventListener('authReady', async (e) => {
    const user = e.detail;
    document.getElementById('admin-name').textContent = user.name || 'Admin';
    document.getElementById('admin-avatar').textContent = (user.name || 'A').charAt(0).toUpperCase();

    // Load all data
    await Promise.all([
        loadDoctors(),
        loadReceptionists(),
        loadPatients(),
        loadAppointments()
    ]);

    updateStats();
    renderCharts();
    renderRecentActivity();
});

// =============================================
// Navigation
// =============================================
function switchPage(page, el) {
    // Hide all pages
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    // Show target page
    const target = document.getElementById('page-' + page);
    if (target) {
        target.style.display = 'block';
        target.classList.add('fade-in');
    }
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (el) el.classList.add('active');
    // Update title
    const titles = {
        overview: 'Overview',
        doctors: 'Doctors',
        receptionists: 'Receptionists',
        patients: 'Patients',
        appointments: 'Appointments',
        settings: 'Settings'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// =============================================
// Data Loading from Firestore
// =============================================
async function loadDoctors() {
    try {
        const snapshot = await db.collection('users').where('role', '==', 'Doctor').get();
        allDoctors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDoctorsTable();
    } catch (err) {
        console.error('Error loading doctors:', err);
        showToast('Failed to load doctors.', 'error');
    }
}

async function loadReceptionists() {
    try {
        const snapshot = await db.collection('users').where('role', '==', 'Receptionist').get();
        allReceptionists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderReceptionistsTable();
    } catch (err) {
        console.error('Error loading receptionists:', err);
        showToast('Failed to load receptionists.', 'error');
    }
}

async function loadPatients() {
    try {
        const snapshot = await db.collection('patients').get();
        allPatients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPatientsTable();
    } catch (err) {
        console.error('Error loading patients:', err);
        showToast('Failed to load patients.', 'error');
    }
}

async function loadAppointments() {
    try {
        const snapshot = await db.collection('appointments').orderBy('date', 'desc').get();
        allAppointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAppointmentsTable();
    } catch (err) {
        console.error('Error loading appointments:', err);
        showToast('Failed to load appointments.', 'error');
    }
}

// =============================================
// Stats
// =============================================
function updateStats() {
    document.getElementById('stat-patients').textContent = allPatients.length;
    document.getElementById('stat-doctors').textContent = allDoctors.length;

    // Monthly appointments
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyAppts = allAppointments.filter(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        return d >= monthStart;
    });
    document.getElementById('stat-appointments').textContent = monthlyAppts.length;

    // Simulated revenue: appointments * consultation fee
    const fee = parseInt(localStorage.getItem('consultationFee') || '500');
    const completedAppts = allAppointments.filter(a => a.status === 'Completed');
    document.getElementById('stat-revenue').textContent = 'Rs ' + (completedAppts.length * fee).toLocaleString();
}

// =============================================
// Charts
// =============================================
function renderCharts() {
    renderAppointmentsChart();
    renderGenderChart();
}

function renderAppointmentsChart() {
    const ctx = document.getElementById('chart-appointments');
    if (!ctx) return;

    // Get last 7 days labels
    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        const dayStr = d.toISOString().split('T')[0];
        const count = allAppointments.filter(a => {
            const ad = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            return ad.toISOString().split('T')[0] === dayStr;
        }).length;
        data.push(count);
    }

    if (appointmentsChart) appointmentsChart.destroy();
    appointmentsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Appointments',
                data,
                backgroundColor: 'rgba(15, 191, 165, 0.6)',
                borderColor: 'rgba(15, 191, 165, 1)',
                borderWidth: 1,
                borderRadius: 6,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { color: 'rgba(148,163,184,0.08)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(148,163,184,0.08)' },
                    ticks: { color: '#94a3b8', stepSize: 1 }
                }
            }
        }
    });
}

function renderGenderChart() {
    const ctx = document.getElementById('chart-gender');
    if (!ctx) return;

    const male = allPatients.filter(p => (p.gender || '').toLowerCase() === 'male').length;
    const female = allPatients.filter(p => (p.gender || '').toLowerCase() === 'female').length;
    const other = allPatients.length - male - female;

    if (genderChart) genderChart.destroy();
    genderChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Male', 'Female', 'Other/Unknown'],
            datasets: [{
                data: [male, female, other],
                backgroundColor: ['rgba(96,165,250,0.7)', 'rgba(244,114,182,0.7)', 'rgba(148,163,184,0.4)'],
                borderColor: ['rgba(96,165,250,1)', 'rgba(244,114,182,1)', 'rgba(148,163,184,0.7)'],
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', padding: 16, usePointStyle: true }
                }
            }
        }
    });
}

// =============================================
// Table Rendering
// =============================================
function renderDoctorsTable() {
    const tbody = document.getElementById('doctors-tbody');
    if (allDoctors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:40px;color:var(--text-muted)">No doctors registered yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = allDoctors.map(doc => `
    <tr>
      <td>
        <div class="user-row-info">
          <div class="user-row-avatar avatar-doctor">${(doc.name || 'D').charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-row-name">${escapeHtml(doc.name)}</div>
          </div>
        </div>
      </td>
      <td><span class="user-row-email">${escapeHtml(doc.email)}</span></td>
      <td><small>${formatDate(doc.createdAt)}</small></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteUser('${doc.id}', 'Doctor')">Remove</button>
      </td>
    </tr>
  `).join('');
}

function renderReceptionistsTable() {
    const tbody = document.getElementById('receptionists-tbody');
    if (allReceptionists.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:40px;color:var(--text-muted)">No receptionists registered yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = allReceptionists.map(rec => `
    <tr>
      <td>
        <div class="user-row-info">
          <div class="user-row-avatar avatar-receptionist">${(rec.name || 'R').charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-row-name">${escapeHtml(rec.name)}</div>
          </div>
        </div>
      </td>
      <td><span class="user-row-email">${escapeHtml(rec.email)}</span></td>
      <td><small>${formatDate(rec.createdAt)}</small></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteUser('${rec.id}', 'Receptionist')">Remove</button>
      </td>
    </tr>
  `).join('');
}

function renderPatientsTable() {
    const tbody = document.getElementById('patients-tbody');
    if (allPatients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:40px;color:var(--text-muted)">No patients registered yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = allPatients.map(p => `
    <tr>
      <td>
        <div class="user-row-info">
          <div class="user-row-avatar avatar-patient">${(p.name || 'P').charAt(0).toUpperCase()}</div>
          <div class="user-row-name">${escapeHtml(p.name)}</div>
        </div>
      </td>
      <td>${p.age || '—'}</td>
      <td>${p.gender || '—'}</td>
      <td>${escapeHtml(p.contact || '—')}</td>
      <td><small>${formatDate(p.createdAt)}</small></td>
    </tr>
  `).join('');
}

function renderAppointmentsTable() {
    const tbody = document.getElementById('appointments-tbody');
    if (allAppointments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding:40px;color:var(--text-muted)">No appointments found.</td></tr>`;
        return;
    }
    tbody.innerHTML = allAppointments.map(a => {
        const patient = allPatients.find(p => p.id === a.patientId);
        const doctor = allDoctors.find(d => d.id === a.doctorId);
        const statusClass = a.status === 'Completed' ? 'badge-success' : a.status === 'Confirmed' ? 'badge-info' : 'badge-warning';
        return `
      <tr>
        <td>${escapeHtml(patient?.name || a.patientId || '—')}</td>
        <td>${escapeHtml(doctor?.name || a.doctorId || '—')}</td>
        <td>${formatDate(a.date)}</td>
        <td><span class="badge ${statusClass}">${a.status || 'Pending'}</span></td>
      </tr>
    `;
    }).join('');
}

// =============================================
// Recent Activity
// =============================================
function renderRecentActivity() {
    const container = document.getElementById('recent-activity');
    const activities = [];

    // Build activity list from appointments
    allAppointments.slice(0, 8).forEach(a => {
        const patient = allPatients.find(p => p.id === a.patientId);
        const doctor = allDoctors.find(d => d.id === a.doctorId);
        const dotClass = a.status === 'Completed' ? 'green' : a.status === 'Confirmed' ? 'blue' : 'yellow';
        activities.push({
            dot: dotClass,
            text: `${patient?.name || 'Patient'} — appointment with Dr. ${doctor?.name || 'Doctor'} (${a.status || 'Pending'})`,
            time: formatDate(a.date)
        });
    });

    if (activities.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><p>No recent activity yet.</p></div>`;
        return;
    }

    container.innerHTML = activities.map(a => `
    <div class="activity-item">
      <div class="activity-dot ${a.dot}"></div>
      <div>
        <div class="activity-text">${a.text}</div>
        <div class="activity-time">${a.time}</div>
      </div>
    </div>
  `).join('');
}

// =============================================
// Add User Modal
// =============================================
let addingUserRole = 'Doctor';

function openAddUserModal(role) {
    addingUserRole = role;
    document.getElementById('modal-title').textContent = 'Add ' + role;
    document.getElementById('new-user-role').value = role;
    document.getElementById('add-user-form').reset();
    document.getElementById('add-user-modal').classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Close modal on overlay click
document.getElementById('add-user-modal').addEventListener('click', function (e) {
    if (e.target === this) closeModal('add-user-modal');
});

async function handleAddUser(e) {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value.trim();
    const email = document.getElementById('new-user-email').value.trim();
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;

    if (!name || !email || !password) {
        showToast('Please fill all fields.', 'warning');
        return;
    }

    const btn = document.getElementById('modal-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    // We need a workaround: creating a user with Firebase Auth signs out the current admin.
    // Solution: Save current admin credentials and re-authenticate after creating the new user.
    const currentUser = auth.currentUser;
    const adminEmail = currentUser.email;

    const result = await registerUser(name, email, password, role);

    if (result.success) {
        showToast(`${role} "${name}" created successfully!`, 'success');
        closeModal('add-user-modal');

        // Note: The admin is now signed out because Firebase Auth signs in the newly created user.
        // We need the admin to re-login. For simplicity, we reload the page and ask admin to login again.
        // In production, you'd use Firebase Admin SDK on a backend to avoid this.
        showToast('You will be redirected to login. Please sign in again.', 'info');
        setTimeout(() => {
            auth.signOut().then(() => {
                window.location.href = 'index.html';
            });
        }, 2000);
    } else {
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

// =============================================
// Delete User (Firestore record only)
// =============================================
async function deleteUser(uid, role) {
    if (!confirm(`Are you sure you want to remove this ${role}?`)) return;

    try {
        await db.collection('users').doc(uid).delete();
        showToast(`${role} removed successfully.`, 'success');

        if (role === 'Doctor') { await loadDoctors(); updateStats(); }
        else if (role === 'Receptionist') { await loadReceptionists(); }
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Failed to remove user: ' + err.message, 'error');
    }
}

// =============================================
// Search / Filter
// =============================================
function filterTable(type) {
    const query = document.getElementById('search-' + type).value.toLowerCase();

    if (type === 'doctors') {
        const filtered = allDoctors.filter(d =>
            d.name?.toLowerCase().includes(query) || d.email?.toLowerCase().includes(query)
        );
        renderFilteredUsers('doctors-tbody', filtered, 'avatar-doctor', 4);
    } else if (type === 'receptionists') {
        const filtered = allReceptionists.filter(r =>
            r.name?.toLowerCase().includes(query) || r.email?.toLowerCase().includes(query)
        );
        renderFilteredUsers('receptionists-tbody', filtered, 'avatar-receptionist', 4);
    } else if (type === 'patients') {
        const filtered = allPatients.filter(p =>
            p.name?.toLowerCase().includes(query) || p.contact?.toLowerCase().includes(query)
        );
        renderFilteredPatients('patients-tbody', filtered);
    }
}

function renderFilteredUsers(tbodyId, list, avatarClass, cols) {
    const tbody = document.getElementById(tbodyId);
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center" style="padding:40px;color:var(--text-muted)">No results found.</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(u => `
    <tr>
      <td>
        <div class="user-row-info">
          <div class="user-row-avatar ${avatarClass}">${(u.name || '?').charAt(0).toUpperCase()}</div>
          <div class="user-row-name">${escapeHtml(u.name)}</div>
        </div>
      </td>
      <td><span class="user-row-email">${escapeHtml(u.email)}</span></td>
      <td><small>${formatDate(u.createdAt)}</small></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}', '${u.role}')">Remove</button>
      </td>
    </tr>
  `).join('');
}

function renderFilteredPatients(tbodyId, list) {
    const tbody = document.getElementById(tbodyId);
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:40px;color:var(--text-muted)">No results found.</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(p => `
    <tr>
      <td>
        <div class="user-row-info">
          <div class="user-row-avatar avatar-patient">${(p.name || 'P').charAt(0).toUpperCase()}</div>
          <div class="user-row-name">${escapeHtml(p.name)}</div>
        </div>
      </td>
      <td>${p.age || '—'}</td>
      <td>${p.gender || '—'}</td>
      <td>${escapeHtml(p.contact || '—')}</td>
      <td><small>${formatDate(p.createdAt)}</small></td>
    </tr>
  `).join('');
}

// =============================================
// Settings
// =============================================
function saveSettings() {
    const clinicName = document.getElementById('setting-clinic-name').value.trim();
    const fee = document.getElementById('setting-fee').value;
    localStorage.setItem('clinicName', clinicName);
    localStorage.setItem('consultationFee', fee);
    showToast('Settings saved!', 'success');
    updateStats();
}

// Load saved settings
(function loadSettings() {
    const name = localStorage.getItem('clinicName');
    const fee = localStorage.getItem('consultationFee');
    if (name) document.getElementById('setting-clinic-name').value = name;
    if (fee) document.getElementById('setting-fee').value = fee;
})();

// =============================================
// Utility Helpers
// =============================================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(ts) {
    if (!ts) return '—';
    let date;
    if (ts.toDate) date = ts.toDate();
    else if (ts.seconds) date = new Date(ts.seconds * 1000);
    else date = new Date(ts);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
