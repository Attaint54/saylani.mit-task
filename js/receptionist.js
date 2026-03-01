// =============================================
// Receptionist Dashboard Logic
// =============================================

// --- Auth Guard ---
requireAuth(['Receptionist']);

// --- State ---
let patients = [];
let appointments = [];
let doctors = [];

// --- Init ---
document.addEventListener('authReady', async (e) => {
    const user = e.detail;
    document.getElementById('rec-name').textContent = user.name || 'Receptionist';
    document.getElementById('rec-avatar').textContent = (user.name || 'R').charAt(0).toUpperCase();

    // Set default date for schedule
    document.getElementById('schedule-date').value = todayStr();

    await Promise.all([loadPatients(), loadDoctors(), loadAppointments()]);
    updateRecStats();
    renderSchedulePreview();
});

// =============================================
// Navigation
// =============================================
function switchPage(page, el) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    const target = document.getElementById('page-' + page);
    if (target) { target.style.display = 'block'; target.classList.add('fade-in'); }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (el) el.classList.add('active');
    const titles = { dashboard: 'Dashboard', patients: 'Patients', appointments: 'Appointments', schedule: 'Daily Schedule' };
    document.getElementById('page-title').textContent = titles[page] || page;
    document.getElementById('sidebar').classList.remove('open');

    if (page === 'schedule') loadSchedule();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// =============================================
// Data Loading
// =============================================
async function loadPatients() {
    try {
        const snap = await db.collection('patients').get();
        patients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPatientsTable(patients);
    } catch (err) {
        console.error(err);
        showToast('Failed to load patients.', 'error');
    }
}

async function loadDoctors() {
    try {
        const snap = await db.collection('users').where('role', '==', 'Doctor').get();
        doctors = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error(err);
    }
}

async function loadAppointments() {
    try {
        const snap = await db.collection('appointments').get();
        appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Local sort to avoid index requirement
        appointments.sort((a, b) => {
            const dA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dB - dA;
        });
        renderAppointmentsTable(appointments);
    } catch (err) {
        console.error(err);
        showToast('Failed to load appointments.', 'error');
    }
}

// =============================================
// Stats
// =============================================
function updateRecStats() {
    document.getElementById('stat-total-patients').textContent = patients.length;

    const today = todayStr();
    const todayAppts = appointments.filter(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        return d.toISOString().split('T')[0] === today;
    });
    document.getElementById('stat-today-appts').textContent = todayAppts.length;

    const pending = appointments.filter(a => a.status === 'Pending').length;
    document.getElementById('stat-pending').textContent = pending;
}

