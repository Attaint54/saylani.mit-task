// =============================================
// Patient Dashboard Logic
// =============================================

requireAuth(['Patient']);

// --- State ---
let patientData = null;
let patientAppts = [];
let patientRx = [];
let doctorsMap = {};

// --- Init ---
document.addEventListener('authReady', async (e) => {
    const user = e.detail;
    document.getElementById('pt-name').textContent = user.name || 'Patient';
    document.getElementById('pt-avatar').textContent = (user.name || 'P').charAt(0).toUpperCase();

    await Promise.all([loadPatientProfile(), loadDoctors()]);
    await Promise.all([loadPatientAppointments(), loadPatientPrescriptions()]);
    updatePatientStats();
    renderPatientAppts();
    renderPatientPrescriptions();
    renderMedicalTimeline();
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
    const titles = { profile: 'My Profile', appointments: 'Appointments', prescriptions: 'Prescriptions', history: 'Medical History' };
    document.getElementById('page-title').textContent = titles[page] || page;
    document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// =============================================
// Data Loading
// =============================================
async function loadPatientProfile() {
    const uid = window.currentUser.uid;
    try {
        const doc = await db.collection('patients').doc(uid).get();
        if (doc.exists) {
            patientData = { id: doc.id, ...doc.data() };
        } else {
            // Maybe patient was created without matching doc id, search by userId
            const snap = await db.collection('patients').where('userId', '==', uid).limit(1).get();
            if (!snap.empty) {
                patientData = { id: snap.docs[0].id, ...snap.docs[0].data() };
            } else {
                // Use auth user data as fallback
                patientData = { id: uid, name: window.currentUser.name, email: window.currentUser.email };
            }
        }
        renderProfile();
    } catch (err) {
        console.error(err);
        showToast('Failed to load profile.', 'error');
    }
}

async function loadDoctors() {
    try {
        const snap = await db.collection('users').where('role', '==', 'Doctor').get();
        snap.docs.forEach(d => { doctorsMap[d.id] = d.data(); });
    } catch (err) { console.error(err); }
}

async function loadPatientAppointments() {
    if (!patientData) return;
    try {
        const snap = await db.collection('appointments').where('patientId', '==', patientData.id).orderBy('date', 'desc').get();
        patientAppts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error(err);
        showToast('Failed to load appointments.', 'error');
    }
}

async function loadPatientPrescriptions() {
    if (!patientData) return;
    try {
        const snap = await db.collection('prescriptions').where('patientId', '==', patientData.id).orderBy('createdAt', 'desc').get();
        patientRx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error(err);
        showToast('Failed to load prescriptions.', 'error');
    }
}

// =============================================
// Profile Rendering
// =============================================
function renderProfile() {
    if (!patientData) return;
    document.getElementById('profile-avatar').textContent = (patientData.name || 'P').charAt(0).toUpperCase();
    document.getElementById('profile-name').textContent = patientData.name || '—';
    document.getElementById('profile-email').textContent = patientData.email || window.currentUser.email || '';
    document.getElementById('profile-age').textContent = patientData.age || '—';
    document.getElementById('profile-gender').textContent = patientData.gender || '—';
    document.getElementById('profile-contact').textContent = patientData.contact || '—';
    const joined = patientData.createdAt?.toDate ? patientData.createdAt.toDate() : null;
    document.getElementById('profile-joined').textContent = joined ? joined.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '—';
}

// =============================================
// Stats
// =============================================
function updatePatientStats() {
    document.getElementById('stat-appts').textContent = patientAppts.length;
    document.getElementById('stat-rx').textContent = patientRx.length;

    // Next upcoming appointment
    const now = new Date();
    const upcoming = patientAppts.filter(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        return d >= now && a.status !== 'Cancelled';
    }).sort((a, b) => {
        const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return da - db2;
    });

    if (upcoming.length > 0) {
        const nextDate = upcoming[0].date?.toDate ? upcoming[0].date.toDate() : new Date(upcoming[0].date);
        document.getElementById('stat-next').textContent = nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
        document.getElementById('stat-next').textContent = 'None';
    }
}

// =============================================
// Appointments
// =============================================
function renderPatientAppts() {
    const container = document.getElementById('patient-appointments');
    if (patientAppts.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><p>No appointments yet.</p></div>`;
        return;
    }
    container.innerHTML = patientAppts.map(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const doctor = doctorsMap[a.doctorId];
        const statusClass = a.status === 'Completed' ? 'badge-success' : a.status === 'Confirmed' ? 'badge-info' : a.status === 'Cancelled' ? 'badge-danger' : 'badge-warning';
        return `
      <div class="history-card">
        <div class="history-date">${dateStr}</div>
        <div class="history-info">
          <h4>Dr. ${esc(doctor?.name || 'Doctor')}</h4>
          <p>${time} · ${esc(a.reason || 'General Visit')}</p>
        </div>
        <span class="badge ${statusClass}">${a.status || 'Pending'}</span>
      </div>
    `;
    }).join('');
}

// =============================================
// Prescriptions
// =============================================
function renderPatientPrescriptions() {
    const container = document.getElementById('patient-prescriptions');
    if (patientRx.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💊</div><p>No prescriptions yet.</p></div>`;
        return;
    }
    container.innerHTML = patientRx.map(rx => {
        const d = rx.createdAt?.toDate ? rx.createdAt.toDate() : new Date(rx.createdAt);
        const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const doctor = doctorsMap[rx.doctorId];
        const medsHtml = (rx.medicines || []).map(m => `
      <div class="rx-med-item">
        <span class="med-name">💊 ${esc(m.name)}</span>
        <span class="med-dosage">${esc(m.dosage || '')}</span>
        <span class="med-instr">${esc(m.instruction || '')}</span>
      </div>
    `).join('');

        return `
      <div class="rx-card glass-card fade-in">
        <div class="rx-card-header">
          <div>
            <h4>Prescription by Dr. ${esc(doctor?.name || 'Doctor')}</h4>
            ${rx.diagnosis ? `<p style="font-size:0.82rem;color:var(--primary-400);margin-top:2px">Diagnosis: ${esc(rx.diagnosis)}</p>` : ''}
          </div>
          <small>${dateStr}</small>
        </div>
        <div class="rx-medicines">${medsHtml || '<p style="color:var(--text-muted)">No medicines listed.</p>'}</div>
        ${rx.notes ? `<div class="rx-notes">📝 ${esc(rx.notes)}</div>` : ''}
        <div style="margin-top:var(--spacing-md)">
          <button class="btn btn-primary btn-sm" onclick="downloadPrescriptionPDF('${rx.id}')">📥 Download PDF</button>
        </div>
      </div>
    `;
    }).join('');
}

// =============================================
// Medical History Timeline
// =============================================
function renderMedicalTimeline() {
    const container = document.getElementById('medical-timeline');
    const timeline = [];

    patientAppts.forEach(a => {
        const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const doctor = doctorsMap[a.doctorId];
        timeline.push({
            type: 'appointment',
            date: d,
            title: `Appointment with Dr. ${doctor?.name || 'Doctor'} — ${a.status || 'Pending'}`,
            detail: a.reason || 'General visit'
        });
    });

    patientRx.forEach(r => {
        const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
        const doctor = doctorsMap[r.doctorId];
        const meds = (r.medicines || []).map(m => m.name).join(', ');
        timeline.push({
            type: 'prescription',
            date: d,
            title: `Prescription by Dr. ${doctor?.name || 'Doctor'}`,
            detail: meds || 'No medicines'
        });
    });

    timeline.sort((a, b) => b.date - a.date);

    if (timeline.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><p>No medical history yet.</p></div>`;
        return;
    }

    // Add the ::before pseudo-element line via inline style on the container
    container.style.position = 'relative';

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

// =============================================
// PDF Download
// =============================================
function downloadPrescriptionPDF(rxId) {
    const rx = patientRx.find(r => r.id === rxId);
    if (!rx) { showToast('Prescription not found.', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const doctor = doctorsMap[rx.doctorId];
    const d = rx.createdAt?.toDate ? rx.createdAt.toDate() : new Date(rx.createdAt);

    // Header
    doc.setFillColor(15, 191, 165);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('MedVault Clinic', 15, 18);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Digital Prescription', 15, 27);
    doc.text('Date: ' + d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 140, 27);

    // Patient & Doctor Info
    doc.setTextColor(51, 51, 51);
    let y = 48;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Patient:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(patientData?.name || '—', 45, y);

    y += 8;
    doc.setFont(undefined, 'bold');
    doc.text('Doctor:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text('Dr. ' + (doctor?.name || '—'), 45, y);

    if (rx.diagnosis) {
        y += 8;
        doc.setFont(undefined, 'bold');
        doc.text('Diagnosis:', 15, y);
        doc.setFont(undefined, 'normal');
        doc.text(rx.diagnosis, 50, y);
    }

    // Separator
    y += 12;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, 195, y);
    y += 10;

    // Medicines header
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('Prescribed Medicines', 15, y);
    y += 8;

    // Medicines table header
    doc.setFillColor(240, 240, 240);
    doc.rect(15, y - 4, 180, 8, 'F');
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('#', 18, y + 1);
    doc.text('Medicine', 28, y + 1);
    doc.text('Dosage', 100, y + 1);
    doc.text('Instructions', 140, y + 1);
    y += 10;

    // Medicines
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    (rx.medicines || []).forEach((m, i) => {
        doc.text(String(i + 1), 18, y);
        doc.text(m.name || '—', 28, y);
        doc.text(m.dosage || '—', 100, y);
        doc.text(m.instruction || '—', 140, y);
        y += 8;
        if (y > 270) { doc.addPage(); y = 20; }
    });

    // Notes
    if (rx.notes) {
        y += 8;
        doc.setDrawColor(200, 200, 200);
        doc.line(15, y, 195, y);
        y += 10;
        doc.setFont(undefined, 'bold');
        doc.text('Notes:', 15, y);
        y += 7;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(rx.notes, 170);
        doc.text(lines, 15, y);
        y += lines.length * 5;
    }

    // Footer
    y = Math.max(y + 20, 250);
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, 195, y);
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('This is a digitally generated prescription from MedVault Clinic Management System.', 15, y);
    doc.text('Generated on: ' + new Date().toLocaleString(), 15, y + 5);

    // Save
    const filename = `prescription_${patientData?.name?.replace(/\s+/g, '_') || 'patient'}_${d.toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    showToast('Prescription PDF downloaded!', 'success');
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

// =============================================
// Appointment Booking
// =============================================
function openBookingModal() {
    const select = document.getElementById('book-doctor');
    // Reset form
    document.getElementById('booking-form').reset();
    // Populate doctors dropdown
    select.innerHTML = '<option value="">— Choose a doctor —</option>';
    Object.entries(doctorsMap).forEach(([id, doc]) => {
        select.innerHTML += `<option value="${id}">Dr. ${esc(doc.name)}</option>`;
    });
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('book-date').setAttribute('min', today);
    document.getElementById('booking-modal').classList.add('active');
}

function closeBookingModal() {
    document.getElementById('booking-modal').classList.remove('active');
}

async function handleBookAppointment(e) {
    e.preventDefault();
    const doctorId = document.getElementById('book-doctor').value;
    const date = document.getElementById('book-date').value;
    const time = document.getElementById('book-time').value;
    const reason = document.getElementById('book-reason').value.trim();

    if (!doctorId || !date || !time) {
        showToast('Please fill all required fields.', 'warning');
        return;
    }

    const btn = document.getElementById('book-btn');
    btn.disabled = true;
    btn.textContent = 'Booking...';

    try {
        const dateTime = new Date(`${date}T${time}`);
        await db.collection('appointments').add({
            patientId: patientData.id,
            patientName: patientData.name || '',
            doctorId: doctorId,
            doctorName: doctorsMap[doctorId]?.name || '',
            date: firebase.firestore.Timestamp.fromDate(dateTime),
            reason: reason || 'General Visit',
            status: 'Pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('Appointment booked successfully!', 'success');
        closeBookingModal();

        // Reload appointments and refresh UI
        await loadPatientAppointments();
        updatePatientStats();
        renderPatientAppts();
        renderMedicalTimeline();
    } catch (err) {
        console.error(err);
        showToast('Failed to book appointment. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm Appointment';
    }
}

// Close modal when clicking outside
document.getElementById('booking-modal')?.addEventListener('click', function(e) {
    if (e.target === this) closeBookingModal();
});

