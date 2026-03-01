// =============================================
// Doctor Dashboard Logic
// =============================================

requireAuth(['Doctor']);

// --- State ---
let myAppointments = [];
let myPatients = [];
let allPatientsData = [];
let myPrescriptions = [];
let doctorId = null;
let doctorDetails = null;

// --- Init ---
document.addEventListener('authReady', async (e) => {
    const user = e.detail;
    doctorId = user.uid;
    document.getElementById('doc-name').textContent = user.name || 'Doctor';
    document.getElementById('doc-avatar').textContent = (user.name || 'D').charAt(0).toUpperCase();

    await Promise.all([loadMyAppointments(), loadAllPatients(), loadMyPrescriptions(), loadDoctorProfile()]);
    updateDocStats();
    renderTodayAppointments();
    renderAppointmentsList(myAppointments);
    renderMyPatients(allPatientsData);
    populatePatientDropdown();
    renderRecentPrescriptions();
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
    const titles = { dashboard: 'Dashboard', appointments: 'My Appointments', patients: 'My Patients', prescriptions: 'Prescriptions', profile: 'My Profile' };
    document.getElementById('page-title').textContent = titles[page] || page;
    document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// =============================================
// Data Loading
// =============================================
async function loadMyAppointments() {
    try {
        console.log("Fetching appointments for doctor ID:", doctorId);
        const snap = await db.collection('appointments').where('doctorId', '==', doctorId).get();
        myAppointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log("Appointments found for doctor:", myAppointments.length);
        // Sort locally to avoid Firestore composite index requirement
        myAppointments.sort((a, b) => {
            const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dateB - dateA;
        });
    } catch (err) {
        console.error(err);
        showToast('Failed to load appointments.', 'error');
    }
}

async function loadDoctorProfile() {
    if (!doctorId) return;
    try {
        const doc = await db.collection('doctors').doc(doctorId).get();
        if (doc.exists) {
            doctorDetails = { id: doc.id, ...doc.data() };
        } else {
            // Fallback to basic user info
            doctorDetails = { id: doctorId, name: window.currentUser.name, email: window.currentUser.email };
        }
        renderDoctorProfile();
    } catch (err) {
        console.error('Error loading doctor profile:', err);
    }
}

function renderDoctorProfile() {
    if (!doctorDetails) return;
    document.getElementById('profile-name').textContent = 'Dr. ' + (doctorDetails.name || '—');
    document.getElementById('profile-specialization').textContent = doctorDetails.specialization || 'General Practitioner';
    document.getElementById('profile-email').textContent = doctorDetails.email || '';
    document.getElementById('profile-experience').textContent = (doctorDetails.experience || '0') + ' Years';
    document.getElementById('profile-contact').textContent = doctorDetails.contact || '—';
    document.getElementById('profile-bio').textContent = doctorDetails.bio || 'No biography provided.';
    document.getElementById('doc-profile-avatar').textContent = (doctorDetails.name || 'D').charAt(0).toUpperCase();
}

function openEditProfileModal() {
    if (!doctorDetails) return;
    document.getElementById('edit-name').value = doctorDetails.name || '';
    document.getElementById('edit-specialization').value = doctorDetails.specialization || '';
    document.getElementById('edit-experience').value = doctorDetails.experience || '';
    document.getElementById('edit-contact').value = doctorDetails.contact || '';
    document.getElementById('edit-bio').value = doctorDetails.bio || '';
    document.getElementById('edit-profile-modal').classList.add('active');
}

async function handleEditProfile(e) {
    e.preventDefault();
    const name = document.getElementById('edit-name').value.trim();
    const spec = document.getElementById('edit-specialization').value.trim();
    const exp = document.getElementById('edit-experience').value;
    const contact = document.getElementById('edit-contact').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();

    if (!name) { showToast('Name is required.', 'warning'); return; }

    const btn = document.getElementById('edit-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const batch = db.batch();
        const docRef = db.collection('doctors').doc(doctorId);
        const userRef = db.collection('users').doc(doctorId);

        const updateData = {
            name: name,
            specialization: spec,
            experience: exp,
            contact: contact,
            bio: bio
        };

        batch.set(docRef, updateData, { merge: true });
        batch.update(userRef, { name: name });

        await batch.commit();

        doctorDetails = { ...doctorDetails, ...updateData };
        window.currentUser.name = name;

        renderDoctorProfile();
        document.getElementById('doc-name').textContent = name;
        document.getElementById('doc-avatar').textContent = name.charAt(0).toUpperCase();

        showToast('Profile updated successfully!', 'success');
        closeModal('edit-profile-modal');
    } catch (err) {
        console.error('Failed to update doctor profile:', err);
        showToast('Error updating profile: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
}

async function loadAllPatients() {
    try {
        const snap = await db.collection('patients').get();
        allPatientsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Derive "my patients" — patients that have appointments with this doctor
        const myPatientIds = [...new Set(myAppointments.map(a => a.patientId))];
        myPatients = allPatientsData.filter(p => myPatientIds.includes(p.id));
    } catch (err) {
        console.error(err);
    }
}

async function loadMyPrescriptions() {
    try {
        const snap = await db.collection('prescriptions').where('doctorId', '==', doctorId).get();
        myPrescriptions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort locally
        myPrescriptions.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            return dateB - dateA;
        });
    } catch (err) {
        console.error(err);
    }
}

// =============================================
// Stats
// =============================================
function updateDocStats() {
    const today = todayStr();
    const todayAppts = myAppointments.filter(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        return d.toISOString().split('T')[0] === today;
    });
    document.getElementById('stat-today').textContent = todayAppts.length;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyAppts = myAppointments.filter(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        return d >= monthStart;
    });
    document.getElementById('stat-monthly').textContent = monthlyAppts.length;
    document.getElementById('stat-prescriptions').textContent = myPrescriptions.length;
}

