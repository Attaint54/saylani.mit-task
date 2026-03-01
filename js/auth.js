// =============================================
// Authentication & Session Management
// =============================================

// --- Toast Helper ---
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <span style="font-size:1.1rem">${type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}</span>
    <span>${message}</span>
  `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// --- Loading Overlay ---
function showLoading() {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `<div class="spinner spinner-lg"></div><p style="color:var(--text-secondary)">Loading...</p>`;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

// --- Login ---
async function loginUser(email, password) {
    try {
        showLoading();
        const cred = await auth.signInWithEmailAndPassword(email, password);
        const uid = cred.user.uid;

        // Fetch user role from Firestore
        let userDoc = await db.collection('users').doc(uid).get();
        let role = 'Patient';

        if (!userDoc.exists) {
            // Auto-create as Patient if missing
            await db.collection('users').doc(uid).set({
                uid: uid,
                name: cred.user.displayName || 'New Patient',
                email: cred.user.email,
                role: 'Patient',
                subscriptionPlan: 'Free',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // Also ensure patient record exists
            await db.collection('patients').doc(uid).set({
                name: cred.user.displayName || 'New Patient',
                email: cred.user.email,
                age: '', gender: '', contact: '',
                userId: uid, createdBy: uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } else {
            const userData = userDoc.data();
            role = userData.role || 'Patient';
        }

        // Redirect based on role
        switch (role) {
            case 'Admin':
                window.location.href = 'admin.html';
                break;
            case 'Doctor':
                window.location.href = 'doctor.html';
                break;
            case 'Receptionist':
                window.location.href = 'receptionist.html';
                break;
            case 'Patient':
                window.location.href = 'patient.html';
                break;
            default:
                showToast('Unknown role: ' + role, 'error');
                await auth.signOut();
        }
        hideLoading();
    } catch (err) {
        hideLoading();
        console.error('Login error:', err);
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            showToast('Invalid email or password.', 'error');
        } else if (err.code === 'auth/too-many-requests') {
            showToast('Too many attempts. Try again later.', 'warning');
        } else {
            showToast(err.message, 'error');
        }
    }
}

// --- Register (Admin creates staff; also used for patient self-registration) ---
async function registerUser(name, email, password, role, gender = '') {
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name }); // Save name to Firebase Auth
        const uid = cred.user.uid;

        await db.collection('users').doc(uid).set({
            uid: uid,
            name: name,
            email: email,
            role: role,
            gender: gender,
            subscriptionPlan: 'Free',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Also save to specialized collections to maintain separate lists if needed
        const baseData = {
            name: name,
            email: email,
            gender: gender,
            userId: uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (role === 'Doctor') {
            await db.collection('doctors').doc(uid).set(baseData);
        } else if (role === 'Receptionist') {
            await db.collection('receptionists').doc(uid).set(baseData);
        }

        return { success: true, uid: uid };
    } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 'auth/email-already-in-use') {
            showToast('Email already registered.', 'error');
        } else if (err.code === 'auth/weak-password') {
            showToast('Password must be at least 6 characters.', 'warning');
        } else {
            showToast(err.message, 'error');
        }
        return { success: false, error: err.message };
    }
}

// --- Logout ---
async function logoutUser() {
    try {
        await auth.signOut();
        window.location.href = 'index.html';
    } catch (err) {
        showToast('Logout failed: ' + err.message, 'error');
    }
}

// --- Auth Guard: Protect dashboard pages ---
function requireAuth(allowedRoles = []) {
    showLoading();
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        try {
            let userDoc = await db.collection('users').doc(user.uid).get();
            let userData = {};

            if (!userDoc.exists) {
                // Check if a patient record already exists with this email (created by receptionist)
                const patientSnap = await db.collection('patients').where('email', '==', user.email).limit(1).get();

                userData = {
                    uid: user.uid,
                    name: user.displayName || 'New Patient',
                    email: user.email,
                    role: 'Patient',
                    subscriptionPlan: 'Free',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (!patientSnap.empty) {
                    // Update existing patient record with the UID
                    const existingPt = patientSnap.docs[0];
                    userData.name = existingPt.data().name || userData.name;
                    await db.collection('patients').doc(existingPt.id).update({
                        userId: user.uid
                    });
                } else {
                    // Create new patient record linked to UID
                    await db.collection('patients').doc(user.uid).set({
                        name: user.displayName || 'New Patient',
                        email: user.email,
                        age: '', gender: '', contact: '',
                        userId: user.uid, createdBy: user.uid,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }

                await db.collection('users').doc(user.uid).set(userData);
            } else {
                userData = userDoc.data();
            }

            if (!userData.role) userData.role = 'Patient';

            if (allowedRoles.length > 0 && !allowedRoles.includes(userData.role)) {
                showToast('Access denied for your role.', 'error');
                await auth.signOut();
                window.location.href = 'index.html';
                return;
            }

            // Store current user data globally so page scripts can use it
            window.currentUser = { uid: user.uid, ...userData };
            hideLoading();

            // Trigger a custom event so the page script knows auth is ready
            document.dispatchEvent(new CustomEvent('authReady', { detail: window.currentUser }));
        } catch (err) {
            console.error('Auth guard error:', err);
            hideLoading();
            showToast('Session error. Please login again.', 'error');
            await auth.signOut();
            window.location.href = 'index.html';
        }
    });
}

// --- Get Current User Data (Promise-based) ---
function getCurrentUser() {
    return new Promise((resolve, reject) => {
        if (window.currentUser) {
            resolve(window.currentUser);
            return;
        }
        document.addEventListener('authReady', (e) => {
            resolve(e.detail);
        }, { once: true });
        // Timeout after 10s
        setTimeout(() => reject(new Error('Auth timeout')), 10000);
    });
}