// =============================================
// Patient Table
// =============================================
function renderPatientsTable(list) {
    const tbody = document.getElementById('patients-tbody');
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:40px;color:var(--text-muted)">No patients registered yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(p => `
    <tr>
      <td>
        <div class="user-row-info" style="display:flex;align-items:center;gap:12px">
          <div class="patient-card-avatar" style="width:36px;height:36px;font-size:0.85rem">${(p.name || 'P').charAt(0).toUpperCase()}</div>
          <span style="font-weight:600">${esc(p.name)}</span>
        </div>
      </td>
      <td>${p.age || '—'}</td>
      <td>${p.gender || '—'}</td>
      <td>${esc(p.contact || '—')}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="openEditPatientModal('${p.id}')">Edit</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterPatients() {
    const q = document.getElementById('search-patients').value.toLowerCase();
    const filtered = patients.filter(p =>
        p.name?.toLowerCase().includes(q) || p.contact?.toLowerCase().includes(q)
    );
    renderPatientsTable(filtered);
}

// =============================================
// Add Patient
// =============================================
function openAddPatientModal() {
    document.getElementById('add-patient-form').reset();
    document.getElementById('add-patient-modal').classList.add('active');
}

async function handleAddPatient(e) {
    e.preventDefault();
    const name = document.getElementById('pt-name').value.trim();
    const age = document.getElementById('pt-age').value;
    const gender = document.getElementById('pt-gender').value;
    const contact = document.getElementById('pt-contact').value.trim();
    const email = document.getElementById('pt-email').value.trim();
    const password = document.getElementById('pt-password').value;

    if (!name) { showToast('Patient name is required.', 'warning'); return; }

    const btn = document.getElementById('add-patient-btn');
    btn.disabled = true;
    btn.textContent = 'Registering...';

    try {
        let userId = null;

        // If email + password provided, also create an auth account for the patient
        if (email && password) {
            // Save current user reference
            const currentAdmin = auth.currentUser;

            const result = await registerUser(name, email, password, 'Patient');
            if (result.success) {
                userId = result.uid;
                // Admin gets signed out; we'll handle this later
            } else {
                btn.disabled = false;
                btn.textContent = 'Register Patient';
                return;
            }
        }

        // Add patient document
        const patientData = {
            name,
            age: age ? parseInt(age) : '',
            gender,
            contact,
            email: email || '',
            userId: userId || '',
            createdBy: window.currentUser?.uid || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (userId) {
            await db.collection('patients').doc(userId).set(patientData);
        } else {
            await db.collection('patients').add(patientData);
        }

        showToast(`Patient "${name}" registered!`, 'success');
        closeModal('add-patient-modal');

        if (userId) {
            // Re-auth is needed since creating a user signs out the current one
            showToast('Please login again (Firebase auth changed).', 'info');
            setTimeout(() => { auth.signOut(); window.location.href = 'index.html'; }, 2000);
        } else {
            await loadPatients();
            updateRecStats();
        }
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Register Patient';
}

// =============================================
// Edit Patient
// =============================================
function openEditPatientModal(id) {
    const p = patients.find(x => x.id === id);
    if (!p) return;
    document.getElementById('edit-pt-id').value = id;
    document.getElementById('edit-pt-name').value = p.name || '';
    document.getElementById('edit-pt-age').value = p.age || '';
    document.getElementById('edit-pt-gender').value = p.gender || '';
    document.getElementById('edit-pt-contact').value = p.contact || '';
    document.getElementById('edit-patient-modal').classList.add('active');
}

async function handleEditPatient(e) {
    e.preventDefault();
    const id = document.getElementById('edit-pt-id').value;
    const name = document.getElementById('edit-pt-name').value.trim();
    const age = document.getElementById('edit-pt-age').value;
    const gender = document.getElementById('edit-pt-gender').value;
    const contact = document.getElementById('edit-pt-contact').value.trim();

    if (!name) { showToast('Name is required.', 'warning'); return; }

    try {
        await db.collection('patients').doc(id).update({
            name,
            age: age ? parseInt(age) : '',
            gender,
            contact
        });
        showToast('Patient updated!', 'success');
        closeModal('edit-patient-modal');
        await loadPatients();
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message, 'error');
    }
}

// =============================================
// Appointments Table
// =============================================
function renderAppointmentsTable(list) {
    const tbody = document.getElementById('appointments-tbody');
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:40px;color:var(--text-muted)">No appointments found.</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(a => {
        const patient = patients.find(p => p.id === a.patientId);
        const doctor = doctors.find(d => d.id === a.doctorId);
        const statusClass = a.status === 'Completed' ? 'badge-success' : a.status === 'Confirmed' ? 'badge-info' : 'badge-warning';
        return `
      <tr>
        <td>${esc(patient?.name || '—')}</td>
        <td>${esc(doctor?.name || '—')}</td>
        <td>${fmtDate(a.date)}</td>
        <td>${esc(a.reason || '—')}</td>
        <td><span class="badge ${statusClass}">${a.status || 'Pending'}</span></td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${a.status === 'Pending' ? `<button class="btn btn-secondary btn-sm" onclick="updateApptStatus('${a.id}','Confirmed')">Confirm</button>` : ''}
            ${a.status !== 'Completed' && a.status !== 'Cancelled' ? `<button class="btn btn-danger btn-sm" onclick="updateApptStatus('${a.id}','Cancelled')">Cancel</button>` : ''}
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

function filterAppointments() {
    const dateVal = document.getElementById('filter-appt-date').value;
    if (!dateVal) { renderAppointmentsTable(appointments); return; }
    const filtered = appointments.filter(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        return d.toISOString().split('T')[0] === dateVal;
    });
    renderAppointmentsTable(filtered);
}

// =============================================
// Book Appointment
// =============================================
function openBookApptModal() {
    document.getElementById('book-appt-form').reset();
    // Populate patient & doctor dropdowns
    const patientSel = document.getElementById('appt-patient');
    patientSel.innerHTML = '<option value="">Select Patient</option>' +
        patients.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

    const doctorSel = document.getElementById('appt-doctor');
    doctorSel.innerHTML = '<option value="">Select Doctor</option>' +
        doctors.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');

    document.getElementById('book-appt-modal').classList.add('active');
}

async function handleBookAppointment(e) {
    e.preventDefault();
    const patientId = document.getElementById('appt-patient').value;
    const doctorId = document.getElementById('appt-doctor').value;
    const date = document.getElementById('appt-date').value;
    const reason = document.getElementById('appt-reason').value.trim();

    if (!patientId || !doctorId || !date) {
        showToast('Please select patient, doctor, and date.', 'warning');
        return;
    }

    const btn = document.getElementById('book-appt-btn');
    btn.disabled = true;
    btn.textContent = 'Booking...';

    try {
        const selectedPatient = patients.find(p => p.id === patientId);
        const selectedDoctor = doctors.find(d => d.id === doctorId);

        await db.collection('appointments').add({
            patientId,
            patientName: selectedPatient?.name || '',
            doctorId,
            doctorName: selectedDoctor?.name || 'Doctor',
            date: new Date(date),
            reason,
            status: 'Pending',
            createdBy: window.currentUser?.uid || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Appointment booked!', 'success');
        closeModal('book-appt-modal');
        await loadAppointments();
        updateRecStats();
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Book Appointment';
}

// =============================================
// Update Appointment Status
// =============================================
async function updateApptStatus(id, status) {
    try {
        await db.collection('appointments').doc(id).update({ status });
        showToast(`Appointment ${status.toLowerCase()}.`, 'success');
        await loadAppointments();
        updateRecStats();
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message, 'error');
    }
}

// =============================================
// Daily Schedule
// =============================================
async function loadSchedule() {
    const dateVal = document.getElementById('schedule-date').value || todayStr();
    document.getElementById('schedule-date-label').textContent = new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    try {
        // Fetch all appointments to avoid indexing issues with combined filters
        const snap = await db.collection('appointments').get();
        const allAppts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const dayAppts = allAppts.filter(a => {
            const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            return d.toISOString().split('T')[0] === dateVal;
        }).sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return da - db2;
        });

        const container = document.getElementById('schedule-list');
        if (dayAppts.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🗓️</div><p>No appointments scheduled for this day.</p></div>`;
            return;
        }

        container.innerHTML = dayAppts.map(a => {
            const patient = patients.find(p => p.id === a.patientId);
            const doctor = doctors.find(d => d.id === a.doctorId);
            const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const statusClass = a.status === 'Completed' ? 'badge-success' : a.status === 'Confirmed' ? 'badge-info' : 'badge-warning';
            return `
      <div class="schedule-slot">
        <div class="schedule-time">${time}</div>
        <div class="schedule-details">
          <div class="schedule-patient">${esc(patient?.name || a.patientName || '—')}</div>
          <div class="schedule-doctor">Dr. ${esc(doctor?.name || a.doctorName || '—')} · ${esc(a.reason || 'General')}</div>
        </div>
        <span class="badge ${statusClass}">${a.status}</span>
      </div>
    `;
        }).join('');
    } catch (err) {
        console.error('Schedule Load Error:', err);
        showToast('Error loading schedule.', 'error');
    }
}

function renderSchedulePreview() {
    const today = todayStr();
    const todayAppts = appointments.filter(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        return d.toISOString().split('T')[0] === today;
    }).slice(0, 4);

    const container = document.getElementById('schedule-preview');
    if (todayAppts.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem">No appointments today.</p>`;
        return;
    }
    container.innerHTML = todayAppts.map(a => {
        const patient = patients.find(p => p.id === a.patientId);
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:0.88rem">
        <span>${esc(patient?.name || 'Patient')}</span>
        <span style="color:var(--primary-400)">${time}</span>
      </div>
    `;
    }).join('');
}

// =============================================
// Modals
// =============================================
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}
// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('active'); });
});

// =============================================
// Helpers
// =============================================
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function fmtDate(ts) {
    if (!ts) return '—';
    let date;
    if (ts.toDate) date = ts.toDate();
    else if (ts.seconds) date = new Date(ts.seconds * 1000);
    else date = new Date(ts);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