// =============================================
// Today's Appointments
// =============================================
function renderTodayAppointments() {
    const today = todayStr();
    const todayAppts = myAppointments.filter(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        return d.toISOString().split('T')[0] === today;
    }).sort((a, b) => {
        const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return da - db2;
    });

    const container = document.getElementById('today-appointments');
    if (todayAppts.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><p>No appointments for today.</p></div>`;
        return;
    }

    container.innerHTML = todayAppts.map(a => {
        const patient = allPatientsData.find(p => p.id === a.patientId);
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const statusClass = a.status === 'Completed' ? 'badge-success' : a.status === 'Confirmed' ? 'badge-info' : 'badge-warning';
        const pName = patient?.name || a.patientName || 'Patient';
        return `
      <div class="appt-card">
        <div class="appt-card-avatar">${pName.charAt(0).toUpperCase()}</div>
        <div class="appt-card-info">
          <h4>${esc(pName)}</h4>
          <p>${time} · ${esc(a.reason || 'General Visit')}</p>
        </div>
        <span class="badge ${statusClass}">${a.status || 'Pending'}</span>
        <div class="appt-card-actions">
          ${a.status !== 'Completed' ? `<button class="btn btn-primary btn-sm" onclick="markComplete('${a.id}')">Complete</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="viewPatientDetail('${a.patientId}')">View</button>
        </div>
      </div>
    `;
    }).join('');
}

// =============================================
// All Appointments
// =============================================
function renderAppointmentsList(list) {
    const container = document.getElementById('appointments-list');
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:40px"><div class="empty-state-icon">📅</div><p>No appointments found.</p></div>`;
        return;
    }
    container.innerHTML = list.map(a => {
        const patient = allPatientsData.find(p => p.id === a.patientId);
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const statusClass = a.status === 'Completed' ? 'badge-success' : a.status === 'Confirmed' ? 'badge-info' : 'badge-warning';
        const pName = patient?.name || a.patientName || 'Patient';
        return `
      <div class="appt-card">
        <div class="appt-card-avatar">${pName.charAt(0).toUpperCase()}</div>
        <div class="appt-card-info">
          <h4>${esc(pName)}</h4>
          <p>${dateStr} · ${time} · ${esc(a.reason || 'General')}</p>
        </div>
        <span class="badge ${statusClass}">${a.status || 'Pending'}</span>
        <div class="appt-card-actions">
          ${a.status !== 'Completed' ? `<button class="btn btn-primary btn-sm" onclick="markComplete('${a.id}')">Complete</button>` : ''}
        </div>
      </div>
    `;
    }).join('');
}

