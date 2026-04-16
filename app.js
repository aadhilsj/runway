const STORAGE_KEY = "runway-mvp-v2";
const SUPABASE_TABLE = "runway_state";
const HISTORY_WINDOW_HOURS = 12;
const UNDO_VISIBLE_MS = 3000;
const MOBILE_BREAKPOINT = 720;
const CATEGORY_OPTIONS = [
  "Income",
  "Housing",
  "Groceries",
  "Bills",
  "Transport",
  "Travel",
  "Shopping",
  "Misc"
];
const HISTORY_ACTIONS = new Set([
  "added",
  "edited",
  "deleted",
  "settled",
  "reopened",
  "undid"
]);
const UNDOABLE_ACTIONS = new Set(["deleted", "settled", "reopened"]);
const BUCKET_CATEGORIES = ["Groceries", "Misc"];

const defaultState = {
  account: {
    currentBalance: 18240,
    warningThreshold: 2500
  },
  ui: {
    selectedDate: localISODate(new Date()),
    mobileTab: "forecast",
    clarityExpanded: false,
    undoNotice: null,
    history: []
  },
  buckets: {},
  scenarios: [
    {
      id: crypto.randomUUID(),
      name: "Morocco trip",
      description: "Optional travel plan to pressure-test June cashflow.",
      isIncluded: false
    }
  ],
  templates: [
    { id: crypto.randomUUID(), label: "Salary", amount: 22000, daysFromNow: 14, category: "Income" },
    { id: crypto.randomUUID(), label: "Rent", amount: -9500, daysFromNow: 12, category: "Housing" },
    { id: crypto.randomUUID(), label: "Groceries", amount: -850, daysFromNow: 2, category: "Groceries" },
    { id: crypto.randomUUID(), label: "Phone bill", amount: -399, daysFromNow: 8, category: "Bills" }
  ],
  events: []
};

seedEvents(defaultState);

let state = loadLocalCache();
let undoStack = [];
let pendingSetting = null;
let planDraftEvents = [];
let activePlanId = null;
let undoTimer = null;
let supabaseClient = null;
let authUser = null;
let lastRemoteUpdatedAt = null;

const elements = {
  appShell: document.querySelector("#app-shell"),
  authShell: document.querySelector("#auth-shell"),
  authForm: document.querySelector("#auth-form"),
  authEmail: document.querySelector("#auth-email"),
  authSubmit: document.querySelector("#auth-submit"),
  authMessage: document.querySelector("#auth-message"),
  heroSection: document.querySelector("#hero-section"),
  forecastOverview: document.querySelector("#forecast-overview"),
  undoBanner: document.querySelector("#undo-banner"),
  undoMessage: document.querySelector("#undo-message"),
  undoButton: document.querySelector("#undo-button"),
  currentBalanceValue: document.querySelector("#current-balance-value"),
  selectedBalanceValue: document.querySelector("#selected-balance-value"),
  thirtyDayValue: document.querySelector("#thirty-day-value"),
  lowestBalanceValue: document.querySelector("#lowest-balance-value"),
  monthEndValue: document.querySelector("#month-end-value"),
  thirtyDayLabel: document.querySelector("#thirty-day-label"),
  lowestBalanceLabel: document.querySelector("#lowest-balance-label"),
  monthEndLabel: document.querySelector("#month-end-label"),
  clarityPanelBody: document.querySelector("#clarity-panel-body"),
  clarityToggleButton: document.querySelector("#clarity-toggle-button"),
  warningThresholdValue: document.querySelector("#warning-threshold-value"),
  settledSpendValue: document.querySelector("#settled-spend-value"),
  varianceValue: document.querySelector("#variance-value"),
  bucketList: document.querySelector("#bucket-list"),
  bucketHistoryList: document.querySelector("#bucket-history-list"),
  categoryBreakdown: document.querySelector("#category-breakdown"),
  warningBanner: document.querySelector("#warning-banner"),
  selectedDate: document.querySelector("#selected-date"),
  selectedDateCaption: document.querySelector("#selected-date-caption"),
  timelinePanel: document.querySelector("#timeline-panel"),
  timelineList: document.querySelector("#timeline-list"),
  sidebarStack: document.querySelector("#sidebar-stack"),
  budgetsShell: document.querySelector("#budgets-shell"),
  plansShell: document.querySelector("#plans-shell"),
  templatesShell: document.querySelector("#templates-shell"),
  bucketHistoryShell: document.querySelector("#bucket-history-shell"),
  historyShell: document.querySelector("#history-shell"),
  scenarioList: document.querySelector("#scenario-list"),
  templateList: document.querySelector("#template-list"),
  historyList: document.querySelector("#history-list"),
  openEntryModal: document.querySelector("#open-entry-modal"),
  mobileFab: document.querySelector("#mobile-fab"),
  closeEntryModal: document.querySelector("#close-entry-modal"),
  entryModal: document.querySelector("#entry-modal"),
  entryForm: document.querySelector("#entry-form"),
  entryId: document.querySelector("#entry-id"),
  entryLabel: document.querySelector("#entry-label"),
  entryAmount: document.querySelector("#entry-amount"),
  entryDate: document.querySelector("#entry-date"),
  entryScenario: document.querySelector("#entry-scenario"),
  entryCategory: document.querySelector("#entry-category"),
  entrySettled: document.querySelector("#entry-settled"),
  entryActualAmount: document.querySelector("#entry-actual-amount"),
  entryNotes: document.querySelector("#entry-notes"),
  entryModalTitle: document.querySelector("#entry-modal-title"),
  deleteEntryButton: document.querySelector("#delete-entry-button"),
  quickAddInput: document.querySelector("#quick-add-input"),
  quickAddButton: document.querySelector("#quick-add-button"),
  newScenarioButton: document.querySelector("#new-scenario-button"),
  scenarioModal: document.querySelector("#scenario-modal"),
  closeScenarioModal: document.querySelector("#close-scenario-modal"),
  scenarioForm: document.querySelector("#scenario-form"),
  scenarioId: document.querySelector("#scenario-id"),
  scenarioName: document.querySelector("#scenario-name"),
  scenarioDescription: document.querySelector("#scenario-description"),
  scenarioEventLabel: document.querySelector("#scenario-event-label"),
  scenarioEventAmount: document.querySelector("#scenario-event-amount"),
  scenarioEventDate: document.querySelector("#scenario-event-date"),
  scenarioEventCategory: document.querySelector("#scenario-event-category"),
  scenarioEventNotes: document.querySelector("#scenario-event-notes"),
  addScenarioEventButton: document.querySelector("#add-scenario-event-button"),
  scenarioEventsList: document.querySelector("#scenario-events-list"),
  deleteScenarioButton: document.querySelector("#delete-scenario-button"),
  scenarioModalTitle: document.querySelector("#scenario-modal-title"),
  editBalanceButton: document.querySelector("#edit-balance-button"),
  editThresholdButton: document.querySelector("#edit-threshold-button"),
  settingsModal: document.querySelector("#settings-modal"),
  settingsForm: document.querySelector("#settings-form"),
  settingsTitle: document.querySelector("#settings-title"),
  settingsLabel: document.querySelector("#settings-label"),
  settingsValue: document.querySelector("#settings-value"),
  closeSettingsModal: document.querySelector("#close-settings-modal"),
  signOutButton: document.querySelector("#sign-out-button"),
  syncBadge: document.querySelector("#sync-badge"),
  plansPanel: document.querySelector("#plans-panel"),
  mobileNav: document.querySelector("#mobile-nav"),
  mobileNavButtons: Array.from(document.querySelectorAll("[data-mobile-tab-target]"))
};

