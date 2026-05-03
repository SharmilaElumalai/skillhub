const API_BASE = "http://127.0.0.1:5000";
/** All REST endpoints live under /api (matches Flask routes exactly). */
const API_ROOT = `${API_BASE}/api`;

const FORGOT_MESSAGE = "If email exists, reset link sent";

const CATEGORY_LABELS = {
    technology: "Technology",
    business: "Business",
    design: "Design",
    marketing: "Marketing",
    data: "Data Science",
    other: "Other",
};

const PAGE_TITLES = {
    dashboard: "Dashboard",
    learner: "Learner Management",
    verifier: "Verifier Management",
    collaborator: "Collaborator",
    opportunity: "Opportunity Management",
    reports: "Reports and Analytics",
};

const captchas = { login: "", signup: "", forgot: "" };

function apiUrl(path) {
    if (path.startsWith("http")) return path;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${API_ROOT}${suffix}`;
}

/**
 * Expects JSON: { "status": "success", "data": { ... } } or { "status": "error", "message": "..." }.
 * Returns the inner `data` object on success (never raw HTML).
 */
async function apiRequest(path, options = {}) {
    const res = await fetch(apiUrl(path), {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });
    const json = await res.json().catch(() => ({}));
    if (json.status === "error" || !res.ok) {
        const err = new Error(
            json.message || json.error || res.statusText || "Request failed"
        );
        err.status = res.status;
        err.body = json;
        throw err;
    }
    if (json.status !== "success") {
        const err = new Error("Unexpected response from server.");
        err.status = res.status;
        err.body = json;
        throw err;
    }
    return json.data;
}

function escapeHtml(s) {
    if (s == null) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function shakeForm(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("shake");
    setTimeout(() => el.classList.remove("shake"), 400);
}

function showToast(msg) {
    const el = document.getElementById("toastMsg");
    const toast = document.getElementById("toast");
    if (el) el.textContent = msg;
    if (toast) {
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
    }
}

function formatDisplayDate(isoYmd) {
    if (!isoYmd) return "";
    const d = new Date(isoYmd + "T12:00:00");
    if (Number.isNaN(d.getTime())) return isoYmd;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function truncateText(text, max) {
    const t = (text || "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1).trim() + "…";
}

function showAuthView() {
    document.getElementById("authWrapper")?.classList.remove("hidden");
    document.getElementById("dashboardWrapper")?.classList.remove("active");
}

function showDashboardView() {
    document.getElementById("authWrapper")?.classList.add("hidden");
    document.getElementById("dashboardWrapper")?.classList.add("active");
}

function updateProfileHeader(user) {
    const nameEl = document.getElementById("dashName");
    const av = document.getElementById("dashAvatar");
    if (nameEl) nameEl.textContent = user.full_name || "Admin";
    if (av) {
        const parts = (user.full_name || "A D").split(/\s+/).filter(Boolean);
        const ini = (parts[0]?.[0] || "A") + (parts[1]?.[0] || "");
        av.textContent = ini.toUpperCase().slice(0, 2);
    }
}

function generateCaptcha(type) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    captchas[type] = code;
    const el = document.getElementById(type + "CaptchaText");
    if (el) el.textContent = code;
}

function renderOpportunityCards(opportunities) {
    const empty = document.getElementById("opportunitiesEmptyState");
    const host = document.getElementById("opportunitiesCards");
    if (!host) return;

    if (!opportunities || opportunities.length === 0) {
        host.innerHTML = "";
        if (empty) empty.style.display = "";
        return;
    }
    if (empty) empty.style.display = "none";

    const metaSvgTime = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const metaSvgCal = `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

    host.innerHTML = opportunities
        .map((opp) => {
            const skills = (opp.skills || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            const tagHtml = skills
                .slice(0, 6)
                .map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`)
                .join("");
            const maxLine =
                opp.max_applicants != null
                    ? `<span class="applicants-count">Max ${escapeHtml(String(opp.max_applicants))} applicants</span>`
                    : `<span class="applicants-count"></span>`;
            return `
        <div class="opportunity-card" data-opp-id="${opp.id}">
            <div class="opportunity-card-header">
                <h5>${escapeHtml(opp.name)}</h5>
                <div class="opportunity-meta">
                    <span>${metaSvgTime}${escapeHtml(opp.duration)}</span>
                    <span>${metaSvgCal}${escapeHtml(formatDisplayDate(opp.start_date))}</span>
                </div>
            </div>
            <p class="opportunity-description">${escapeHtml(truncateText(opp.description, 220))}</p>
            <div class="opportunity-skills">
                <div class="opportunity-skills-label">Category</div>
                <div class="skills-tags"><span class="skill-tag">${escapeHtml(
                    CATEGORY_LABELS[opp.category] || opp.category
                )}</span></div>
            </div>
            <div class="opportunity-skills" style="margin-top: 12px;">
                <div class="opportunity-skills-label">Skills You'll Gain</div>
                <div class="skills-tags">${tagHtml}</div>
            </div>
            <div class="opportunity-footer">
                ${maxLine}
                <div class="opportunity-actions">
                    <button type="button" class="view-course-btn" data-act="view" data-id="${opp.id}">View Details</button>
                    <button type="button" class="view-course-btn" data-act="edit" data-id="${opp.id}">Edit</button>
                    <button type="button" class="view-course-btn" data-act="delete" data-id="${opp.id}">Delete</button>
                </div>
            </div>
        </div>`;
        })
        .join("");

    host.querySelectorAll("button[data-act]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = Number(btn.getAttribute("data-id"));
            const act = btn.getAttribute("data-act");
            const opp = opportunities.find((o) => o.id === id);
            if (!opp) return;
            if (act === "view") openOpportunityDetailsModal(opp);
            if (act === "edit") openOpportunityModalEdit(opp);
            if (act === "delete") confirmDeleteOpportunity(opp);
        });
    });
}

async function refreshOpportunities() {
    try {
        const data = await apiRequest("/opportunities", { method: "GET" });
        renderOpportunityCards(data.opportunities || []);
    } catch (e) {
        console.error(e);
        showToast("Could not load opportunities.");
    }
}

function openOpportunityModal() {
    const modal = document.getElementById("opportunityModal");
    const form = document.getElementById("opportunityForm");
    const title = document.getElementById("opportunityModalTitle");
    const submitBtn = form?.querySelector('button[type="submit"]');
    document.getElementById("oppEditId").value = "";
    form?.reset();
    if (title) title.textContent = "Add New Opportunity";
    if (submitBtn) submitBtn.textContent = "Create Opportunity";
    modal?.classList.add("active");
}

function closeOpportunityModal() {
    document.getElementById("opportunityModal")?.classList.remove("active");
}

function openOpportunityModalEdit(opp) {
    const modal = document.getElementById("opportunityModal");
    const title = document.getElementById("opportunityModalTitle");
    const submitBtn = document.querySelector('#opportunityForm button[type="submit"]');
    document.getElementById("oppEditId").value = String(opp.id);
    document.getElementById("oppName").value = opp.name || "";
    document.getElementById("oppDuration").value = opp.duration || "";
    document.getElementById("oppStartDate").value = opp.start_date || "";
    document.getElementById("oppDescription").value = opp.description || "";
    document.getElementById("oppSkills").value = opp.skills || "";
    document.getElementById("oppCategory").value = opp.category || "";
    document.getElementById("oppFuture").value = opp.future_opportunities || "";
    document.getElementById("oppMaxApplicants").value =
        opp.max_applicants != null ? String(opp.max_applicants) : "";
    if (title) title.textContent = "Edit Opportunity";
    if (submitBtn) submitBtn.textContent = "Save Changes";
    modal?.classList.add("active");
}

function openOpportunityDetailsModal(opp) {
    const modal = document.getElementById("opportunityDetailsModal");
    document.getElementById("opportunityDetailTitle").textContent = opp.name || "";
    document.getElementById("opportunityDetailDuration").textContent = opp.duration || "";
    document.getElementById("opportunityDetailStartDate").textContent = formatDisplayDate(opp.start_date);
    document.getElementById("opportunityDetailDescription").textContent = opp.description || "";

    const skillsEl = document.getElementById("opportunityDetailSkills");
    if (skillsEl) {
        const skills = (opp.skills || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        skillsEl.innerHTML = skills.map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("");
    }

    document.getElementById("opportunityDetailFuture").textContent = opp.future_opportunities || "";
    document.getElementById("opportunityDetailCategory").textContent =
        CATEGORY_LABELS[opp.category] || opp.category || "";

    const badgeWrap = document.getElementById("opportunityDetailApplicantsBadgeWrap");
    const badgeVal = document.getElementById("opportunityDetailApplicants");
    if (opp.max_applicants != null) {
        if (badgeWrap) badgeWrap.style.display = "";
        if (badgeVal) badgeVal.textContent = String(opp.max_applicants);
    } else {
        if (badgeWrap) badgeWrap.style.display = "none";
    }

    modal?.classList.add("active");
}

function closeOpportunityDetailsModal() {
    document.getElementById("opportunityDetailsModal")?.classList.remove("active");
}

function confirmDeleteOpportunity(opp) {
    if (!confirm(`Delete “${opp.name}”? This cannot be undone.`)) return;
    apiRequest(`/opportunities/${opp.id}`, { method: "DELETE" })
        .then(() => {
            showToast("Opportunity deleted.");
            refreshOpportunities();
        })
        .catch((e) => showToast(e.body?.message || "Could not delete opportunity."));
}

window.checkStrength = function (value) {
    const ids = ["str1", "str2", "str3", "str4"];
    const label = document.getElementById("strengthLabel");
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 10) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score++;
    score = Math.min(4, score);
    const tier = ["weak", "medium", "strong", "very-strong"];
    ids.forEach((id, i) => {
        const b = document.getElementById(id);
        if (!b) return;
        b.className = "strength-bar";
        if (i < score) b.classList.add(tier[Math.min(i, tier.length - 1)]);
    });
    if (label) label.textContent = value ? (score < 2 ? "Weak" : score < 4 ? "Good" : "Strong") : "";
};

document.addEventListener("DOMContentLoaded", () => {
    generateCaptcha("login");
    generateCaptcha("signup");
    generateCaptcha("forgot");

    window.generateCaptcha = generateCaptcha;
    window.showPage = function (pageId) {
        document.querySelectorAll(".form-page").forEach((p) => p.classList.remove("active"));
        const page = document.getElementById(pageId);
        if (page) page.classList.add("active");
    };

    window.togglePass = function (inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
    };

    window.openOpportunityModal = openOpportunityModal;
    window.closeOpportunityModal = closeOpportunityModal;
    window.closeOpportunityDetailsModal = closeOpportunityDetailsModal;

    document.querySelectorAll(".nav-item[data-page]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const page = btn.getAttribute("data-page");
            document.querySelectorAll(".sidebar-nav .nav-item:not(.logout)").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".dash-section").forEach((s) => s.classList.remove("active"));
            const section = document.getElementById(`${page}Section`);
            if (section) section.classList.add("active");
            const pt = document.getElementById("pageTitle");
            if (pt) pt.textContent = PAGE_TITLES[page] || "Dashboard";
            if (page === "opportunity") refreshOpportunities();
        });
    });

    document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value.trim();
        const captcha = document.getElementById("loginCaptchaInput")?.value.trim();
        const remember = document.getElementById("loginRememberMe")?.checked;

        if (!email || !isValidEmail(email)) {
            shakeForm("loginForm");
            return;
        }
        if (!password) {
            shakeForm("loginForm");
            return;
        }
        if (captcha !== captchas.login) {
            showToast("Captcha does not match.");
            generateCaptcha("login");
            return;
        }

        try {
            const data = await apiRequest("/login", {
                method: "POST",
                body: JSON.stringify({ email, password, remember_me: remember }),
            });
            showToast(data.message || "Welcome back.");
            updateProfileHeader(data.user);
            showDashboardView();
            generateCaptcha("login");
            document.getElementById("loginForm")?.reset();
            await refreshOpportunities();
        } catch (err) {
            if (err.status === 401) {
                showToast("Invalid email or password");
            } else {
                showToast("Unable to reach the server. Is the API running on port 5000?");
            }
            generateCaptcha("login");
        }
    });

    document.getElementById("signupForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("signupName")?.value.trim();
        const email = document.getElementById("signupEmail")?.value.trim();
        const password = document.getElementById("signupPassword")?.value;
        const confirm = document.getElementById("signupConfirmPassword")?.value;
        const captcha = document.getElementById("signupCaptchaInput")?.value.trim();

        if (!name || !email || !password || !confirm) {
            shakeForm("signupForm");
            showToast("Please fill in all fields.");
            return;
        }
        if (!isValidEmail(email)) {
            showToast("Please enter a valid email address.");
            return;
        }
        if (password.length < 8) {
            showToast("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            showToast("Passwords do not match.");
            return;
        }
        if (captcha !== captchas.signup) {
            showToast("Captcha does not match.");
            generateCaptcha("signup");
            return;
        }

        try {
            await apiRequest("/signup", {
                method: "POST",
                body: JSON.stringify({
                    name,
                    email,
                    password,
                    confirm_password: confirm,
                }),
            });
            showToast("Account created. Please sign in.");
            generateCaptcha("signup");
            document.getElementById("signupForm")?.reset();
            window.showPage("loginPage");
        } catch (err) {
            if (err.status === 409) {
                showToast("An account with this email already exists.");
            } else {
                showToast("Something went wrong. Please try again.");
            }
            generateCaptcha("signup");
        }
    });

    document.getElementById("forgotForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("forgotEmail")?.value.trim();
        const captcha = document.getElementById("forgotCaptchaInput")?.value.trim();

        if (!email || !isValidEmail(email)) {
            shakeForm("forgotForm");
            return;
        }
        if (captcha !== captchas.forgot) {
            shakeForm("forgotForm");
            return;
        }

        try {
            const data = await apiRequest("/forgot-password", {
                method: "POST",
                body: JSON.stringify({ email }),
            });
            showToast(data.message || FORGOT_MESSAGE);
        } catch {
            showToast(FORGOT_MESSAGE);
        }
        generateCaptcha("forgot");
        document.getElementById("forgotForm")?.reset();
    });

    document.getElementById("opportunityForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const editId = document.getElementById("oppEditId").value.trim();
        const name = document.getElementById("oppName")?.value.trim();
        const duration = document.getElementById("oppDuration")?.value.trim();
        const start_date = document.getElementById("oppStartDate")?.value.trim();
        const description = document.getElementById("oppDescription")?.value.trim();
        const skills = document.getElementById("oppSkills")?.value.trim();
        const category = document.getElementById("oppCategory")?.value.trim();
        const future_opportunities = document.getElementById("oppFuture")?.value.trim();
        const maxRaw = document.getElementById("oppMaxApplicants")?.value.trim();

        if (!name || !duration || !start_date || !description || !skills || !category || !future_opportunities) {
            showToast("Please complete all required fields.");
            return;
        }
        let max_applicants = null;
        if (maxRaw !== "") {
            const n = parseInt(maxRaw, 10);
            if (Number.isNaN(n) || n < 1) {
                showToast("Maximum applicants must be a positive number.");
                return;
            }
            max_applicants = n;
        }

        const payload = {
            name,
            duration,
            start_date,
            description,
            skills,
            category,
            future_opportunities,
            max_applicants,
        };

        try {
            if (editId) {
                await apiRequest(`/opportunities/${editId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                showToast("Opportunity updated.");
            } else {
                await apiRequest("/opportunities", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                showToast("Opportunity created.");
            }
            closeOpportunityModal();
            await refreshOpportunities();
        } catch (err) {
            showToast(err.body?.message || "Could not save. Please try again.");
        }
    });

    window.handleLogout = async function () {
        try {
            await apiRequest("/logout", { method: "POST" });
        } catch (_) {}
        showAuthView();
        showToast("Signed out.");
    };

    (async function initSession() {
        try {
            const data = await apiRequest("/me", { method: "GET" });
            if (data.authenticated && data.user) {
                updateProfileHeader(data.user);
                showDashboardView();
                await refreshOpportunities();
            } else {
                showAuthView();
            }
        } catch {
            showAuthView();
        }
    })();

    document.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", () => input.classList.remove("error"));
    });

    /* ---- Non-assessment dashboard handlers (avoid runtime errors) ---- */
    window.closeSearch = () => document.getElementById("searchContainer")?.classList.remove("active");
    window.openSearch = () => document.getElementById("searchContainer")?.classList.add("active");
    window.toggleNotifications = function () {
        document.getElementById("notificationDropdown")?.classList.toggle("active");
    };
    window.toggleTheme = function () {
        const b = document.body;
        const next = b.getAttribute("data-theme") === "dark" ? "light" : "dark";
        if (next === "dark") b.setAttribute("data-theme", "dark");
        else b.removeAttribute("data-theme");
    };
    window.markAllRead = function () {};
    window.changeChartPeriod = function () {};
    window.openQuickAddModal = window.closeQuickAddModal = function () {};
    window.openBulkUploadModal = window.closeBulkUploadModal = function () {};
    window.openCourseDetails = window.closeCourseModal = function () {};
    window.openVerifierDetails = function () {};
    window.openCollaboratorCourses = window.closeCollaboratorCoursesModal = function () {};
    window.approveCourse = window.rejectCourse = function () {};
    window.openQuickAddVerifierModal = window.closeQuickAddVerifierModal = function () {};
    window.openBulkUploadVerifierModal = window.closeBulkUploadVerifierModal = function () {};
    window.downloadSampleCSV = window.handleFileSelect = function () {};
    window.downloadSampleVerifierCSV = window.handleVerifierFileSelect = function () {};
    window.closeVerifierDetailsModal = function () {};
});
