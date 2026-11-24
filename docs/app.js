// docs/app.js
// Client-side Application Logic for MNC & Tech Hub Career Radar

(function () {
  let allJobs = [];
  let currentTab = "new"; // 'new' | 'applied' | 'starred'
  let appliedIds = new Set();
  let starredIds = new Set();

  // Load from localStorage
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
    toast.classList.add("opacity-100", "translate-y-[-10px]");

    setTimeout(() => {
      toast.classList.remove("opacity-100", "translate-y-[-10px]");
      toast.classList.add("opacity-0", "pointer-events-none");
    }, 2500);
  }

  // Header Date
  function updateHeaderDate() {
    const dateEl = document.getElementById("header-date");
    if (!dateEl) return;
    const now = new Date();
    const options = { month: "short", day: "numeric", year: "numeric" };
    dateEl.innerText = now.toLocaleDateString("en-US", options);
  }

  // Tab Switching
  window.switchTab = function (tab) {
    currentTab = tab;
    const tabs = ["new", "applied", "starred"];

    tabs.forEach((t) => {
      const btn = document.getElementById(`tab-${t}`);
      if (!btn) return;
      if (t === tab) {
        btn.classList.add("border-emerald-400", "text-emerald-400");
        btn.classList.remove("border-transparent", "text-slate-400");
      } else {
        btn.classList.remove("border-emerald-400", "text-emerald-400");
        btn.classList.add("border-transparent", "text-slate-400");
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

    // Add to applied
    appliedIds.add(id);
    savePersistedState();
    showToast(`Opening ${job.company} portal & moved to Applied tab!`);
    updateBadges();
    renderJobs();
  };

  window.handleUnapply = function (id) {
    appliedIds.delete(id);
    savePersistedState();
    showToast("Moved back to New Matches!");
    updateBadges();
    renderJobs();
  };

  window.handleToggleStar = function (id) {
    if (starredIds.has(id)) {
      starredIds.delete(id);
      showToast("Removed from Saved.");
    } else {
      starredIds.add(id);
      showToast("Saved to Starred tab! ⭐");
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
          btnElement.innerHTML = `<span class="text-emerald-400 font-bold">Copied! ✓</span>`;
          setTimeout(() => {
            btnElement.innerHTML = originalText;
          }, 2000);
        }
      })
      .catch(() => {
        showToast("Please select and copy manually.");
      });
  };

  // Badges
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

  // Filter & Search Logic
  window.applyFilters = function () {
    renderJobs();
  };

  function getFilteredJobs() {
    const searchVal = (document.getElementById("search-input")?.value || "").toLowerCase().trim();
    const hubVal = (document.getElementById("filter-hub")?.value || "").toLowerCase().trim();
    const stackVal = (document.getElementById("filter-stack")?.value || "").toLowerCase().trim();
    const packageVal = parseInt(document.getElementById("filter-package")?.value || "0", 10);

    return allJobs.filter((j) => {
      // Tab partition
      if (currentTab === "new" && appliedIds.has(j.id)) return false;
      if (currentTab === "applied" && !appliedIds.has(j.id)) return false;
      if (currentTab === "starred" && !starredIds.has(j.id)) return false;

      // Search term
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

  // Card HTML Renderer
  function renderCard(job) {
    const isApplied = appliedIds.has(job.id);
    const isStarred = starredIds.has(job.id);

    // Score color styling
    let scoreBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (job.matchScore >= 90) {
      scoreBadge = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10";
    } else if (job.matchScore >= 80) {
      scoreBadge = "bg-teal-500/15 text-teal-300 border-teal-500/30";
    } else {
      scoreBadge = "bg-slate-800 text-slate-300 border-slate-700";
    }

    // Why You Fit bullets
    const bulletsHtml = (job.whyFit || [])
      .map(
        (bullet) => `
        <li class="flex items-start gap-1.5 text-[11px] text-slate-300 leading-relaxed">
          <span class="text-emerald-400 mt-0.5">•</span>
          <span>${bullet.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')}</span>
        </li>
      `
      )
      .join("");

    return `
      <div class="bg-slate-900 border border-slate-800/90 hover:border-slate-700/80 rounded-2xl p-4 shadow-md transition-all">
        <!-- Top Metadata Row -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border ${scoreBadge}">
                ${job.matchScore}% Match
              </span>
              <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-md">
                ${job.estSalary}
              </span>
              <span class="text-[10px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-md">
                ${job.hubBadge}
              </span>
            </div>
            <h3 class="text-sm font-bold text-white tracking-tight leading-snug">
              ${job.title}
            </h3>
            <p class="text-xs font-medium text-slate-400 mt-0.5">
              🏢 <strong class="text-slate-200">${job.company}</strong> • <span class="text-slate-500">${job.location}</span>
            </p>
          </div>

          <!-- Star Button -->
          <button 
            onclick="handleToggleStar('${job.id}')" 
            title="${isStarred ? 'Unstar' : 'Save for later'}"
            class="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 transition-colors"
          >
            <svg class="w-4 h-4 ${isStarred ? 'text-amber-400 fill-amber-400' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
          </button>
        </div>

        <!-- Why You Fit Section -->
        <div class="bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5 my-3">
          <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
            <svg class="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Why Gopal Fits This Role
          </p>
          <ul class="space-y-1">
            ${bulletsHtml}
          </ul>
        </div>

        <!-- Action Row -->
        <div class="flex items-center gap-2 pt-1">
          ${
            isApplied
              ? `
            <a 
              href="${job.directApplyUrl}" 
              target="_blank" 
              class="flex-1 text-center py-2 px-3 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700/80 transition-all border border-slate-700/60"
            >
              Reopen Portal ↗
            </a>
            <button 
              onclick="handleUnapply('${job.id}')" 
              class="py-2 px-3 rounded-xl text-xs font-semibold bg-slate-800/80 text-rose-300 hover:bg-rose-950/40 border border-rose-900/40 transition-all"
            >
              ↩ Move to New
            </button>
          `
              : `
            <button 
              onclick="handleApply('${job.id}')" 
              class="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-md shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              <span>🚀 Apply Now</span>
              <span class="text-[10px] font-normal opacity-75">(Official ATS)</span>
            </button>
            <button 
              onclick="handleCopyPitch('${job.id}', this)" 
              class="py-2 px-3 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-all active:scale-[0.98] flex items-center gap-1"
              title="Copy pre-written customized cover letter"
            >
              <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
              </svg>
              <span>Pitch</span>
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
      countEl.innerText = `Showing ${filtered.length} ${currentTab === "applied" ? "applied" : currentTab === "starred" ? "saved" : "new"} opportunities`;
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
      console.warn("No MNC_JOBS_DATA found. Please ensure jobs-data.js is generated.");
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