attachEventListeners();
render();
void bootstrap();

function attachEventListeners() {
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.undoButton.addEventListener("click", handleUndo);
  elements.openEntryModal.addEventListener("click", () => openEntryModal());
  elements.mobileFab.addEventListener("click", () => openEntryModal());
  elements.closeEntryModal.addEventListener("click", () => elements.entryModal.close());
  elements.entryForm.addEventListener("submit", handleEntrySubmit);
  elements.deleteEntryButton.addEventListener("click", handleEntryDelete);
  elements.quickAddButton.addEventListener("click", handleQuickAdd);
  elements.quickAddInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleQuickAdd();
    }
  });

  elements.selectedDate.addEventListener("change", () => {
    state.ui.selectedDate = elements.selectedDate.value || localISODate(new Date());
    persist();
    render();
  });

  elements.newScenarioButton.addEventListener("click", () => openPlanModal());
  elements.closeScenarioModal.addEventListener("click", () => elements.scenarioModal.close());
  elements.scenarioForm.addEventListener("submit", handleScenarioSubmit);
  elements.addScenarioEventButton.addEventListener("click", handleAddPlanEvent);
  elements.deleteScenarioButton.addEventListener("click", handleDeleteScenario);

  elements.editBalanceButton.addEventListener("click", () => openSettingsModal("balance"));
  elements.editThresholdButton.addEventListener("click", () => openSettingsModal("threshold"));
  elements.clarityToggleButton.addEventListener("click", handleClarityToggle);
  elements.closeSettingsModal.addEventListener("click", () => elements.settingsModal.close());
  elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
  elements.signOutButton.addEventListener("click", handleSignOut);
  elements.mobileNavButtons.forEach((button) => {
    button.addEventListener("click", () => setMobileTab(button.dataset.mobileTabTarget));
  });
  window.addEventListener("focus", () => {
    if (authUser) void refreshRemoteState();
  });
  window.addEventListener("resize", handleViewportChange);
}

async function bootstrap() {
  initSupabase();
  updateAuthUI();
  if (!supabaseClient) {
    elements.authMessage.textContent = "Supabase config is missing.";
    elements.authShell.classList.add("is-visible");
    elements.authShell.setAttribute("aria-hidden", "false");
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    elements.authMessage.textContent = "Unable to restore session.";
    elements.authShell.classList.add("is-visible");
    elements.authShell.setAttribute("aria-hidden", "false");
    return;
  }

  authUser = data.session?.user || null;
  updateAuthUI();
  if (authUser) {
    await loadRemoteState();
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    authUser = session?.user || null;
    updateAuthUI();
    if (authUser) {
      await loadRemoteState();
    } else {
      state = loadLocalCache();
      render();
    }
  });
}

function initSupabase() {
  const config = window.RUNWAY_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) return;
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) return;
  const email = elements.authEmail.value.trim();
  if (!email) return;

  elements.authSubmit.disabled = true;
  elements.authMessage.textContent = "Sending magic link...";
  const redirectTarget = window.location.origin.startsWith("http")
    ? window.location.origin
    : "https://runway-xi.vercel.app";
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTarget
    }
  });

  elements.authSubmit.disabled = false;
  elements.authMessage.textContent = error
    ? "Unable to send magic link."
    : "Magic link sent. Open it on this device to sign in.";
}

async function handleSignOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  authUser = null;
  updateAuthUI();
}

function updateAuthUI() {
  const signedIn = Boolean(authUser);
  elements.authShell.classList.toggle("is-visible", !signedIn);
  elements.authShell.setAttribute("aria-hidden", signedIn ? "true" : "false");
  elements.appShell.classList.toggle("is-auth-blocked", !signedIn);
  document.body.classList.toggle("auth-required", !signedIn);
  elements.signOutButton.hidden = !signedIn;
  elements.openEntryModal.disabled = !signedIn;
  elements.mobileFab.disabled = !signedIn;
  elements.quickAddButton.disabled = !signedIn;
  elements.syncBadge.textContent = signedIn ? "Syncing with Supabase" : "Sign in required";
}

function render() {
  if (!state.ui.mobileTab) {
    state.ui.mobileTab = "forecast";
  }
  if (typeof state.ui.clarityExpanded !== "boolean") {
    state.ui.clarityExpanded = false;
  }
  pruneHistory();
  ensureCurrentMonthBuckets(state);
  const forecast = computeForecast(state);
  const insights = computeInsights(state);
  const today = localISODate(new Date());
  const selectedDate = state.ui.selectedDate || today;
  const balanceOnSelectedDate = projectionAtDate(forecast.timeline, selectedDate, state.account.currentBalance);
  const thirtyDayDate = addDaysISO(today, 30);
  const monthEndDate = endOfMonthISO(today);
  const thirtyDayProjection = projectionAtDate(forecast.timeline, thirtyDayDate, state.account.currentBalance);
  const monthEndProjection = projectionAtDate(forecast.timeline, monthEndDate, state.account.currentBalance);
  const lowestLabel = forecast.lowestBalance.event ? `Lowest projected point (${formatDate(forecast.lowestBalance.event.date)})` : "Lowest projected point";

  elements.currentBalanceValue.textContent = formatCurrency(state.account.currentBalance);
  elements.selectedBalanceValue.textContent = formatCurrency(balanceOnSelectedDate);
  elements.thirtyDayValue.textContent = formatCurrency(thirtyDayProjection);
  elements.lowestBalanceValue.textContent = formatCurrency(forecast.lowestBalance.balance);
  elements.monthEndValue.textContent = formatCurrency(monthEndProjection);
  elements.thirtyDayLabel.textContent = `Balance in 30 days (${formatDate(thirtyDayDate)})`;
  elements.monthEndLabel.textContent = `Month end (${formatDate(monthEndDate)})`;
  elements.lowestBalanceLabel.textContent = lowestLabel;
  elements.warningThresholdValue.textContent = formatCurrency(state.account.warningThreshold);
  elements.settledSpendValue.textContent = formatCurrency(insights.settledSpend);
  elements.varianceValue.textContent = formatSignedCurrency(insights.varianceAgainstPlan);
  elements.varianceValue.style.color = insights.varianceAgainstPlan > 0
    ? "var(--income)"
    : insights.varianceAgainstPlan < 0
      ? "var(--expense)"
      : "";
  elements.selectedDate.value = selectedDate;
  elements.selectedDateCaption.textContent = buildSelectedDateCaption(selectedDate, balanceOnSelectedDate);
  renderClarityPanel();

  renderUndoBanner();
  renderWarning(forecast.lowestBalance);
  renderTimeline(forecast.timeline);
  renderScenarios();
  renderTemplates();
  renderBuckets();
  renderInsights(insights);
  renderHistory();
  renderBucketHistory();
  syncScenarioOptions();
  syncCategoryOptions();
  applyMobileLayout();
}

