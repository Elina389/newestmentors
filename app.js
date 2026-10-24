/**
 * Application Controller
 * Handles UI interactions and form management.
 *
 * Data goes to the AWS backend when config.js has an API_URL,
 * otherwise to localStorage (demo mode, this browser only).
 */

// Initialize matching system
const matchingSystem = new MatchingSystem();
if (!Api.enabled()) {
    matchingSystem.initializeSampleData();
}

// Show which mode the site is running in
(function showMode() {
    const badge = document.getElementById('modeBadge');
    if (!badge) return;
    badge.textContent = Api.enabled() ? 'Live' : 'Demo mode: data stays in this browser';
    badge.classList.add(Api.enabled() ? 'live' : 'demo');
})();

// Escape user-provided text before putting it in innerHTML
function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function list(value) {
    return Array.isArray(value) ? value.map(esc).join(', ') : esc(value);
}

// Checked values for a checkbox/radio group, scoped to ONE form
// (both forms use name="availableDays", so an unscoped query mixes them)
function checkedValues(formId, name) {
    return Array.from(
        document.querySelectorAll(`#${formId} input[name="${name}"]:checked`)
    ).map(cb => cb.value);
}

function showFormError(formId, message) {
    const box = document.querySelector(`#${formId} .form-error`);
    if (!box) return;
    if (message) {
        box.textContent = message;
        box.classList.remove('hidden');
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        box.textContent = '';
        box.classList.add('hidden');
    }
}

function setSubmitting(formId, isSubmitting) {
    const btn = document.querySelector(`#${formId} button[type="submit"]`);
    if (!btn) return;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.disabled = isSubmitting;
    btn.textContent = isSubmitting ? 'Submitting…' : btn.dataset.label;
}

// Show student survey
function showStudentSurvey() {
    document.getElementById('roleSelection').style.display = 'none';
    document.getElementById('studentForm').classList.add('active');
}

// Show mentor survey
function showMentorSurvey() {
    document.getElementById('roleSelection').style.display = 'none';
    document.getElementById('mentorForm').classList.add('active');
}

// Go back to role selection
function goBack() {
    document.getElementById('roleSelection').style.display = 'block';
    document.getElementById('studentForm').classList.remove('active');
    document.getElementById('mentorForm').classList.remove('active');
    document.getElementById('studentSuccess').classList.add('hidden');
    document.getElementById('mentorSuccess').classList.add('hidden');
    document.getElementById('matchesContainer').style.display = 'none';
    document.getElementById('studentForm').reset();
    document.getElementById('mentorForm').reset();
    showFormError('studentForm', '');
    showFormError('mentorForm', '');

    // Reset rating selections
    document.querySelectorAll('.rating-label').forEach(label => {
        label.classList.remove('selected');
    });
}

// Handle rating selection UI (the radio input itself is hidden by CSS)
document.querySelectorAll('.rating-label').forEach(label => {
    label.addEventListener('click', function () {
        const group = this.parentElement;
        group.querySelectorAll('.rating-label').forEach(l => l.classList.remove('selected'));
        this.classList.add('selected');
        const radio = this.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    });
});

// Student form submission
document.getElementById('studentForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showFormError('studentForm', '');

    const student = {
        name: document.getElementById('studentName').value.trim(),
        email: document.getElementById('studentEmail').value.trim(),
        major: document.getElementById('studentMajor').value,
        year: document.getElementById('studentYear').value,
        passion: document.getElementById('studentPassion').value.trim(),
        mentorStyle: document.getElementById('mentorStyle').value,
        meetingPreference: document.getElementById('meetingPreference').value,
        availableDays: checkedValues('studentForm', 'availableDays'),
        challenges: document.getElementById('studentChallenges').value.trim(),
        goals: document.getElementById('studentGoals').value.trim()
    };

    setSubmitting('studentForm', true);
    try {
        if (Api.enabled()) {
            await Api.submitStudent(student);
        } else {
            matchingSystem.saveStudent(student);
        }
        document.getElementById('studentForm').classList.remove('active');
        document.getElementById('studentSuccess').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        showFormError('studentForm', `Couldn't submit: ${err.message}. Please try again.`);
    } finally {
        setSubmitting('studentForm', false);
    }
});