function filterMyAppointments() {
    const status = document.getElementById('appt-status-filter').value;
    const filtered = status ? myAppointments.filter(a => a.status === status) : myAppointments;
    renderAppointmentsList(filtered);
}

async function markComplete(apptId) {
    try {
        await db.collection('appointments').doc(apptId).update({ status: 'Completed' });
        showToast('Appointment marked as completed.', 'success');
        await loadMyAppointments();
        updateDocStats();
        renderTodayAppointments();
        renderAppointmentsList(myAppointments);
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message, 'error');
    }
}

// =============================================
// My Patients
// =============================================
function renderMyPatients(list) {
    const container = document.getElementById('my-patients-list');
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:40px"><div class="empty-state-icon">👥</div><p>No patients found.</p></div>`;
        return;
    }
    container.innerHTML = '<div class="grid grid-3">' + list.map(p => `
    <div class="glass-card" style="cursor:pointer;padding:var(--spacing-md)" onclick="viewPatientDetail('${p.id}')">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="appt-card-avatar" style="width:40px;height:40px;font-size:0.9rem">${(p.name || 'P').charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-weight:600;font-size:0.92rem">${esc(p.name)}</div>
          <div style="font-size:0.8rem;color:var(--text-muted)">${p.gender || ''} ${p.age ? '· ' + p.age + ' yrs' : ''}</div>
        </div>
      </div>
    </div>
  `).join('') + '</div>';
}

function filterMyPatients() {
    const q = document.getElementById('search-my-patients').value.toLowerCase();
    const filtered = allPatientsData.filter(p =>
        p.name?.toLowerCase().includes(q) || p.contact?.toLowerCase().includes(q)
    );
    renderMyPatients(filtered);
}