function handleClarityToggle() {
  state.ui.clarityExpanded = !state.ui.clarityExpanded;
  persist();
  render();
}

function renderClarityPanel() {
  const isMobile = isMobileViewport();
  const isExpanded = !isMobile || state.ui.clarityExpanded;
  elements.clarityPanelBody.hidden = !isExpanded;
  elements.clarityToggleButton.hidden = !isMobile || state.ui.mobileTab !== "forecast";
  elements.clarityToggleButton.textContent = isExpanded ? "Hide" : "Show";
  elements.clarityToggleButton.setAttribute("aria-expanded", isExpanded ? "true" : "false");
}

function setMobileTab(tab) {
  if (!["forecast", "plans", "more"].includes(tab) || state.ui.mobileTab === tab) return;
  state.ui.mobileTab = tab;
  persist();
  render();
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

function handleViewportChange() {
  applyMobileLayout();
}

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function applyMobileLayout() {
  const isMobile = isMobileViewport();
  const activeTab = state.ui.mobileTab || "forecast";
  const sections = [
    { element: elements.forecastOverview, tabs: ["forecast"] },
    { element: elements.timelinePanel, tabs: ["forecast"] },
    { element: elements.sidebarStack, tabs: ["plans", "more"] },
    { element: elements.budgetsShell, tabs: ["more"] },
    { element: elements.plansShell, tabs: ["plans"] },
    { element: elements.templatesShell, tabs: ["more"] },
    { element: elements.bucketHistoryShell, tabs: ["more"] },
    { element: elements.historyShell, tabs: ["more"] }
  ];

  elements.mobileNav.hidden = !isMobile;
  elements.appShell.dataset.mobileTab = isMobile ? activeTab : "";
  elements.mobileFab.hidden = !isMobile || activeTab !== "forecast";
  elements.openEntryModal.hidden = isMobile;

  sections.forEach(({ element, tabs }) => {
    if (!element) return;
    element.hidden = isMobile ? !tabs.includes(activeTab) : false;
  });

  if (elements.plansPanel && isMobile) {
    elements.plansPanel.open = activeTab === "plans";
  }

  elements.mobileNavButtons.forEach((button) => {
    const isActive = button.dataset.mobileTabTarget === activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function renderUndoBanner() {
  const notice = state.ui.undoNotice;
  const isVisible = notice && notice.expiresAt > Date.now();
  elements.undoBanner.classList.toggle("is-visible", Boolean(isVisible));
  elements.undoBanner.setAttribute("aria-hidden", isVisible ? "false" : "true");
  if (!isVisible) {
    state.ui.undoNotice = null;
    elements.undoMessage.textContent = "";
    return;
  }

  elements.undoMessage.textContent = notice.label;
}

function renderWarning(lowestPoint) {
  if (lowestPoint.balance < state.account.warningThreshold) {
    const when = lowestPoint.event ? ` after ${lowestPoint.event.label} on ${formatDate(lowestPoint.event.date)}` : "";
    elements.warningBanner.hidden = false;
    elements.warningBanner.textContent = `Projected balance drops to ${formatCurrency(lowestPoint.balance)}${when}.`;
  } else {
    elements.warningBanner.hidden = true;
    elements.warningBanner.textContent = "";
  }
}

function renderTimeline(timeline) {
  if (!timeline.length) {
    elements.timelineList.innerHTML = `<div class="empty-state">No included future events yet. Add salary, rent, groceries, or include a plan to start the forecast.</div>`;
    return;
  }

  elements.timelineList.innerHTML = timeline.map((item) => {
    const event = item.event;
    const isBucketEvent = event.id.startsWith("bucket-");
    const displayAmount = effectiveAmount(event);
    const amountClass = displayAmount >= 0 ? "income" : "expense";
    const scenario = event.scenarioId ? state.scenarios.find((entry) => entry.id === event.scenarioId) : null;
    const chips = [
      event.isSettled ? `<span class="chip">Settled</span>` : "",
      scenario ? `<span class="chip active">${escapeHTML(scenario.name)}</span>` : "",
      item.runningBalance < state.account.warningThreshold ? `<span class="chip warning">Below floor</span>` : "",
      event.category ? `<span class="chip">${escapeHTML(event.category)}</span>` : ""
    ].filter(Boolean).join("");

    return `
      <section class="timeline-item">
        <div class="timeline-top">
          <div class="timeline-main">
            <p class="timeline-title">${escapeHTML(event.label)}</p>
            <p class="timeline-meta">${formatDate(event.date)}${event.notes ? ` • ${escapeHTML(event.notes)}` : ""}</p>
          </div>
          <div class="timeline-side">
            <p class="timeline-amount ${amountClass}">${formatCurrency(displayAmount)}</p>
            ${isBucketEvent ? "" : `
            <div class="button-row timeline-actions">
              <button class="ghost-button small" data-action="toggle-settled" data-event-id="${event.id}">
                ${event.isSettled ? "Mark upcoming" : "Mark settled"}
              </button>
              <button class="ghost-button small" data-action="edit-event" data-event-id="${event.id}">Edit</button>
            </div>
            `}
          </div>
        </div>
        <div class="timeline-bottom">
          <div class="chip-row">
            ${chips}
            ${event.actualAmount !== null && event.actualAmount !== undefined ? `<span class="chip">Actual: ${formatCurrency(event.actualAmount)}</span>` : ""}
            <span class="chip">After event: ${formatCurrency(item.runningBalance)}</span>
          </div>
        </div>
      </section>
    `;
  }).join("");

  elements.timelineList.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", handleTimelineAction);
  });
}

function renderScenarios() {
  if (!state.scenarios.length) {
    elements.scenarioList.innerHTML = `<div class="empty-state">No plans yet. Create a trip, move, or purchase plan and toggle it into the forecast when you want to see the impact.</div>`;
    return;
  }

  elements.scenarioList.innerHTML = state.scenarios.map((scenario) => {
    const events = state.events
      .filter((event) => event.scenarioId === scenario.id)
      .sort((left, right) => left.date.localeCompare(right.date));
    const total = events.reduce((sum, event) => sum + event.amount, 0);

    return `
      <section class="scenario-card">
        <div class="scenario-top">
          <div>
            <p class="timeline-title">${escapeHTML(scenario.name)}</p>
            <p class="scenario-copy">${escapeHTML(scenario.description || "Optional scenario")}</p>
          </div>
          <button class="primary-button small" data-action="toggle-scenario" data-scenario-id="${scenario.id}">
            ${scenario.isIncluded ? "Included" : "Excluded"}
          </button>
        </div>
        <div class="chip-row">
          <span class="chip">${events.length} event${events.length === 1 ? "" : "s"}</span>
          <span class="chip">${formatCurrency(total)}</span>
        </div>
        <div class="button-row">
          <button class="ghost-button small" data-action="open-scenario" data-scenario-id="${scenario.id}">Open plan</button>
        </div>
      </section>
    `;
  }).join("");

  elements.scenarioList.querySelectorAll("button[data-action='toggle-scenario']").forEach((button) => {
    button.addEventListener("click", () => {
      const scenario = state.scenarios.find((entry) => entry.id === button.dataset.scenarioId);
      if (!scenario) return;
      scenario.isIncluded = !scenario.isIncluded;
      persist();
      render();
    });
  });

  elements.scenarioList.querySelectorAll("button[data-action='open-scenario']").forEach((button) => {
    button.addEventListener("click", () => openPlanModal(button.dataset.scenarioId));
  });
}

function renderTemplates() {
  elements.templateList.innerHTML = state.templates.map((template) => `
    <section class="template-card">
      <div class="template-top">
        <div>
          <p class="timeline-title">${escapeHTML(template.label)}</p>
          <p class="template-copy">${escapeHTML(template.category)} • Creates an event ${template.daysFromNow} day${template.daysFromNow === 1 ? "" : "s"} from today.</p>
        </div>
        <p class="timeline-amount ${template.amount >= 0 ? "income" : "expense"}">${formatCurrency(template.amount)}</p>
      </div>
      <div class="button-row">
        <button class="ghost-button small" data-action="use-template" data-template-id="${template.id}">Use template</button>
      </div>
    </section>
  `).join("");

  elements.templateList.querySelectorAll("button[data-action='use-template']").forEach((button) => {
    button.addEventListener("click", () => {
      const template = state.templates.find((entry) => entry.id === button.dataset.templateId);
      if (!template) return;
      state.events.push({
        id: crypto.randomUUID(),
        label: template.label,
        amount: template.amount,
        date: addDaysISO(localISODate(new Date()), template.daysFromNow),
        scenarioId: null,
        isSettled: false,
        category: template.category,
        actualAmount: null,
        notes: "Created from template."
      });
      logHistory("added", `Added ${template.label} from template.`);
      persist();
      render();
    });
  });
}

function renderBuckets() {
  const monthKey = currentMonthKey();
  const monthBuckets = state.buckets[monthKey];

  elements.bucketList.innerHTML = BUCKET_CATEGORIES.map((category) => {
    const bucket = monthBuckets[category];
    const spent = bucket.entries.reduce((sum, entry) => sum + entry.amount, 0);
    const remaining = bucket.budgeted - spent;

    return `
      <section class="bucket-card">
        <div class="bucket-header-row">
          <div>
            <p class="timeline-title">${escapeHTML(category)}</p>
            <p class="template-copy">Budget for ${formatMonthKey(monthKey)}</p>
          </div>
          <button class="ghost-button small" data-action="edit-bucket-budget" data-category="${category}">Set budget</button>
        </div>
        <div class="bucket-stat-row">
          <div class="bucket-stat">
            <p class="metric-label">Budgeted</p>
            <strong>${formatCurrency(bucket.budgeted)}</strong>
          </div>
          <div class="bucket-stat">
            <p class="metric-label">Spent</p>
            <strong>${formatCurrency(spent)}</strong>
          </div>
          <div class="bucket-stat">
            <p class="metric-label">Remaining</p>
            <strong>${formatCurrency(remaining)}</strong>
          </div>
        </div>
        <div class="chip-row bucket-meta-row">
          <span class="chip">${bucket.entries.length} ${bucket.entries.length === 1 ? "entry" : "entries"}</span>
        </div>
        <p class="bucket-helper">Forecast impact this month: ${formatCurrency(Math.max(remaining, 0))} remaining.</p>
        <div class="bucket-action-grid">
          <input class="bucket-inline-input" type="number" step="10" min="0" placeholder="Log spend" data-action="bucket-spend-input" data-category="${category}">
          <button class="ghost-button small" data-action="log-bucket-spend" data-category="${category}">Add</button>
        </div>
      </section>
    `;
  }).join("");

  elements.bucketList.querySelectorAll("button[data-action='edit-bucket-budget']").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      openSettingsModal("bucket-budget", { category, monthKey });
    });
  });

  elements.bucketList.querySelectorAll("button[data-action='log-bucket-spend']").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      const input = elements.bucketList.querySelector(`input[data-action='bucket-spend-input'][data-category='${category}']`);
      const value = Number(input?.value);
      if (Number.isNaN(value) || value <= 0) return;
      state.buckets[monthKey][category].entries.push({
        id: crypto.randomUUID(),
        amount: value,
        date: localISODate(new Date()),
        note: ""
      });
      logHistory("added", `Logged ${formatCurrency(value)} to ${category}.`);
      persist();
      render();
    });
  });
}