// Mentor form submission
document.getElementById('mentorForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showFormError('mentorForm', '');

    const expertise = checkedValues('mentorForm', 'expertise');
    const canHelpWith = checkedValues('mentorForm', 'helpWith');
    const sjsuAlumnus = checkedValues('mentorForm', 'sjsuAlumnus')[0] || '';

    // Required checkbox/radio groups aren't enforced by the browser - check here
    if (expertise.length === 0) {
        showFormError('mentorForm', 'Please select at least one area of expertise.');
        return;
    }
    if (!sjsuAlumnus) {
        showFormError('mentorForm', 'Please tell us whether you are an SJSU alumnus.');
        return;
    }
    if (canHelpWith.length === 0) {
        showFormError('mentorForm', 'Please select at least one thing you can help students with.');
        return;
    }

    const mentor = {
        name: document.getElementById('mentorName').value.trim(),
        email: document.getElementById('mentorEmail').value.trim(),
        title: document.getElementById('mentorTitle').value.trim(),
        company: document.getElementById('mentorCompany').value.trim(),
        field: document.getElementById('mentorField').value,
        yearsExperience: document.getElementById('yearsExperience').value,
        expertise,
        bio: document.getElementById('mentorBio').value.trim(),
        degree: document.getElementById('mentorDegree').value,
        almaMater: document.getElementById('mentorAlmaMater').value.trim(),
        sjsuAlumnus,
        canHelpWith,
        menteeCapacity: document.getElementById('menteeCount').value,
        availability: document.getElementById('meetingAvailability').value,
        availableDays: checkedValues('mentorForm', 'availableDays'),
        mentorshipStyle: document.getElementById('mentorshipStyle').value,
        preferredMajors: checkedValues('mentorForm', 'preferredMajor'),
        motivation: document.getElementById('mentorMotivation').value.trim(),
        achievements: document.getElementById('mentorAchievements').value.trim(),
        additional: document.getElementById('mentorAdditional').value.trim()
    };

    setSubmitting('mentorForm', true);
    try {
        if (Api.enabled()) {
            await Api.submitMentor(mentor);
        } else {
            matchingSystem.saveMentor(mentor);
        }
        document.getElementById('mentorForm').classList.remove('active');
        document.getElementById('mentorSuccess').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        showFormError('mentorForm', `Couldn't register: ${err.message}. Please try again.`);
    } finally {
        setSubmitting('mentorForm', false);
    }
});

// Back to success message
function backToSuccess() {
    document.getElementById('matchesContainer').style.display = 'none';
    document.getElementById('mentorSuccess').classList.remove('hidden');
}

// Render one mentor card (public view: no email)
function mentorCard(mentor) {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
        <div class="match-header">
            <span class="match-name">${esc(mentor.name)}</span>
        </div>
        <div class="match-details">
            <p><strong>Title:</strong> ${esc(mentor.title)} at ${esc(mentor.company)}</p>
            <p><strong>Experience:</strong> ${esc(mentor.yearsExperience)}</p>
            <p><strong>Expertise:</strong> ${list(mentor.expertise)}</p>
            <p><strong>Can help with:</strong> ${list(mentor.canHelpWith)}</p>
            ${mentor.bio ? `<p><strong>Bio:</strong> ${esc(mentor.bio)}</p>` : ''}
            ${mentor.sjsuAlumnus === 'Yes' ? '<p style="color: var(--sjsu-blue);"><strong>🎓 SJSU Alumnus</strong></p>' : ''}
        </div>
    `;
    return card;
}

// View all mentors
async function viewAllMentors() {
    document.getElementById('mentorSuccess').classList.add('hidden');
    document.getElementById('matchesContainer').style.display = 'block';

    const matchesList = document.getElementById('matchesList');
    matchesList.innerHTML = '<p class="muted-center">Loading mentors…</p>';

    let mentors = [];
    try {
        mentors = Api.enabled()
            ? (await Api.listMentors()).mentors
            : matchingSystem.getAllMentors();
    } catch (err) {
        matchesList.innerHTML = `<p class="muted-center">Couldn't load mentors: ${esc(err.message)}</p>`;
        return;
    }

    matchesList.innerHTML = '';
    if (!mentors || mentors.length === 0) {
        matchesList.innerHTML = '<p class="muted-center">No mentors registered yet.</p>';
        return;
    }
    mentors.forEach(m => matchesList.appendChild(mentorCard(m)));
}