// =============================================
// Patient Detail + Medical History Timeline
// =============================================
async function viewPatientDetail(patientId) {
    const patient = allPatientsData.find(p => p.id === patientId);
    if (!patient) { showToast('Patient not found.', 'error'); return; }

    document.getElementById('detail-avatar').textContent = (patient.name || 'P').charAt(0).toUpperCase();
    document.getElementById('detail-name').textContent = patient.name || '—';
    document.getElementById('detail-email').textContent = patient.email || '';
    document.getElementById('detail-age').textContent = patient.age || '—';
    document.getElementById('detail-gender').textContent = patient.gender || '—';
    document.getElementById('detail-contact').textContent = patient.contact || '—';

    document.getElementById('patient-detail-panel').style.display = 'block';
    document.getElementById('patient-detail-panel').scrollIntoView({ behavior: 'smooth' });

    // Build timeline from appointments, prescriptions, and diagnosis logs
    const timeline = [];

    // Appointments for this patient with this doctor
    const patientAppts = myAppointments.filter(a => a.patientId === patientId);
    patientAppts.forEach(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        timeline.push({
            type: 'appointment',
            date: d,
            title: 'Appointment — ' + (a.status || 'Pending'),
            detail: a.reason || 'General visit'
        });
    });

    // Prescriptions for this patient by this doctor
    const patientRx = myPrescriptions.filter(r => r.patientId === patientId);
    patientRx.forEach(r => {
        const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
        const meds = (r.medicines || []).map(m => m.name).join(', ');
        timeline.push({
            type: 'prescription',
            date: d,
            title: 'Prescription',
            detail: meds || 'No medicines listed'
        });
    });

    // Sort descending by date
    timeline.sort((a, b) => b.date - a.date);

    const container = document.getElementById('patient-timeline');
    if (timeline.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No medical history for this patient.</p></div>`;
        return;
    }

    container.innerHTML = timeline.map(t => `
    <div class="timeline-item">
      <div class="timeline-dot ${t.type}"></div>
      <div class="timeline-date">${t.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
      <div class="timeline-content">
        <h4>${t.title}</h4>
        <p>${esc(t.detail)}</p>
      </div>
    </div>
  `).join('');
}

function closePatientDetail() {
    document.getElementById('patient-detail-panel').style.display = 'none';
}

// =============================================
// Prescription Form
// =============================================
function populatePatientDropdown() {
    const sel = document.getElementById('rx-patient');
    sel.innerHTML = '<option value="">Select Patient</option>' +
        allPatientsData.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
}

function addMedicineRow() {
    const container = document.getElementById('medicines-container');
    const row = document.createElement('div');
    row.className = 'medicine-row';
    row.innerHTML = `
    <div class="form-group" style="margin-bottom:0">
      <input type="text" class="form-input" placeholder="Medicine name" required />
    </div>
    <div class="form-group" style="margin-bottom:0">
      <input type="text" class="form-input" placeholder="Dosage" />
    </div>
    <div class="form-group" style="margin-bottom:0">
      <input type="text" class="form-input" placeholder="Instructions" />
    </div>
    <button type="button" class="btn btn-danger btn-icon" onclick="removeMedicineRow(this)" title="Remove">✕</button>
  `;
    container.appendChild(row);
}

function removeMedicineRow(btn) {
    const container = document.getElementById('medicines-container');
    if (container.children.length > 1) {
        btn.closest('.medicine-row').remove();
    } else {
        showToast('At least one medicine is required.', 'warning');
    }
}

async function handleCreatePrescription(e) {
    e.preventDefault();
    const patientId = document.getElementById('rx-patient').value;
    const diagnosis = document.getElementById('rx-diagnosis').value.trim();
    const notes = document.getElementById('rx-notes').value.trim();

    if (!patientId) { showToast('Please select a patient.', 'warning'); return; }

    // Gather medicines
    const rows = document.querySelectorAll('#medicines-container .medicine-row');
    const medicines = [];
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const name = inputs[0].value.trim();
        const dosage = inputs[1].value.trim();
        const instruction = inputs[2].value.trim();
        if (name) medicines.push({ name, dosage, instruction });
    });

    if (medicines.length === 0) { showToast('Add at least one medicine.', 'warning'); return; }

    const btn = document.getElementById('rx-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        await db.collection('prescriptions').add({
            patientId,
            doctorId,
            diagnosis,
            medicines,
            notes,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Also log to diagnosisLogs if diagnosis is present
        if (diagnosis) {
            await db.collection('diagnosisLogs').add({
                patientId,
                doctorId,
                symptoms: diagnosis,
                aiResponse: '',
                riskLevel: 'Low',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        showToast('Prescription created successfully!', 'success');
        document.getElementById('prescription-form').reset();
        // Reset medicine rows to just one
        document.getElementById('medicines-container').innerHTML = `
      <div class="medicine-row">
        <div class="form-group" style="margin-bottom:0"><input type="text" class="form-input" placeholder="Medicine name" required /></div>
        <div class="form-group" style="margin-bottom:0"><input type="text" class="form-input" placeholder="Dosage" /></div>
        <div class="form-group" style="margin-bottom:0"><input type="text" class="form-input" placeholder="Instructions" /></div>
        <button type="button" class="btn btn-danger btn-icon" onclick="removeMedicineRow(this)" title="Remove">✕</button>
      </div>
    `;

        await loadMyPrescriptions();
        updateDocStats();
        renderRecentPrescriptions();
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Create Prescription';
}

// =============================================
// Recent Prescriptions
// =============================================
function renderRecentPrescriptions() {
    const container = document.getElementById('recent-prescriptions');
    if (myPrescriptions.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💊</div><p>No prescriptions issued yet.</p></div>`;
        return;
    }
    container.innerHTML = myPrescriptions.slice(0, 10).map(rx => {
        const patient = allPatientsData.find(p => p.id === rx.patientId);
        const date = rx.createdAt?.toDate ? rx.createdAt.toDate() : new Date(rx.createdAt);
        const meds = (rx.medicines || []).map(m => `${m.name} (${m.dosage || '—'})`).join(', ');
        return `
      <div class="glass-card" style="margin-bottom:var(--spacing-sm);padding:var(--spacing-md)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600;font-size:0.92rem">${esc(patient?.name || 'Patient')}</div>
            <div style="font-size:0.82rem;color:var(--text-muted)">${meds || 'No medicines'}</div>
            ${rx.diagnosis ? `<div style="font-size:0.82rem;color:var(--primary-400);margin-top:2px">Dx: ${esc(rx.diagnosis)}</div>` : ''}
          </div>
          <small style="color:var(--text-muted);flex-shrink:0">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small>
        </div>
      </div>
    `;
    }).join('');
}

// =============================================
// Helpers
// =============================================
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function (e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

// Escape key to close modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});