function renderBucketHistory() {
  const historyRows = Object.keys(state.buckets)
    .sort()
    .reverse()
    .slice(0, 6)
    .flatMap((monthKey) => {
      const monthBuckets = state.buckets[monthKey];
      return BUCKET_CATEGORIES.map((category) => {
        const bucket = monthBuckets[category];
        const spent = bucket.entries.reduce((sum, entry) => sum + entry.amount, 0);
        return {
          monthKey,
          category,
          budgeted: bucket.budgeted,
          spent,
          variance: bucket.budgeted - spent
        };
      });
    });

  if (!historyRows.length) {
    elements.bucketHistoryList.innerHTML = `<div class="empty-state">Once you start logging grocery and misc spend, recent monthly variance will appear here.</div>`;
    return;
  }

  elements.bucketHistoryList.innerHTML = historyRows.map((row) => `
    <div class="history-item">
      <strong>${escapeHTML(row.category)} • ${escapeHTML(formatMonthKey(row.monthKey))}</strong>
      <p class="history-copy">Budget ${formatCurrency(row.budgeted)} • Spent ${formatCurrency(row.spent)} • Against plan ${formatSignedCurrency(row.variance)}</p>
    </div>
  `).join("");
}

function renderInsights(insights) {
  if (!insights.byCategory.length) {
    elements.categoryBreakdown.innerHTML = `<div class="empty-state">Settle a few categorized events and you will get a simple monthly spend breakdown here.</div>`;
    return;
  }

  elements.categoryBreakdown.innerHTML = insights.byCategory.map((entry) => `
    <div class="breakdown-item">
      <div>
        <strong>${escapeHTML(entry.category)}</strong>
        <p class="breakdown-copy">Settled spend this month</p>
      </div>
      <strong>${formatCurrency(entry.total)}</strong>
    </div>
  `).join("");
}

