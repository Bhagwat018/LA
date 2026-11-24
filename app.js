// docs/app.js
// Client-side Application Logic for MNC & Tech Hub Career Radar (Professional White Theme)

(function () {
  let allJobs = [];
  let currentTab = "new"; // 'new' | 'applied' | 'starred'
  let appliedIds = new Set();
  let starredIds = new Set();

  // Load persisted state from localStorage
  function loadPersistedState() {
    try {
      const storedApplied = localStorage.getItem("mnc_applied_ids");
      if (storedApplied) {
        appliedIds = new Set(JSON.parse(storedApplied));
      }
      const storedStarred = localStorage.getItem("mnc_starred_ids");
      if (storedStarred) {
        starredIds = new Set(JSON.parse(storedStarred));
      }
    } catch (e) {
      console.warn("Could not read localStorage", e);
    }
  }

  function savePersistedState() {
    try {
      localStorage.setItem("mnc_applied_ids", JSON.stringify([...appliedIds]));
      localStorage.setItem("mnc_starred_ids", JSON.stringify([...starredIds]));
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }
  }

  // Toast Notification
  function showToast(message) {
    const toast = document.getElementById("toast");
    const msg = document.getElementById("toast-msg");
    if (!toast || !msg) return;
    msg.innerText = message;
    toast.classList.remove("opacity-0", "pointer-events-none");
    toast.classList.add("opacity-100", "translate-y-[-8px]");

    setTimeout(() => {
      toast.classList.remove("opacity-100", "translate-y-[-8px]");
      toast.classList.add("opacity-0", "pointer-events-none");
    }, 2500);
  }

  // Header Date Formatter
  function updateHeaderDate() {
    const dateEl = document.getElementById("header-date");
    if (!dateEl) return;
    const now = new Date();
    const options = { month: "short", day: "numeric", year: "numeric" };
    dateEl.innerText = now.toLocaleDateString("en-US", options);
  }

  // Tab Switcher
  window.switchTab = function (tab) {
    currentTab = tab;
    const tabs = ["new", "applied", "starred"];

    tabs.forEach((t) => {
      const btn = document.getElementById(`tab-${t}`);
      if (!btn) return;
      if (t === tab) {
        btn.classList.add("border-blue-600", "text-blue-600", "font-semibold");
        btn.classList.remove("border-transparent", "text-slate-500");
      } else {
        btn.classList.remove("border-blue-600", "text-blue-600", "font-semibold");
        btn.classList.add("border-transparent", "text-slate-500");
      }
    });

    renderJobs();
  };

  // Actions
  window.handleApply = function (id) {
    const job = allJobs.find((j) => j.id === id);
    if (!job) return;

    // Open link in new tab
    if (job.directApplyUrl) {
      window.open(job.directApplyUrl, "_blank");
    }

    // Move to applied
    appliedIds.add(id);
    savePersistedState();
    showToast(`Opening ${job.company} portal & moved to Applied tab!`);
    updateBadges();
    renderJobs();
  };

  window.handleUnapply = function (id) {
    appliedIds.delete(id);
    savePersistedState();
    showToast("Moved back to Fresh Matches!");
    updateBadges();
    renderJobs();
  };

  window.handleToggleStar = function (id) {
    if (starredIds.has(id)) {
      starredIds.delete(id);
      showToast("Removed from Saved.");
    } else {
      starredIds.add(id);
      showToast("Saved to Shortlist! ⭐");
    }
    savePersistedState();
    updateBadges();
    renderJobs();
  };

  window.handleCopyPitch = function (id, btnElement) {
    const job = allJobs.find((j) => j.id === id);
    if (!job || !job.quickPitch) return;

    navigator.clipboard
      .writeText(job.quickPitch)
      .then(() => {
        showToast("Personalized cover pitch copied to clipboard!");
        if (btnElement) {
          const originalText = btnElement.innerHTML;
          btnElement.innerHTML = `<span class="text-blue-700 font-bold">Copied! ✓</span>`;
          setTimeout(() => {
            btnElement.innerHTML = originalText;
          }, 2000);
        }
      })
      .catch(() => {
        showToast("Please copy the pitch manually.");
      });
  };

  // Badge Counters
  function updateBadges() {
    const newCount = allJobs.filter((j) => !appliedIds.has(j.id)).length;
    const appliedCount = appliedIds.size;
    const starredCount = starredIds.size;

    const bNew = document.getElementById("badge-new");
    const bApplied = document.getElementById("badge-applied");
    const bStarred = document.getElementById("badge-starred");

    if (bNew) bNew.innerText = newCount;
    if (bApplied) bApplied.innerText = appliedCount;
    if (bStarred) bStarred.innerText = starredCount;
  }

  // Filter & Search
  window.applyFilters = function () {
    renderJobs();
  };

  function getFilteredJobs() {
    const searchVal = (document.getElementById("search-input")?.value || "").toLowerCase().trim();
    const hubVal = (document.getElementById("filter-hub")?.value || "").toLowerCase().trim();
    const stackVal = (document.getElementById("filter-stack")?.value || "").toLowerCase().trim();
    const packageVal = parseInt(document.getElementById("filter-package")?.value || "0", 10);

    return allJobs.filter((j) => {
      // Tab filter
      if (currentTab === "new" && appliedIds.has(j.id)) return false;
      if (currentTab === "applied" && !appliedIds.has(j.id)) return false;
      if (currentTab === "starred" && !starredIds.has(j.id)) return false;

      // Text search
      if (searchVal) {
        const fullContent = `${j.title} ${j.company} ${j.location} ${j.category} ${j.hubBadge}`.toLowerCase();
        if (!fullContent.includes(searchVal)) return false;
      }

      // Hub Filter
      if (hubVal) {
        const loc = (j.location || "").toLowerCase();
        if (!loc.includes(hubVal)) return false;
      }

      // Stack Filter
      if (stackVal) {
        const title = (j.title || "").toLowerCase();
        const skills = (j.matchedSkills || []).join(" ").toLowerCase();
        if (!title.includes(stackVal) && !skills.includes(stackVal)) return false;
      }

      // Package Filter
      if (packageVal > 0) {
        const salaryText = j.estSalary || "";
        const matches = salaryText.match(/(\d+)/g);
        if (matches) {
          const maxLpa = Math.max(...matches.map(Number));
          if (maxLpa < packageVal) return false;
        }
      }

      return true;
    });
  }

  // Company Initials & Color Helper
  function getCompanyInitials(name) {
    if (!name) return "CO";
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  function getCompanyColor(name) {
    const colors = [
      "from-blue-600 to-indigo-600",
      "from-emerald-600 to-teal-600",
      "from-amber-500 to-orange-600",
      "from-violet-600 to-purple-600",
      "from-rose-500 to-pink-600",
      "from-cyan-600 to-blue-600"
    ];
    let hash = 0;
    for (let i = 0; i < (name || "").length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // Card HTML Renderer (Clean White Theme)
  function renderCard(job) {
    const isApplied = appliedIds.has(job.id);
    const isStarred = starredIds.has(job.id);
    const initials = getCompanyInitials(job.company);
    const avatarGradient = getCompanyColor(job.company);

    // Score badge color
    let scoreBadge = "bg-slate-100 text-slate-700 border-slate-200";
    if (job.matchScore >= 90) {
      scoreBadge = "bg-emerald-50 text-emerald-700 border-emerald-300 font-bold shadow-xs";
    } else if (job.matchScore >= 80) {
      scoreBadge = "bg-blue-50 text-blue-700 border-blue-200 font-bold";
    }

    // Why You Fit bullets
    const bulletsHtml = (job.whyFit || [])
      .map(
        (bullet) => `
        <li class="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
          <span class="text-emerald-600 font-bold mt-0.5">✓</span>
          <span>${bullet.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900 font-semibold">$1</strong>')}</span>
        </li>
      `
      )
      .join("");

    return `
      <div class="bg-white border border-slate-200/90 hover:border-slate-300 hover:shadow-md rounded-2xl p-4.5 transition-all duration-200">
        
        <!-- Header: Company & Badges -->
        <div class="flex items-start justify-between gap-3 mb-2.5">
          <div class="flex items-start gap-3 flex-1">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr ${avatarGradient} text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
              ${initials}
            </div>
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-bold text-slate-900">${job.company}</span>
                <span class="text-slate-300">•</span>
                <span class="text-[11px] font-medium text-slate-500">${job.location}</span>
              </div>
              <h3 class="text-sm font-bold text-slate-900 tracking-tight leading-snug mt-0.5">
                ${job.title}
              </h3>
            </div>
          </div>

          <!-- Star Button -->
          <button 
            onclick="handleToggleStar('${job.id}')" 
            title="${isStarred ? 'Unstar' : 'Save for later'}"
            class="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-300 hover:bg-amber-50/50 transition-colors shrink-0"
          >
            <svg class="w-4 h-4 ${isStarred ? 'text-amber-500 fill-amber-500' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
          </button>
        </div>

        <!-- Meta Pills Row -->
        <div class="flex items-center gap-2 flex-wrap mb-3">
          <span class="text-[11px] px-2.5 py-0.5 rounded-full border ${scoreBadge}">
            🎯 ${job.matchScore}% Match
          </span>
          <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
            💰 ${job.estSalary}
          </span>
          <span class="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
            📍 ${job.hubBadge}
          </span>
          <span class="text-[11px] text-slate-500 ml-auto hidden sm:inline">
            💼 2–5 Yrs Exp
          </span>
        </div>

        <!-- Why You Fit Box -->
        <div class="bg-slate-50/80 border border-slate-200/90 rounded-xl p-3 mb-3">
          <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Why Gopal Fits This Requisition
          </p>
          <ul class="space-y-1">
            ${bulletsHtml}
          </ul>
        </div>

        <!-- Action Row -->
        <div class="flex items-center gap-2.5 pt-1">
          ${
            isApplied
              ? `
            <a 
              href="${job.directApplyUrl}" 
              target="_blank" 
              class="flex-1 text-center py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-all flex items-center justify-center gap-1.5"
            >
              <span>Reopen Application Portal</span>
              <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </a>
            <button 
              onclick="handleUnapply('${job.id}')" 
              class="py-2.5 px-3.5 rounded-xl text-xs font-semibold bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all"
            >
              ↩ Move to New
            </button>
          `
              : `
            <button 
              onclick="handleApply('${job.id}')" 
              class="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>🚀 Apply on Official Portal</span>
              <svg class="w-3.5 h-3.5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
              </svg>
            </button>
            <button 
              onclick="handleCopyPitch('${job.id}', this)" 
              class="py-2.5 px-3.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200/90 transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Copy personalized cover letter to clipboard"
            >
              <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
              </svg>
              <span>Copy Pitch</span>
            </button>
          `
          }
        </div>

      </div>
    `;
  }

  // Master Render
  function renderJobs() {
    const container = document.getElementById("jobs-container");
    const emptyState = document.getElementById("empty-state");
    const countEl = document.getElementById("results-count");
    if (!container) return;

    const filtered = getFilteredJobs();

    if (countEl) {
      countEl.innerText = `Showing ${filtered.length} ${
        currentTab === "applied" ? "applied" : currentTab === "starred" ? "saved" : "fresh"
      } opportunities`;
    }

    if (filtered.length === 0) {
      container.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");
    container.innerHTML = filtered.map(renderCard).join("");
  }

  // Initialize
  function init() {
    updateHeaderDate();
    loadPersistedState();

    if (window.MNC_JOBS_DATA && Array.isArray(window.MNC_JOBS_DATA)) {
      allJobs = window.MNC_JOBS_DATA;
    } else {
      console.warn("No MNC_JOBS_DATA found. Please check jobs-data.js.");
    }

    updateBadges();
    renderJobs();
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