function renderHistory() {
  if (!state.ui.history.length) {
    elements.historyList.innerHTML = `<div class="empty-state">Recent meaningful changes from the last ${HISTORY_WINDOW_HOURS} hours will appear here.</div>`;
    return;
  }

  elements.historyList.innerHTML = state.ui.history.map((entry) => `
    <div class="history-item">
      <strong>${escapeHTML(entry.label)}</strong>
      <p class="history-copy">${formatTimestamp(entry.at)}</p>
    </div>
  `).join("");
}

function openEntryModal(entry = null) {
  elements.entryForm.reset();
  elements.entryId.value = entry?.id || "";
  elements.entryLabel.value = entry?.label || "";
  elements.entryAmount.value = entry?.amount ?? "";
  elements.entryDate.value = entry?.date || localISODate(new Date());
  elements.entrySettled.checked = entry?.isSettled || false;
  elements.entryActualAmount.value = entry?.actualAmount ?? "";
  elements.entryNotes.value = entry?.notes || "";
  elements.entryModalTitle.textContent = entry ? "Edit money event" : "Add money event";
  elements.deleteEntryButton.hidden = !entry;
  syncScenarioOptions(entry?.scenarioId || "");
  syncCategoryOptions(entry?.category || inferCategory(entry?.label || ""));
  elements.entryModal.showModal();
}

function handleEntrySubmit(event) {
  event.preventDefault();

  const actualValue = elements.entryActualAmount.value.trim();
  const payload = {
    id: elements.entryId.value || crypto.randomUUID(),
    label: elements.entryLabel.value.trim(),
    amount: Number(elements.entryAmount.value),
    date: elements.entryDate.value,
    scenarioId: elements.entryScenario.value || null,
    category: elements.entryCategory.value || "Misc",
    isSettled: elements.entrySettled.checked,
    actualAmount: actualValue ? Number(actualValue) : null,
    notes: elements.entryNotes.value.trim()
  };

  if (!payload.label || Number.isNaN(payload.amount) || !payload.date || (actualValue && Number.isNaN(payload.actualAmount))) {
    return;
  }

  const existingIndex = state.events.findIndex((item) => item.id === payload.id);
  if (existingIndex >= 0) {
    state.events[existingIndex] = payload;
    logHistory("edited", `Edited ${payload.label}.`);
  } else {
    state.events.push(payload);
    logHistory("added", `Added ${payload.label}.`);
  }

  persist();
  elements.entryModal.close();
  render();
}

function handleEntryDelete() {
  const id = elements.entryId.value;
  const target = state.events.find((event) => event.id === id);
  if (!target) return;

  registerUndo("deleted", `Deleted ${target.label}`);
  state.events = state.events.filter((event) => event.id !== id);
  logHistory("deleted", `Deleted ${target.label}.`);
  persist();
  elements.entryModal.close();
  render();
}

function handleQuickAdd() {
  const raw = elements.quickAddInput.value.trim();
  if (!raw) return;

  const parsed = parseQuickAdd(raw);
  state.events.push(parsed);
  elements.quickAddInput.value = "";
  logHistory("added", `Added ${parsed.label}.`);
  persist();
  render();
}

function handleTimelineAction(event) {
  const action = event.currentTarget.dataset.action;
  const eventId = event.currentTarget.dataset.eventId;
  const entry = state.events.find((item) => item.id === eventId);
  if (!entry) return;

  if (action === "toggle-settled") {
    const label = `${entry.isSettled ? "Reopened" : "Settled"} ${entry.label}`;
    registerUndo(entry.isSettled ? "reopened" : "settled", label);
    entry.isSettled = !entry.isSettled;
    if (!entry.isSettled) entry.actualAmount = null;
    logHistory(entry.isSettled ? "settled" : "reopened", label);
    persist();
    render();
    return;
  }

  if (action === "edit-event") {
    openEntryModal(entry);
  }
}

function openPlanModal(scenarioId = null) {
  elements.scenarioForm.reset();
  elements.scenarioEventDate.value = localISODate(new Date());
  syncCategoryOptionsForPlan();

  if (!scenarioId) {
    activePlanId = null;
    planDraftEvents = [];
    elements.scenarioId.value = "";
    elements.scenarioModalTitle.textContent = "Create plan";
    elements.deleteScenarioButton.hidden = true;
  } else {
    const scenario = state.scenarios.find((entry) => entry.id === scenarioId);
    if (!scenario) return;
    activePlanId = scenarioId;
    elements.scenarioId.value = scenarioId;
    elements.scenarioName.value = scenario.name;
    elements.scenarioDescription.value = scenario.description || "";
    elements.scenarioModalTitle.textContent = "Edit plan";
    elements.deleteScenarioButton.hidden = false;
    planDraftEvents = state.events
      .filter((event) => event.scenarioId === scenarioId)
      .map((event) => ({ ...event }));
  }

  renderPlanEvents();
  elements.scenarioModal.showModal();
}

function handleAddPlanEvent() {
  const label = elements.scenarioEventLabel.value.trim();
  const amount = Number(elements.scenarioEventAmount.value);
  const date = elements.scenarioEventDate.value;
  const category = elements.scenarioEventCategory.value || "Misc";
  const notes = elements.scenarioEventNotes.value.trim();

  if (!label || Number.isNaN(amount) || !date) return;

  planDraftEvents.push({
    id: crypto.randomUUID(),
    label,
    amount,
    date,
    scenarioId: activePlanId,
    category,
    isSettled: false,
    actualAmount: null,
    notes
  });

  elements.scenarioEventLabel.value = "";
  elements.scenarioEventAmount.value = "";
  elements.scenarioEventNotes.value = "";
  elements.scenarioEventDate.value = date;
  renderPlanEvents();
}

function renderPlanEvents() {
  if (!planDraftEvents.length) {
    elements.scenarioEventsList.innerHTML = `<div class="empty-state">Add the costs or income that belong inside this plan. They will only appear in the main forecast when the plan is included.</div>`;
    return;
  }

  elements.scenarioEventsList.innerHTML = planDraftEvents
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((event) => `
      <div class="history-item">
        <div class="template-top">
          <div>
            <strong>${escapeHTML(event.label)}</strong>
            <p class="history-copy">${formatDate(event.date)} • ${escapeHTML(event.category)}</p>
          </div>
          <strong>${formatCurrency(event.amount)}</strong>
        </div>
        <div class="button-row">
          <button class="ghost-button small" data-action="remove-plan-event" data-event-id="${event.id}">Remove</button>
        </div>
      </div>
    `).join("");

  elements.scenarioEventsList.querySelectorAll("button[data-action='remove-plan-event']").forEach((button) => {
    button.addEventListener("click", () => {
      planDraftEvents = planDraftEvents.filter((event) => event.id !== button.dataset.eventId);
      renderPlanEvents();
    });
  });
}

function handleScenarioSubmit(event) {
  event.preventDefault();

  const name = elements.scenarioName.value.trim();
  if (!name) return;

  const description = elements.scenarioDescription.value.trim();
  const existingId = elements.scenarioId.value;

  if (existingId) {
    const scenario = state.scenarios.find((entry) => entry.id === existingId);
    if (!scenario) return;
    scenario.name = name;
    scenario.description = description;
    state.events = state.events.filter((entry) => entry.scenarioId !== existingId);
    state.events.push(...planDraftEvents.map((entry) => ({ ...entry, scenarioId: existingId })));
  } else {
    const scenarioId = crypto.randomUUID();
    state.scenarios.push({
      id: scenarioId,
      name,
      description,
      isIncluded: false
    });
    state.events.push(...planDraftEvents.map((entry) => ({ ...entry, scenarioId })));
  }

  persist();
  elements.scenarioModal.close();
  render();
}

function handleDeleteScenario() {
  const scenarioId = elements.scenarioId.value;
  if (!scenarioId) return;

  state.scenarios = state.scenarios.filter((scenario) => scenario.id !== scenarioId);
  state.events = state.events.filter((event) => event.scenarioId !== scenarioId);
  persist();
  elements.scenarioModal.close();
  render();
}

function openSettingsModal(kind, meta = {}) {
  pendingSetting = { kind, ...meta };
  if (kind === "balance") {
    elements.settingsTitle.textContent = "Update current balance";
    elements.settingsLabel.textContent = "Current balance";
    elements.settingsValue.value = state.account.currentBalance;
  } else if (kind === "threshold") {
    elements.settingsTitle.textContent = "Update warning floor";
    elements.settingsLabel.textContent = "Warning floor";
    elements.settingsValue.value = state.account.warningThreshold;
  } else if (kind === "bucket-budget") {
    const monthKey = meta.monthKey || currentMonthKey();
    ensureMonthBuckets(state, monthKey);
    elements.settingsTitle.textContent = `Update ${meta.category} budget`;
    elements.settingsLabel.textContent = `${meta.category} budget for ${formatMonthKey(monthKey)}`;
    elements.settingsValue.value = state.buckets[monthKey][meta.category].budgeted;
  }

  elements.settingsModal.showModal();
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const value = Number(elements.settingsValue.value);
  if (Number.isNaN(value) || !pendingSetting) return;

  if (pendingSetting.kind === "balance") {
    state.account.currentBalance = value;
  } else if (pendingSetting.kind === "threshold") {
    state.account.warningThreshold = value;
  } else if (pendingSetting.kind === "bucket-budget") {
    ensureMonthBuckets(state, pendingSetting.monthKey);
    state.buckets[pendingSetting.monthKey][pendingSetting.category].budgeted = value;
    logHistory("edited", `Updated ${pendingSetting.category} budget.`);
  }

  persist();
  elements.settingsModal.close();
  render();
}

function computeForecast(sourceState) {
  const includedScenarioIds = new Set(
    sourceState.scenarios.filter((scenario) => scenario.isIncluded).map((scenario) => scenario.id)
  );
  const bucketEvents = buildBucketForecastEvents(sourceState);

  const timeline = [...sourceState.events, ...bucketEvents]
    .filter((event) => !event.isSettled)
    .filter((event) => !event.scenarioId || includedScenarioIds.has(event.scenarioId))
    .sort(compareEvents)
    .map((event) => ({ event }));

  let runningBalance = sourceState.account.currentBalance;
  const withBalances = timeline.map((entry) => {
    runningBalance += effectiveAmount(entry.event);
    return { ...entry, runningBalance };
  });

  let lowestBalance = { balance: sourceState.account.currentBalance, event: null };
  withBalances.forEach((entry) => {
    if (entry.runningBalance < lowestBalance.balance) {
      lowestBalance = { balance: entry.runningBalance, event: entry.event };
    }
  });

  return {
    timeline: withBalances,
    lowestBalance
  };
}

function computeInsights(sourceState) {
  const monthPrefix = currentMonthKey();
  const settledThisMonth = sourceState.events.filter((event) => event.isSettled && event.date.startsWith(monthPrefix));
  const bucketSpendThisMonth = sourceState.buckets[monthPrefix]
    ? BUCKET_CATEGORIES.flatMap((category) =>
        sourceState.buckets[monthPrefix][category].entries.map((entry) => ({
          category,
          amount: entry.amount
        }))
      )
    : [];
  const settledSpend = settledThisMonth
    .filter((event) => effectiveAmount(event) < 0)
    .reduce((sum, event) => sum + Math.abs(effectiveAmount(event)), 0) +
    bucketSpendThisMonth.reduce((sum, entry) => sum + entry.amount, 0);

  const varianceAgainstPlan = settledThisMonth.reduce((sum, event) => {
    if (event.actualAmount === null || event.actualAmount === undefined) return sum;
    return sum + (event.actualAmount - event.amount);
  }, 0) + calculateBucketVariance(sourceState, monthPrefix);

  const byCategory = CATEGORY_OPTIONS
    .map((category) => {
      const total = settledThisMonth
        .filter((event) => event.category === category && effectiveAmount(event) < 0)
        .reduce((sum, event) => sum + Math.abs(effectiveAmount(event)), 0);
      const bucketTotal = bucketSpendThisMonth
        .filter((entry) => entry.category === category)
        .reduce((sum, entry) => sum + entry.amount, 0);
      return { category, total: total + bucketTotal };
    })
    .filter((entry) => entry.total > 0)
    .sort((left, right) => right.total - left.total)
    .slice(0, 5);

  return {
    settledSpend,
    varianceAgainstPlan,
    byCategory
  };
}

function projectionAtDate(timeline, isoDate, startingBalance) {
  const matchingEntry = [...timeline].reverse().find((entry) => entry.event.date <= isoDate);
  return matchingEntry ? matchingEntry.runningBalance : startingBalance;
}

function parseQuickAdd(raw) {
  const sanitized = raw.trim();
  const detectedDate = inferDateFromText(sanitized);
  const cleanedForAmount = stripDateText(sanitized);
  const amountMatch = cleanedForAmount.match(/-?\d+(?:[.,]\d{1,2})?/);
  const amount = amountMatch ? Number(amountMatch[0].replace(",", ".")) : 0;
  const label = cleanedForAmount.replace(amountMatch?.[0] || "", "").trim().replace(/\s+/g, " ");

  return {
    id: crypto.randomUUID(),
    label: label || "Quick event",
    amount: inferSignedAmount(sanitized, amount),
    date: detectedDate,
    scenarioId: null,
    category: inferCategory(sanitized),
    isSettled: false,
    actualAmount: null,
    notes: "Added from quick entry."
  };
}

function inferDateFromText(raw) {
  const lower = raw.toLowerCase();
  const today = localISODate(new Date());
  if (lower.includes("today")) return today;
  if (lower.includes("tomorrow")) return addDaysISO(today, 1);

  const monthDayMatch = raw.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDayMatch) {
    const monthIndex = monthNames().findIndex((month) => month.startsWith(monthDayMatch[1].toLowerCase()));
    if (monthIndex >= 0) {
      return buildISODate(new Date().getFullYear(), monthIndex + 1, Number(monthDayMatch[2]));
    }
  }

  const dayMonthMatch = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\b/i);
  if (dayMonthMatch) {
    const monthIndex = monthNames().findIndex((month) => month.startsWith(dayMonthMatch[2].toLowerCase()));
    if (monthIndex >= 0) {
      return buildISODate(new Date().getFullYear(), monthIndex + 1, Number(dayMonthMatch[1]));
    }
  }

  const numericMatch = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numericMatch) {
    const year = numericMatch[3] ? normalizeYear(Number(numericMatch[3])) : new Date().getFullYear();
    return buildISODate(year, Number(numericMatch[2]), Number(numericMatch[1]));
  }

  return today;
}

function stripDateText(raw) {
  return raw
    .replace(/\b(today|tomorrow)\b/gi, "")
    .replace(/\b[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, "")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\b/gi, "")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, "")
    .trim();
}

function inferSignedAmount(raw, amount) {
  const lower = raw.toLowerCase();
  const absolute = Math.abs(amount);
  if (amount < 0) return amount;
  if (["salary", "pay", "invoice", "bonus", "refund", "income"].some((keyword) => lower.includes(keyword))) return absolute;
  return -absolute;
}

function inferCategory(raw) {
  const lower = raw.toLowerCase();
  if (["salary", "bonus", "invoice", "refund", "income"].some((keyword) => lower.includes(keyword))) return "Income";
  if (["rent", "mortgage", "apartment"].some((keyword) => lower.includes(keyword))) return "Housing";
  if (["groceries", "grocery", "food", "supermarket"].some((keyword) => lower.includes(keyword))) return "Groceries";
  if (["bill", "phone", "subscription", "internet", "electricity"].some((keyword) => lower.includes(keyword))) return "Bills";
  if (["train", "taxi", "uber", "bus", "fuel"].some((keyword) => lower.includes(keyword))) return "Transport";
  if (["flight", "hotel", "trip", "travel"].some((keyword) => lower.includes(keyword))) return "Travel";
  if (["buy", "shopping", "purchase", "clothes"].some((keyword) => lower.includes(keyword))) return "Shopping";
  return "Misc";
}

function effectiveAmount(event) {
  if (event.isSettled && event.actualAmount !== null && event.actualAmount !== undefined) return event.actualAmount;
  return event.amount;
}

function buildBucketForecastEvents(sourceState) {
  const monthKey = currentMonthKey();
  ensureMonthBuckets(sourceState, monthKey);
  const monthEnd = endOfMonthISO(`${monthKey}-01`);

  return BUCKET_CATEGORIES.map((category) => {
    const bucket = sourceState.buckets[monthKey][category];
    const spent = bucket.entries.reduce((sum, entry) => sum + entry.amount, 0);
    const remaining = Math.max(bucket.budgeted - spent, 0);

    return {
      id: `bucket-${monthKey}-${category}`,
      label: `${category} remaining budget`,
      amount: -remaining,
      date: monthEnd,
      scenarioId: null,
      category,
      isSettled: false,
      actualAmount: null,
      notes: `Remaining ${formatMonthKey(monthKey)} bucket.`
    };
  }).filter((event) => event.amount !== 0);
}

function calculateBucketVariance(sourceState, monthKey) {
  const monthBuckets = sourceState.buckets[monthKey];
  if (!monthBuckets) return 0;

  return BUCKET_CATEGORIES.reduce((sum, category) => {
    const bucket = monthBuckets[category];
    const spent = bucket.entries.reduce((entrySum, entry) => entrySum + entry.amount, 0);
    return sum + (bucket.budgeted - spent);
  }, 0);
}

function currentMonthKey() {
  return localISODate(new Date()).slice(0, 7);
}

function ensureCurrentMonthBuckets(sourceState) {
  ensureMonthBuckets(sourceState, currentMonthKey());
}

function ensureMonthBuckets(sourceState, monthKey) {
  sourceState.buckets ||= {};
  sourceState.buckets[monthKey] ||= {};
  BUCKET_CATEGORIES.forEach((category) => {
    sourceState.buckets[monthKey][category] ||= {
      budgeted: 1000,
      entries: []
    };
  });
}

function registerUndo(action, label) {
  if (!UNDOABLE_ACTIONS.has(action)) return;
  undoStack.push(structuredClone(state));
  if (undoStack.length > 20) undoStack = undoStack.slice(-20);
  state.ui.undoNotice = {
    label,
    expiresAt: Date.now() + UNDO_VISIBLE_MS
  };
  scheduleUndoHide();
}

function handleUndo() {
  const previous = undoStack.pop();
  if (!previous) return;
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }
  state = normalizeState(previous);
  state.ui.undoNotice = null;
  logHistory("undid", "Undid last change.");
  persist();
  render();
}

function logHistory(action, label) {
  if (!HISTORY_ACTIONS.has(action)) return;
  pruneHistory();
  state.ui.history = [
    { action, label, at: new Date().toISOString() },
    ...(state.ui.history || [])
  ].slice(0, 20);
}

function pruneHistory() {
  const cutoff = Date.now() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000;
  state.ui.history = (state.ui.history || []).filter((entry) => new Date(entry.at).getTime() >= cutoff);
}

function scheduleUndoHide() {
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    state.ui.undoNotice = null;
    undoTimer = null;
    persist();
    render();
  }, UNDO_VISIBLE_MS);
}

function syncScenarioOptions(selectedScenarioId = "") {
  elements.entryScenario.innerHTML = [
    `<option value="">No plan</option>`,
    ...state.scenarios.map((scenario) => `<option value="${scenario.id}" ${selectedScenarioId === scenario.id ? "selected" : ""}>${escapeHTML(scenario.name)}</option>`)
  ].join("");
}

function syncCategoryOptions(selectedCategory = "Misc") {
  elements.entryCategory.innerHTML = CATEGORY_OPTIONS.map((category) => `
    <option value="${category}" ${selectedCategory === category ? "selected" : ""}>${category}</option>
  `).join("");
}

function syncCategoryOptionsForPlan(selectedCategory = "Misc") {
  elements.scenarioEventCategory.innerHTML = CATEGORY_OPTIONS.map((category) => `
    <option value="${category}" ${selectedCategory === category ? "selected" : ""}>${category}</option>
  `).join("");
}

function compareEvents(left, right) {
  if (left.date === right.date) return left.amount - right.amount;
  return left.date.localeCompare(right.date);
}

function loadLocalCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored) return normalizeState(stored);
  } catch (error) {
    console.warn("Unable to read local state", error);
  }
  return normalizeState(structuredClone(defaultState));
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
  if (authUser && supabaseClient) {
    elements.syncBadge.textContent = "Saving";
    void saveRemoteState();
  }
}

async function loadRemoteState() {
  if (!authUser || !supabaseClient) return;

  elements.syncBadge.textContent = "Loading latest data";
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("state, updated_at")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (error) {
    console.error("Unable to load remote state", error);
    elements.syncBadge.textContent = "Using local cache";
    return;
  }

  if (!data) {
    state = normalizeState(structuredClone(defaultState));
    persist();
    elements.syncBadge.textContent = "Synced";
    render();
    return;
  }

  lastRemoteUpdatedAt = data.updated_at || null;
  state = normalizeState(data.state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
  elements.syncBadge.textContent = "Synced";
  render();
}

async function refreshRemoteState() {
  if (!authUser || !supabaseClient) return;
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select("state, updated_at")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (error || !data?.updated_at) return;
  if (lastRemoteUpdatedAt && data.updated_at <= lastRemoteUpdatedAt) return;
  lastRemoteUpdatedAt = data.updated_at;
  state = normalizeState(data.state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
  render();
}

async function saveRemoteState() {
  if (!authUser || !supabaseClient) return;

  const payload = {
    user_id: authUser.id,
    state: serializeState(state),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert(payload);
  if (error) {
    console.error("Unable to save remote state", error);
    elements.syncBadge.textContent = "Sync failed";
    return;
  }

  lastRemoteUpdatedAt = payload.updated_at;
  elements.syncBadge.textContent = "Synced";
}

function serializeState(sourceState) {
  return {
    account: sourceState.account,
    ui: {
      selectedDate: sourceState.ui.selectedDate,
      history: sourceState.ui.history || []
    },
    buckets: sourceState.buckets,
    scenarios: sourceState.scenarios,
    templates: sourceState.templates,
    events: sourceState.events
  };
}

function normalizeState(rawState) {
  const normalizedBuckets = {};
  const rawBuckets = rawState.buckets || {};
  Object.keys(rawBuckets).forEach((monthKey) => {
    normalizedBuckets[monthKey] = {};
    BUCKET_CATEGORIES.forEach((category) => {
      const rawBucket = rawBuckets[monthKey]?.[category] || {};
      normalizedBuckets[monthKey][category] = {
        budgeted: Number(rawBucket.budgeted) || 1000,
        entries: Array.isArray(rawBucket.entries)
          ? rawBucket.entries.map((entry) => ({
              id: entry.id || crypto.randomUUID(),
              amount: Number(entry.amount) || 0,
              date: entry.date || `${monthKey}-01`,
              note: entry.note || ""
            }))
          : []
      };
    });
  });

  if (!Object.keys(normalizedBuckets).length) {
    const monthKey = currentMonthKey();
    normalizedBuckets[monthKey] = {
      Groceries: { budgeted: 1000, entries: [] },
      Misc: { budgeted: 1000, entries: [] }
    };
  }

  return {
    account: {
      currentBalance: rawState.account?.currentBalance ?? defaultState.account.currentBalance,
      warningThreshold: rawState.account?.warningThreshold ?? defaultState.account.warningThreshold
    },
    ui: {
      selectedDate: rawState.ui?.selectedDate || localISODate(new Date()),
      undoNotice: null,
      history: Array.isArray(rawState.ui?.history) ? rawState.ui.history : []
    },
    buckets: normalizedBuckets,
    scenarios: (rawState.scenarios || []).map((scenario) => ({
      id: scenario.id || crypto.randomUUID(),
      name: scenario.name || "Plan",
      description: scenario.description || "",
      isIncluded: Boolean(scenario.isIncluded)
    })),
    templates: (rawState.templates || defaultState.templates).map((template) => ({
      id: template.id || crypto.randomUUID(),
      label: template.label || "Template",
      amount: Number(template.amount) || 0,
      daysFromNow: Number(template.daysFromNow) || 0,
      category: template.category || inferCategory(template.label || "")
    })),
    events: (rawState.events || []).map((event) => ({
      id: event.id || crypto.randomUUID(),
      label: event.label || "Event",
      amount: Number(event.amount) || 0,
      date: event.date || localISODate(new Date()),
      scenarioId: event.scenarioId || null,
      category: event.category || inferCategory(event.label || ""),
      isSettled: Boolean(event.isSettled),
      actualAmount: event.actualAmount === null || event.actualAmount === undefined || event.actualAmount === "" ? null : Number(event.actualAmount),
      notes: event.notes || ""
    }))
  };
}

function seedEvents(targetState) {
  if (targetState.events.length) return;
  const today = localISODate(new Date());
  targetState.events.push(
    {
      id: crypto.randomUUID(),
      label: "Salary",
      amount: 22000,
      date: addDaysISO(today, 14),
      scenarioId: null,
      category: "Income",
      isSettled: false,
      actualAmount: null,
      notes: "Expected monthly pay."
    },
    {
      id: crypto.randomUUID(),
      label: "Rent",
      amount: -9500,
      date: addDaysISO(today, 12),
      scenarioId: null,
      category: "Housing",
      isSettled: false,
      actualAmount: null,
      notes: "Primary housing cost."
    },
    {
      id: crypto.randomUUID(),
      label: "Groceries estimate",
      amount: -900,
      date: addDaysISO(today, 2),
      scenarioId: null,
      category: "Groceries",
      isSettled: false,
      actualAmount: null,
      notes: "Weekly food estimate."
    },
    {
      id: crypto.randomUUID(),
      label: "Flight to Marrakech",
      amount: -2400,
      date: addDaysISO(today, 26),
      scenarioId: targetState.scenarios[0].id,
      category: "Travel",
      isSettled: false,
      actualAmount: null,
      notes: "Optional trip cost."
    },
    {
      id: crypto.randomUUID(),
      label: "Hotel deposit",
      amount: -1800,
      date: addDaysISO(today, 33),
      scenarioId: targetState.scenarios[0].id,
      category: "Travel",
      isSettled: false,
      actualAmount: null,
      notes: "Optional trip cost."
    }
  );
}

function localISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildISODate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysISO(baseISO, days) {
  const date = fromISO(baseISO);
  date.setDate(date.getDate() + days);
  return localISODate(date);
}

function endOfMonthISO(baseISO) {
  const date = fromISO(baseISO);
  return buildISODate(date.getFullYear(), date.getMonth() + 1, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());
}

function fromISO(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function normalizeYear(year) {
  return year < 100 ? 2000 + year : year;
}

function monthNames() {
  return [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0
  }).format(value);
}

function formatSignedCurrency(value) {
  const formatted = formatCurrency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short"
  }).format(fromISO(isoDate));
}

function formatTimestamp(isoString) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoString));
}

function formatMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

function buildSelectedDateCaption(isoDate, balance) {
  return `If included events land by ${formatDate(isoDate)}, the projected balance is ${formatCurrency(balance)}.`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
