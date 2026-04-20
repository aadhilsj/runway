const STORAGE_KEY = "runway-mvp-v2";
const SUPABASE_TABLE = "runway_state";
const HISTORY_WINDOW_HOURS = 12;
const UNDO_VISIBLE_MS = 3000;
const MOBILE_BREAKPOINT = 720;
const BUILD_VERSION = window.RUNWAY_BUILD || "dev";
const DEFAULT_BUCKET_TEMPLATES = [
  { name: "Groceries", defaultBudget: 1000, isEnabledByDefault: true },
  { name: "Misc", defaultBudget: 1000, isEnabledByDefault: true }
];
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

const defaultState = {
  account: {
    currentBalance: 18240,
    warningThreshold: 2500
  },
  meta: {
    lastModifiedAt: null
  },
  ui: {
    selectedDate: localISODate(new Date()),
    mobileTab: "forecast",
    clarityExpanded: false,
    timelineSearch: "",
    timelineStatusFilter: "all",
    timelineCategoryFilter: "all",
    timelineSelectionMode: false,
    selectedTimelineEventIds: [],
    undoNotice: null,
    history: []
  },
  bucketTemplates: structuredClone(DEFAULT_BUCKET_TEMPLATES),
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
    { id: crypto.randomUUID(), type: "single", label: "Salary", description: "", amount: 22000, date: addDaysISO(localISODate(new Date()), 14), category: "Income" },
    { id: crypto.randomUUID(), type: "single", label: "Rent", description: "", amount: -9500, date: addDaysISO(localISODate(new Date()), 12), category: "Housing" },
    { id: crypto.randomUUID(), type: "single", label: "Groceries", description: "", amount: -850, date: addDaysISO(localISODate(new Date()), 2), category: "Groceries" },
    { id: crypto.randomUUID(), type: "single", label: "Phone bill", description: "", amount: -399, date: addDaysISO(localISODate(new Date()), 8), category: "Bills" }
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
let authPendingEmail = null;
let latestSaveRequestVersion = null;
let planDraftEventId = null;
let templateDraftItems = [];

const elements = {
  appShell: document.querySelector("#app-shell"),
  authShell: document.querySelector("#auth-shell"),
  authForm: document.querySelector("#auth-form"),
  authCopy: document.querySelector("#auth-copy"),
  authEmail: document.querySelector("#auth-email"),
  authCodeField: document.querySelector("#auth-code-field"),
  authCode: document.querySelector("#auth-code"),
  authSubmit: document.querySelector("#auth-submit"),
  authChangeEmail: document.querySelector("#auth-change-email"),
  authSecondaryActions: document.querySelector("#auth-secondary-actions"),
  authMessage: document.querySelector("#auth-message"),
  heroSection: document.querySelector("#hero-section"),
  accountShell: document.querySelector("#account-shell"),
  buildVersion: document.querySelector("#build-version"),
  accountBuildVersion: document.querySelector("#account-build-version"),
  forecastOverview: document.querySelector("#forecast-overview"),
  balancePanel: document.querySelector("#balance-panel"),
  summaryPanel: document.querySelector("#summary-panel"),
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
  newBucketName: document.querySelector("#new-bucket-name"),
  addBucketButton: document.querySelector("#add-bucket-button"),
  bucketHistoryList: document.querySelector("#bucket-history-list"),
  categoryBreakdown: document.querySelector("#category-breakdown"),
  warningBanner: document.querySelector("#warning-banner"),
  selectedDate: document.querySelector("#selected-date"),
  selectedDateCaption: document.querySelector("#selected-date-caption"),
  timelinePanel: document.querySelector("#timeline-panel"),
  timelineList: document.querySelector("#timeline-list"),
  timelineBulkBar: document.querySelector("#timeline-bulk-bar"),
  timelineSelectToggle: document.querySelector("#timeline-select-toggle"),
  timelineSelectAll: document.querySelector("#timeline-select-all"),
  timelineClearSelection: document.querySelector("#timeline-clear-selection"),
  timelineSelectionCount: document.querySelector("#timeline-selection-count"),
  timelineDeleteSelected: document.querySelector("#timeline-delete-selected"),
  sidebarStack: document.querySelector("#sidebar-stack"),
  budgetsShell: document.querySelector("#budgets-shell"),
  plansShell: document.querySelector("#plans-shell"),
  templatesShell: document.querySelector("#templates-shell"),
  bucketHistoryShell: document.querySelector("#bucket-history-shell"),
  historyShell: document.querySelector("#history-shell"),
  scenarioList: document.querySelector("#scenario-list"),
  templateList: document.querySelector("#template-list"),
  newTemplateButton: document.querySelector("#new-template-button"),
  historyList: document.querySelector("#history-list"),
  timelineSearch: document.querySelector("#timeline-search"),
  timelineStatusFilter: document.querySelector("#timeline-status-filter"),
  timelineCategoryFilter: document.querySelector("#timeline-category-filter"),
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
  scenarioEventId: document.querySelector("#scenario-event-id"),
  addScenarioEventButton: document.querySelector("#add-scenario-event-button"),
  clearScenarioEventButton: document.querySelector("#clear-scenario-event-button"),
  scenarioEventsList: document.querySelector("#scenario-events-list"),
  deleteScenarioButton: document.querySelector("#delete-scenario-button"),
  scenarioModalTitle: document.querySelector("#scenario-modal-title"),
  templateModal: document.querySelector("#template-modal"),
  templateForm: document.querySelector("#template-form"),
  closeTemplateModal: document.querySelector("#close-template-modal"),
  templateModalTitle: document.querySelector("#template-modal-title"),
  templateId: document.querySelector("#template-id"),
  templateType: document.querySelector("#template-type"),
  templateLabel: document.querySelector("#template-label"),
  templateDescription: document.querySelector("#template-description"),
  templateDescriptionRecurring: document.querySelector("#template-description-recurring"),
  singleTemplateFields: document.querySelector("#single-template-fields"),
  recurringTemplateFields: document.querySelector("#recurring-template-fields"),
  templateAmount: document.querySelector("#template-amount"),
  templateCategory: document.querySelector("#template-category"),
  templateDate: document.querySelector("#template-date"),
  templateStartMonth: document.querySelector("#template-start-month"),
  templateEndMonth: document.querySelector("#template-end-month"),
  templateItemId: document.querySelector("#template-item-id"),
  templateItemLabel: document.querySelector("#template-item-label"),
  templateItemAmount: document.querySelector("#template-item-amount"),
  templateItemDate: document.querySelector("#template-item-date"),
  templateItemCategory: document.querySelector("#template-item-category"),
  addTemplateItemButton: document.querySelector("#add-template-item-button"),
  clearTemplateItemButton: document.querySelector("#clear-template-item-button"),
  templateItemsList: document.querySelector("#template-items-list"),
  deleteTemplateButton: document.querySelector("#delete-template-button"),
  saveTemplateButton: document.querySelector("#save-template-button"),
  saveScenarioButton: document.querySelector("#save-scenario-button"),
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
  updateBanner: document.querySelector("#update-banner"),
  updateRefreshButton: document.querySelector("#update-refresh-button"),
  plansPanel: document.querySelector("#plans-panel"),
  mobileNav: document.querySelector("#mobile-nav"),
  mobileNavButtons: Array.from(document.querySelectorAll("[data-mobile-tab-target]"))
};

attachEventListeners();
render();
void bootstrap();

function attachEventListeners() {
  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.authChangeEmail.addEventListener("click", resetAuthStep);
  elements.undoButton.addEventListener("click", handleUndo);
  if (elements.openEntryModal) {
    elements.openEntryModal.addEventListener("click", () => openEntryModal());
  }
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
  if (elements.timelineSearch) {
    elements.timelineSearch.addEventListener("input", () => {
      state.ui.timelineSearch = elements.timelineSearch.value;
      pruneTimelineSelection();
      persist();
      render();
    });
  }
  if (elements.timelineStatusFilter) {
    elements.timelineStatusFilter.addEventListener("change", () => {
      state.ui.timelineStatusFilter = elements.timelineStatusFilter.value;
      pruneTimelineSelection();
      persist();
      render();
    });
  }
  if (elements.timelineCategoryFilter) {
    elements.timelineCategoryFilter.addEventListener("change", () => {
      state.ui.timelineCategoryFilter = elements.timelineCategoryFilter.value;
      pruneTimelineSelection();
      persist();
      render();
    });
  }
  if (elements.timelineSelectToggle) {
    elements.timelineSelectToggle.addEventListener("click", handleTimelineSelectionToggle);
  }
  if (elements.timelineSelectAll) {
    elements.timelineSelectAll.addEventListener("click", handleTimelineSelectAllVisible);
  }
  if (elements.timelineClearSelection) {
    elements.timelineClearSelection.addEventListener("click", clearTimelineSelection);
  }
  if (elements.timelineDeleteSelected) {
    elements.timelineDeleteSelected.addEventListener("click", handleTimelineDeleteSelected);
  }
  elements.addBucketButton.addEventListener("click", handleAddBucket);
  elements.newBucketName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddBucket();
    }
  });

  elements.newScenarioButton.addEventListener("click", () => openPlanModal());
  if (elements.newTemplateButton) {
    elements.newTemplateButton.addEventListener("click", () => openTemplateModal());
  }
  elements.closeScenarioModal.addEventListener("click", () => elements.scenarioModal.close());
  elements.scenarioForm.addEventListener("submit", handleScenarioSubmit);
  if (elements.saveScenarioButton) {
    elements.saveScenarioButton.addEventListener("click", handleScenarioSubmit);
  }
  elements.addScenarioEventButton.addEventListener("click", handleAddPlanEvent);
  if (elements.clearScenarioEventButton) {
    elements.clearScenarioEventButton.addEventListener("click", clearPlanEventDraft);
  }
  elements.deleteScenarioButton.addEventListener("click", handleDeleteScenario);
  if (elements.closeTemplateModal && elements.templateModal) {
    elements.closeTemplateModal.addEventListener("click", () => elements.templateModal.close());
  }
  if (elements.templateForm) {
    elements.templateForm.addEventListener("submit", handleTemplateSubmit);
  }
  if (elements.saveTemplateButton) {
    elements.saveTemplateButton.addEventListener("click", handleTemplateSubmit);
  }
  if (elements.templateType) {
    elements.templateType.addEventListener("change", updateTemplateTypeUI);
  }
  if (elements.templateStartMonth) {
    elements.templateStartMonth.addEventListener("change", () => {
      if (elements.templateEndMonth.value < elements.templateStartMonth.value) {
        elements.templateEndMonth.value = elements.templateStartMonth.value;
      }
      syncTemplateDefaultDates();
    });
  }
  if (elements.templateEndMonth) {
    elements.templateEndMonth.addEventListener("change", syncTemplateDefaultDates);
  }
  if (elements.addTemplateItemButton) {
    elements.addTemplateItemButton.addEventListener("click", handleAddTemplateItem);
  }
  if (elements.clearTemplateItemButton) {
    elements.clearTemplateItemButton.addEventListener("click", clearTemplateItemDraft);
  }
  if (elements.deleteTemplateButton) {
    elements.deleteTemplateButton.addEventListener("click", handleDeleteTemplate);
  }

  elements.editBalanceButton.addEventListener("click", () => openSettingsModal("balance"));
  elements.editThresholdButton.addEventListener("click", () => openSettingsModal("threshold"));
  elements.clarityToggleButton.addEventListener("click", handleClarityToggle);
  elements.closeSettingsModal.addEventListener("click", () => elements.settingsModal.close());
  elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
  elements.signOutButton.addEventListener("click", handleSignOut);
  elements.updateRefreshButton.addEventListener("click", handleRefreshToUpdate);
  elements.mobileNavButtons.forEach((button) => {
    button.addEventListener("click", () => setMobileTab(button.dataset.mobileTabTarget));
  });
  window.addEventListener("runway-update-ready", showUpdateBanner);
  window.addEventListener("focus", () => {
    if (authUser) void refreshRemoteState();
  });
  window.addEventListener("resize", handleViewportChange);

  [elements.entryModal, elements.scenarioModal, elements.settingsModal, elements.templateModal].filter(Boolean).forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.close();
    });
  });
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

  if (!authPendingEmail) {
    elements.authSubmit.disabled = true;
    elements.authMessage.textContent = "Sending verification code...";
    const { error } = await supabaseClient.auth.signInWithOtp({
      email
    });

    elements.authSubmit.disabled = false;
    if (error) {
      elements.authMessage.textContent = `Unable to send code: ${error.message}`;
      return;
    }

    authPendingEmail = email;
    updateAuthStepUI();
    elements.authMessage.textContent = `Code sent to ${email}. Enter it below to sign in.`;
    return;
  }

  const token = elements.authCode.value.replace(/\s+/g, "").trim().toUpperCase();
  if (!token) {
    elements.authMessage.textContent = "Enter the code from your email.";
    return;
  }

  elements.authSubmit.disabled = true;
  elements.authMessage.textContent = "Verifying code...";
  const { error } = await supabaseClient.auth.verifyOtp({
    email: authPendingEmail,
    token,
    type: "email"
  });
  elements.authSubmit.disabled = false;

  if (error) {
    elements.authMessage.textContent = `Unable to verify code: ${error.message}`;
    return;
  }

  elements.authMessage.textContent = "Signed in.";
  authPendingEmail = null;
  elements.authCode.value = "";
  updateAuthStepUI();
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
  if (elements.openEntryModal) {
    elements.openEntryModal.disabled = !signedIn;
  }
  elements.mobileFab.disabled = !signedIn;
  elements.quickAddButton.disabled = !signedIn;
  elements.syncBadge.textContent = signedIn ? "Syncing with Supabase" : "Sign in required";
  if (!signedIn) {
    if (!authPendingEmail) {
      elements.authCode.value = "";
      elements.authMessage.textContent = "";
    }
    updateAuthStepUI();
  }
}

function updateAuthStepUI() {
  const isCodeStep = Boolean(authPendingEmail);
  elements.authCopy.textContent = isCodeStep
    ? "Enter the one-time code from your email to finish signing in inside this app."
    : "Use a one-time code so the same data stays synced across desktop and mobile.";
  elements.authEmail.disabled = isCodeStep;
  elements.authCodeField.hidden = !isCodeStep;
  elements.authSecondaryActions.hidden = !isCodeStep;
  elements.authSubmit.textContent = isCodeStep ? "Verify code" : "Send code";
  elements.authSubmit.disabled = false;
  if (isCodeStep) {
    elements.authCode.value = elements.authCode.value.replace(/\s+/g, "").toUpperCase();
    elements.authCode.focus();
  }
}

function resetAuthStep() {
  authPendingEmail = null;
  elements.authCode.value = "";
  elements.authMessage.textContent = "";
  updateAuthStepUI();
  elements.authEmail.focus();
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
  if (elements.buildVersion) {
    elements.buildVersion.textContent = BUILD_VERSION;
  }
  if (elements.accountBuildVersion) {
    elements.accountBuildVersion.textContent = BUILD_VERSION;
  }
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
  if (elements.timelineCategoryFilter && elements.timelineSearch && elements.timelineStatusFilter) {
    syncTimelineCategoryOptions();
  }
  applyMobileLayout();
}

function showUpdateBanner() {
  elements.updateBanner.classList.add("is-visible");
  elements.updateBanner.setAttribute("aria-hidden", "false");
}

async function handleRefreshToUpdate() {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  window.location.reload();
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
  elements.clarityToggleButton.textContent = isExpanded ? "−" : "+";
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
    { element: elements.heroSection, tabs: ["forecast"] },
    { element: elements.balancePanel, tabs: ["forecast", "plans"] },
    { element: elements.summaryPanel, tabs: ["forecast"] },
    { element: elements.timelinePanel, tabs: ["forecast"] },
    { element: elements.sidebarStack, tabs: ["plans", "more"] },
    { element: elements.budgetsShell, tabs: ["more"] },
    { element: elements.plansShell, tabs: ["plans"] },
    { element: elements.templatesShell, tabs: ["more"] },
    { element: elements.bucketHistoryShell, tabs: ["more"] },
    { element: elements.historyShell, tabs: ["more"] },
    { element: elements.accountShell, tabs: ["more"] }
  ];

  elements.mobileNav.hidden = !isMobile;
  elements.appShell.dataset.mobileTab = isMobile ? activeTab : "";
  elements.mobileFab.hidden = !isMobile || activeTab !== "forecast";
  if (elements.openEntryModal) {
    elements.openEntryModal.hidden = isMobile;
  }

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
    const trigger = lowestPoint.event
      ? `Triggered by ${lowestPoint.event.label} on ${formatDate(lowestPoint.event.date)}.`
      : "";
    const gap = state.account.warningThreshold - lowestPoint.balance;
    elements.warningBanner.hidden = false;
    elements.warningBanner.textContent = `Projected balance drops to ${formatCurrency(lowestPoint.balance)}. ${trigger} ${formatCurrency(gap)} below your warning floor.`;
  } else {
    elements.warningBanner.hidden = true;
    elements.warningBanner.textContent = "";
  }
}

function renderTimeline(timeline) {
  const filteredTimeline = elements.timelineSearch && elements.timelineStatusFilter && elements.timelineCategoryFilter
    ? filterTimeline(timeline)
    : timeline;
  renderTimelineBulkBar(filteredTimeline);
  if (!filteredTimeline.length) {
    elements.timelineList.innerHTML = `<div class="empty-state">No included future events yet. Add salary, rent, groceries, or include a plan to start the forecast.</div>`;
    return;
  }

  const groupedMarkup = groupTimelineByMonth(filteredTimeline).map(({ monthKey, items }) => `
    <section class="timeline-month-group">
      <div class="timeline-month-separator">
        <span>${formatMonthKey(monthKey)}</span>
      </div>
      <div class="timeline-month-items">
        ${items.map(renderTimelineItem).join("")}
      </div>
    </section>
  `).join("");

  elements.timelineList.innerHTML = groupedMarkup;

  elements.timelineList.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", handleTimelineAction);
  });
  elements.timelineList.querySelectorAll("input[data-action='toggle-select-event']").forEach((input) => {
    input.addEventListener("change", handleTimelineSelectionChange);
  });
}

function renderTimelineItem(item) {
  const event = item.event;
  const isBucketEvent = event.id.startsWith("bucket-");
  const displayAmount = effectiveAmount(event);
  const amountClass = displayAmount >= 0 ? "income" : "expense";
  const scenario = event.scenarioId ? state.scenarios.find((entry) => entry.id === event.scenarioId) : null;
  const isSelectionMode = Boolean(state.ui.timelineSelectionMode);
  const isSelected = (state.ui.selectedTimelineEventIds || []).includes(event.id);
  const chips = [
    event.isSettled ? `<span class="chip">Settled</span>` : "",
    scenario ? `<span class="chip active">${escapeHTML(scenario.name)}</span>` : "",
    item.runningBalance < state.account.warningThreshold ? `<span class="chip warning">Below floor</span>` : "",
    event.category ? `<span class="chip">${escapeHTML(event.category)}</span>` : ""
  ].filter(Boolean).join("");

  return `
    <section class="timeline-item ${isSelectionMode ? "is-selection-mode" : ""} ${isSelected ? "is-selected" : ""}">
      <div class="timeline-top">
        ${isSelectionMode && !isBucketEvent ? `
          <label class="timeline-select-control">
            <input type="checkbox" data-action="toggle-select-event" data-event-id="${event.id}" ${isSelected ? "checked" : ""}>
            <span>Select</span>
          </label>
        ` : ""}
        <div class="timeline-main">
          <p class="timeline-title">${escapeHTML(event.label)}</p>
          <p class="timeline-meta">${formatDate(event.date)}${event.notes ? ` • ${escapeHTML(event.notes)}` : ""}</p>
        </div>
      </div>
      <div class="timeline-bottom">
        <div class="timeline-value-row">
          <p class="timeline-amount ${amountClass}">${formatCurrency(displayAmount)}</p>
          ${isBucketEvent || isSelectionMode ? "" : `
          <div class="button-row timeline-actions">
            <button class="ghost-button small" data-action="toggle-settled" data-event-id="${event.id}">
              ${event.isSettled ? "Mark upcoming" : "Mark settled"}
            </button>
            <button class="ghost-button small" data-action="edit-event" data-event-id="${event.id}">Edit</button>
          </div>
          `}
        </div>
        <div class="chip-row">
          ${chips}
          ${event.actualAmount !== null && event.actualAmount !== undefined ? `<span class="chip">Actual: ${formatCurrency(event.actualAmount)}</span>` : ""}
          <span class="chip">After event: ${formatCurrency(item.runningBalance)}</span>
        </div>
      </div>
    </section>
  `;
}

function renderTimelineBulkBar(filteredTimeline) {
  if (!elements.timelineBulkBar) return;
  const visibleSelectableIds = filteredTimeline
    .map((entry) => entry.event)
    .filter((event) => !event.id.startsWith("bucket-"))
    .map((event) => event.id);
  const selectedCount = (state.ui.selectedTimelineEventIds || []).length;
  elements.timelineBulkBar.hidden = !visibleSelectableIds.length;
  elements.timelineSelectToggle.textContent = state.ui.timelineSelectionMode ? "Done" : "Select";
  elements.timelineSelectToggle.setAttribute("aria-pressed", state.ui.timelineSelectionMode ? "true" : "false");
  elements.timelineSelectAll.hidden = !state.ui.timelineSelectionMode;
  elements.timelineClearSelection.hidden = !state.ui.timelineSelectionMode || !selectedCount;
  elements.timelineSelectionCount.hidden = !state.ui.timelineSelectionMode;
  elements.timelineDeleteSelected.hidden = !state.ui.timelineSelectionMode || !selectedCount;
  elements.timelineSelectionCount.textContent = `${selectedCount} selected`;
}

function filterTimeline(timeline) {
  const query = (state.ui.timelineSearch || "").trim().toLowerCase();
  const statusFilter = state.ui.timelineStatusFilter || "all";
  const categoryFilter = state.ui.timelineCategoryFilter || "all";

  return timeline.filter((entry) => {
    const event = entry.event;
    if (statusFilter === "plain" && event.scenarioId) return false;
    if (statusFilter === "scenario" && !event.scenarioId) return false;
    if (statusFilter === "bucket" && !event.id.startsWith("bucket-")) return false;
    if (statusFilter !== "bucket" && statusFilter !== "all" && statusFilter !== "plain" && statusFilter !== "scenario") return true;
    if (categoryFilter !== "all" && event.category !== categoryFilter) return false;
    if (!query) return true;

    const haystack = [event.label, event.notes, event.category, scenarioNameForEvent(event)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function handleTimelineSelectionToggle() {
  state.ui.timelineSelectionMode = !state.ui.timelineSelectionMode;
  if (!state.ui.timelineSelectionMode) {
    state.ui.selectedTimelineEventIds = [];
  } else {
    pruneTimelineSelection();
  }
  persist();
  render();
}

function handleTimelineSelectionChange(event) {
  const eventId = event.currentTarget.dataset.eventId;
  const next = new Set(state.ui.selectedTimelineEventIds || []);
  if (event.currentTarget.checked) {
    next.add(eventId);
  } else {
    next.delete(eventId);
  }
  state.ui.selectedTimelineEventIds = [...next];
  persist();
  render();
}

function handleTimelineSelectAllVisible() {
  const visibleIds = getVisibleSelectableTimelineIds();
  state.ui.selectedTimelineEventIds = visibleIds;
  persist();
  render();
}

function clearTimelineSelection() {
  state.ui.selectedTimelineEventIds = [];
  persist();
  render();
}

function handleTimelineDeleteSelected() {
  const selectedIds = state.ui.selectedTimelineEventIds || [];
  if (!selectedIds.length) return;
  const count = selectedIds.length;
  if (!window.confirm(`Delete ${count} selected timeline event${count === 1 ? "" : "s"}?`)) return;
  registerUndo("deleted", `Deleted ${count} selected timeline events`);
  state.events = state.events.filter((entry) => !selectedIds.includes(entry.id));
  state.ui.selectedTimelineEventIds = [];
  state.ui.timelineSelectionMode = false;
  logHistory("deleted", `Deleted ${count} selected timeline events.`);
  persist();
  render();
}

function pruneTimelineSelection() {
  const visibleIds = new Set(getVisibleSelectableTimelineIds());
  state.ui.selectedTimelineEventIds = (state.ui.selectedTimelineEventIds || []).filter((id) => visibleIds.has(id));
}

function getVisibleSelectableTimelineIds() {
  const forecast = computeForecast(state);
  const filteredTimeline = elements.timelineSearch && elements.timelineStatusFilter && elements.timelineCategoryFilter
    ? filterTimeline(forecast.timeline)
    : forecast.timeline;
  return filteredTimeline
    .map((entry) => entry.event)
    .filter((event) => !event.id.startsWith("bucket-"))
    .map((event) => event.id);
}

function groupTimelineByMonth(timeline) {
  const groups = [];
  timeline.forEach((entry) => {
    const monthKey = entry.event.date.slice(0, 7);
    const current = groups[groups.length - 1];
    if (!current || current.monthKey !== monthKey) {
      groups.push({ monthKey, items: [entry] });
      return;
    }
    current.items.push(entry);
  });
  return groups;
}

function scenarioNameForEvent(event) {
  if (!event.scenarioId) return "";
  return state.scenarios.find((entry) => entry.id === event.scenarioId)?.name || "";
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
        <div class="chip-row scenario-chip-row">
          <span class="chip">${events.length} event${events.length === 1 ? "" : "s"}</span>
          <span class="chip">${formatCurrency(total)}</span>
          <button class="ghost-button small scenario-open-btn" data-action="open-scenario" data-scenario-id="${scenario.id}">Open plan</button>
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
  if (!elements.templateList) return;
  if (!state.templates.length) {
    elements.templateList.innerHTML = `<div class="empty-state">Create a template for one-off events or build a recurring monthly bundle to stamp across a range of months.</div>`;
    return;
  }

  elements.templateList.innerHTML = state.templates.map((template) => `
    <section class="template-card">
      <div class="template-top">
        <div>
          <p class="timeline-title">${escapeHTML(template.label)}</p>
          <p class="template-copy">${describeTemplate(template)}</p>
        </div>
        <p class="timeline-amount ${template.type === "recurring" ? "expense" : template.amount >= 0 ? "income" : "expense"}">${formatTemplateAmount(template)}</p>
      </div>
      <div class="button-row">
        <button class="ghost-button small" data-action="use-template" data-template-id="${template.id}">${template.type === "recurring" ? "Apply bundle" : "Use template"}</button>
        <button class="ghost-button small" data-action="edit-template" data-template-id="${template.id}">Edit</button>
      </div>
    </section>
  `).join("");

  elements.templateList.querySelectorAll("button[data-action='use-template']").forEach((button) => {
    button.addEventListener("click", () => {
      const template = state.templates.find((entry) => entry.id === button.dataset.templateId);
      if (!template) return;
      if (template.type === "recurring") {
        const events = materializeRecurringTemplate(template);
        state.events.push(...events);
        logHistory("added", `Applied ${template.label} template.`);
      } else {
        state.events.push({
          id: crypto.randomUUID(),
          label: template.label,
          amount: template.amount,
          date: template.date || localISODate(new Date()),
          scenarioId: null,
          isSettled: false,
          category: template.category,
          actualAmount: null,
          notes: template.description || "Created from template."
        });
        logHistory("added", `Added ${template.label} from template.`);
      }
      persist();
      render();
    });
  });

  elements.templateList.querySelectorAll("button[data-action='edit-template']").forEach((button) => {
    button.addEventListener("click", () => {
      openTemplateModal(button.dataset.templateId);
    });
  });
}

function renderBuckets() {
  const monthKey = currentMonthKey();
  const monthBuckets = state.buckets[monthKey];
  const bucketNames = getBucketNames(state);

  elements.bucketList.innerHTML = bucketNames.map((category) => {
    const bucket = monthBuckets[category];
    const spent = bucket.entries.reduce((sum, entry) => sum + entry.amount, 0);
    const remaining = bucket.budgeted - spent;
    const entryCountLabel = `${bucket.entries.length} ${bucket.entries.length === 1 ? "entry" : "entries"}`;
    const entryRows = [...bucket.entries]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 4)
      .map((entry) => `
        <div class="bucket-entry-row">
          <div>
            <strong>${formatCurrency(entry.amount)}</strong>
            <p class="bucket-entry-copy">${formatDate(entry.date)}${entry.note ? ` • ${escapeHTML(entry.note)}` : ""}</p>
          </div>
          <button class="ghost-button small text-button" data-action="delete-bucket-entry" data-category="${escapeAttribute(category)}" data-entry-id="${entry.id}">Delete</button>
        </div>
      `).join("");

    return `
      <section class="bucket-card">
        <div class="bucket-header-row">
          <div>
            <p class="timeline-title">${escapeHTML(category)}</p>
            <p class="template-copy">Budget for ${formatMonthKey(monthKey)}</p>
          </div>
          <div class="bucket-header-actions">
            <label class="bucket-toggle">
              <input type="checkbox" data-action="toggle-bucket-active" data-category="${escapeAttribute(category)}" ${bucket.isActive ? "checked" : ""}>
              <span>${bucket.isActive ? "On" : "Off"}</span>
            </label>
            <button class="ghost-button small" data-action="edit-bucket-budget" data-category="${escapeAttribute(category)}">Set budget</button>
          </div>
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
          <span class="chip">${entryCountLabel}</span>
          <span class="chip ${bucket.isActive ? "positive" : ""}">${bucket.isActive ? "Active this month" : "Hidden this month"}</span>
        </div>
        <p class="bucket-helper">${bucket.isActive ? `Forecast impact this month: ${formatCurrency(Math.max(remaining, 0))} remaining.` : "This bucket is hidden from this month’s forecast timeline."}</p>
        <div class="bucket-action-grid">
          <input class="bucket-inline-input" type="number" step="10" min="0" placeholder="Log spend" data-action="bucket-spend-input" data-category="${escapeAttribute(category)}">
          <button class="ghost-button small" data-action="log-bucket-spend" data-category="${escapeAttribute(category)}">Add</button>
        </div>
        ${bucket.entries.length ? `
          <details class="bucket-log-details">
            <summary class="bucket-log-summary">
              <span>Log history</span>
              <span>${entryCountLabel}</span>
            </summary>
            <div class="bucket-entry-list">
              ${entryRows}
            </div>
          </details>
        ` : `
          <div class="bucket-entry-list is-empty">
            <p class="bucket-helper">No spend logged for this month yet.</p>
          </div>
        `}
        <div class="button-row bucket-footer-actions">
          <button class="ghost-button small text-button" data-action="clear-bucket-month" data-category="${escapeAttribute(category)}">Clear month</button>
        </div>
      </section>
    `;
  }).join("");

  elements.bucketList.querySelectorAll("[data-action='edit-bucket-budget']").forEach((button) => {
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

  elements.bucketList.querySelectorAll("[data-action='toggle-bucket-active']").forEach((input) => {
    input.addEventListener("change", () => {
      const category = input.dataset.category;
      state.buckets[monthKey][category].isActive = input.checked;
      logHistory("edited", `${input.checked ? "Enabled" : "Hidden"} ${category} for ${formatMonthKey(monthKey)}.`);
      persist();
      render();
    });
  });

  elements.bucketList.querySelectorAll("[data-action='delete-bucket-entry']").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      const bucket = state.buckets[monthKey][category];
      bucket.entries = bucket.entries.filter((entry) => entry.id !== button.dataset.entryId);
      logHistory("deleted", `Deleted spend log from ${category}.`);
      persist();
      render();
    });
  });

  elements.bucketList.querySelectorAll("[data-action='clear-bucket-month']").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      const bucket = state.buckets[monthKey][category];
      if (!bucket.entries.length) return;
      if (!window.confirm(`Clear all ${category} spend logs for ${formatMonthKey(monthKey)}?`)) return;
      bucket.entries = [];
      logHistory("deleted", `Cleared ${category} spend for ${formatMonthKey(monthKey)}.`);
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
      return getBucketNames(state).flatMap((category) => {
        if (!monthBuckets[category]) return [];
        const bucket = monthBuckets[category];
        const spent = bucket.entries.reduce((sum, entry) => sum + entry.amount, 0);
        return [{
          monthKey,
          category,
          budgeted: bucket.budgeted,
          spent,
          variance: bucket.budgeted - spent
        }];
      });
    });

  if (!historyRows.length) {
    elements.bucketHistoryList.innerHTML = `<div class="empty-state">Once you start logging flexible-budget spend, recent monthly variance will appear here.</div>`;
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

function handleAddBucket() {
  const rawName = elements.newBucketName.value.trim().replace(/\s+/g, " ");
  if (!rawName) return;
  const exists = state.bucketTemplates.some((bucket) => bucket.name.toLowerCase() === rawName.toLowerCase());
  if (exists) {
    elements.newBucketName.value = "";
    return;
  }

  state.bucketTemplates.push({
    name: rawName,
    defaultBudget: 1000,
    isEnabledByDefault: true
  });
  ensureCurrentMonthBuckets(state);
  logHistory("added", `Added ${rawName} flexible budget.`);
  elements.newBucketName.value = "";
  persist();
  render();
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
  requestAnimationFrame(() => {
    elements.entryLabel.focus({ preventScroll: true });
    elements.entryLabel.blur();
  });
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
  clearPlanEventDraft();
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
  requestAnimationFrame(() => {
    elements.scenarioName.focus({ preventScroll: true });
    elements.scenarioName.blur();
  });
}

function handleAddPlanEvent() {
  const payload = readPlanEventDraft();
  if (!payload) return;

  const existingIndex = planDraftEvents.findIndex((entry) => entry.id === payload.id);
  if (existingIndex >= 0) {
    planDraftEvents[existingIndex] = payload;
  } else {
    planDraftEvents.push(payload);
  }

  clearPlanEventDraft({ preserveDate: true });
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
            <p class="history-copy">${formatDate(event.date)} • ${escapeHTML(event.category)}${event.notes ? ` • ${escapeHTML(event.notes)}` : ""}</p>
          </div>
          <strong>${formatCurrency(event.amount)}</strong>
        </div>
        <div class="button-row">
          <button class="ghost-button small" data-action="edit-plan-event" data-event-id="${event.id}">Edit</button>
          <button class="ghost-button small" data-action="remove-plan-event" data-event-id="${event.id}">Remove</button>
        </div>
      </div>
    `).join("");

  elements.scenarioEventsList.querySelectorAll("button[data-action='edit-plan-event']").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = planDraftEvents.find((event) => event.id === button.dataset.eventId);
      if (!entry) return;
      fillPlanEventDraft(entry);
    });
  });
  elements.scenarioEventsList.querySelectorAll("button[data-action='remove-plan-event']").forEach((button) => {
    button.addEventListener("click", () => {
      planDraftEvents = planDraftEvents.filter((event) => event.id !== button.dataset.eventId);
      if (planDraftEventId === button.dataset.eventId) clearPlanEventDraft({ preserveDate: true });
      renderPlanEvents();
    });
  });
}

function handleScenarioSubmit(event) {
  event.preventDefault();
  const pendingDraft = readPlanEventDraft();
  if (pendingDraft) {
    const existingIndex = planDraftEvents.findIndex((entry) => entry.id === pendingDraft.id);
    if (existingIndex >= 0) {
      planDraftEvents[existingIndex] = pendingDraft;
    } else {
      planDraftEvents.push(pendingDraft);
    }
  }

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
  clearPlanEventDraft();
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

function readPlanEventDraft() {
  if (!elements.scenarioEventLabel || !elements.scenarioEventAmount || !elements.scenarioEventDate) return null;
  const label = elements.scenarioEventLabel.value.trim();
  const amount = Number(elements.scenarioEventAmount.value);
  const date = elements.scenarioEventDate.value;
  const category = elements.scenarioEventCategory.value || "Misc";
  const notes = elements.scenarioEventNotes.value.trim();
  if (!label && !elements.scenarioEventAmount.value.trim() && !notes) return null;
  if (!label || Number.isNaN(amount) || !date) return null;

  return {
    id: elements.scenarioEventId.value || crypto.randomUUID(),
    label,
    amount,
    date,
    scenarioId: activePlanId,
    category,
    isSettled: false,
    actualAmount: null,
    notes
  };
}

function fillPlanEventDraft(entry) {
  if (!elements.scenarioEventId) return;
  planDraftEventId = entry.id;
  elements.scenarioEventId.value = entry.id;
  elements.scenarioEventLabel.value = entry.label;
  elements.scenarioEventAmount.value = entry.amount;
  elements.scenarioEventDate.value = entry.date;
  elements.scenarioEventNotes.value = entry.notes || "";
  syncCategoryOptionsForPlan(entry.category || "Misc");
  elements.addScenarioEventButton.textContent = "Update item";
}

function clearPlanEventDraft(options = {}) {
  if (!elements.scenarioEventId) return;
  const { preserveDate = false } = options;
  planDraftEventId = null;
  elements.scenarioEventId.value = "";
  elements.scenarioEventLabel.value = "";
  elements.scenarioEventAmount.value = "";
  elements.scenarioEventNotes.value = "";
  if (!preserveDate || !elements.scenarioEventDate.value) {
    elements.scenarioEventDate.value = localISODate(new Date());
  }
  syncCategoryOptionsForPlan();
  elements.addScenarioEventButton.textContent = "Add item to plan";
}

function openTemplateModal(templateId = null) {
  if (!elements.templateModal || !elements.templateForm) return;
  elements.templateForm.reset();
  templateDraftItems = [];
  syncTemplateCategoryOptions();
  clearTemplateItemDraft();

  if (!templateId) {
    elements.templateId.value = "";
    elements.templateModalTitle.textContent = "Create template";
    elements.deleteTemplateButton.hidden = true;
    elements.templateType.value = "single";
    elements.templateDate.value = addDaysISO(localISODate(new Date()), 14);
    elements.templateStartMonth.value = currentMonthKey();
    elements.templateEndMonth.value = addMonthsISO(`${currentMonthKey()}-01`, 3).slice(0, 7);
  } else {
    const template = state.templates.find((entry) => entry.id === templateId);
    if (!template) return;
    elements.templateId.value = template.id;
    elements.templateModalTitle.textContent = "Edit template";
    elements.deleteTemplateButton.hidden = false;
    elements.templateType.value = template.type || "single";
    elements.templateLabel.value = template.label;
    elements.templateDescription.value = template.description || "";
    if (elements.templateDescriptionRecurring) {
      elements.templateDescriptionRecurring.value = template.description || "";
    }
    elements.templateAmount.value = template.amount ?? "";
    elements.templateDate.value = template.date || addDaysISO(localISODate(new Date()), 14);
    elements.templateCategory.value = template.category || "Misc";
    elements.templateStartMonth.value = template.startMonth || currentMonthKey();
    elements.templateEndMonth.value = template.endMonth || currentMonthKey();
    templateDraftItems = (template.items || []).map((item) => ({ ...item }));
  }

  syncTemplateDefaultDates();
  updateTemplateTypeUI();
  renderTemplateItems();
  elements.templateModal.showModal();
}

function updateTemplateTypeUI() {
  if (!elements.templateType || !elements.singleTemplateFields || !elements.recurringTemplateFields) return;
  const isRecurring = elements.templateType.value === "recurring";
  elements.singleTemplateFields.hidden = isRecurring;
  elements.recurringTemplateFields.hidden = !isRecurring;
  syncTemplateDefaultDates();
}

function handleTemplateSubmit(event) {
  if (!elements.templateType) return;
  event?.preventDefault?.();
  const payload = buildTemplatePayload();
  if (!payload) return;

  const existingIndex = state.templates.findIndex((entry) => entry.id === payload.id);
  if (existingIndex >= 0) {
    state.templates[existingIndex] = payload;
    logHistory("edited", `Updated ${payload.label} template.`);
  } else {
    state.templates.push(payload);
    logHistory("added", `Added ${payload.label} template.`);
  }

  persist();
  elements.templateModal.close();
  render();
}

function buildTemplatePayload() {
  const isRecurring = elements.templateType.value === "recurring";
  const label = elements.templateLabel.value.trim();
  if (!label) return null;

  const payload = {
    id: elements.templateId.value || crypto.randomUUID(),
    type: isRecurring ? "recurring" : "single",
    label,
    description: isRecurring
      ? (elements.templateDescriptionRecurring?.value || "").trim()
      : elements.templateDescription.value.trim()
  };

  if (isRecurring) {
    const pendingDraft = readTemplateItemDraft();
    const items = mergeTemplateDraftItems(pendingDraft);
    if (!items.length) return null;
    const startMonth = normalizeTemplateMonthValue(
      elements.templateStartMonth.value,
      items[0]?.firstDate || `${currentMonthKey()}-01`
    );
    const endMonth = normalizeTemplateMonthValue(
      elements.templateEndMonth.value,
      addMonthsISO(`${startMonth}-01`, 3)
    );
    if (startMonth > endMonth) return null;
    templateDraftItems = items;
    payload.startMonth = startMonth;
    payload.endMonth = endMonth;
    payload.items = items.map((item) => ({ ...item }));
    return payload;
  }

  const amount = Number(elements.templateAmount.value);
  const date = elements.templateDate.value;
  if (Number.isNaN(amount) || !date) return null;
  payload.amount = amount;
  payload.date = date;
  payload.category = elements.templateCategory.value || "Misc";
  return payload;
}

function mergeTemplateDraftItems(pendingDraft) {
  if (!pendingDraft) return [...templateDraftItems];
  const items = [...templateDraftItems];
  const existingIndex = items.findIndex((entry) => entry.id === pendingDraft.id);
  if (existingIndex >= 0) {
    items[existingIndex] = pendingDraft;
  } else {
    items.push(pendingDraft);
  }
  return items;
}

function normalizeTemplateMonthValue(rawMonthValue, fallbackISODate) {
  if (rawMonthValue && /^\d{4}-\d{2}$/.test(rawMonthValue)) return rawMonthValue;
  return fallbackISODate.slice(0, 7);
}

function handleDeleteTemplate() {
  if (!elements.templateId) return;
  const templateId = elements.templateId.value;
  if (!templateId) return;
  const target = state.templates.find((entry) => entry.id === templateId);
  state.templates = state.templates.filter((entry) => entry.id !== templateId);
  if (target) logHistory("deleted", `Deleted ${target.label} template.`);
  persist();
  elements.templateModal.close();
  render();
}

function handleAddTemplateItem() {
  if (!elements.templateItemsList) return;
  syncTemplateDefaultDates();
  const payload = readTemplateItemDraft();
  if (!payload) return;
  const existingIndex = templateDraftItems.findIndex((entry) => entry.id === payload.id);
  if (existingIndex >= 0) {
    templateDraftItems[existingIndex] = payload;
  } else {
    templateDraftItems.push(payload);
  }
  clearTemplateItemDraft();
  renderTemplateItems();
}

function readTemplateItemDraft() {
  if (!elements.templateItemLabel || !elements.templateItemAmount || !elements.templateItemDate) return null;
  const label = elements.templateItemLabel.value.trim();
  const amount = Number(elements.templateItemAmount.value);
  const firstDate = elements.templateItemDate.value;
  if (!label && !elements.templateItemAmount.value.trim()) return null;
  if (!label || Number.isNaN(amount) || !firstDate) return null;
  return {
    id: elements.templateItemId.value || crypto.randomUUID(),
    label,
    amount,
    firstDate,
    category: elements.templateItemCategory.value || "Misc"
  };
}

function renderTemplateItems() {
  if (!elements.templateItemsList) return;
  if (!templateDraftItems.length) {
    elements.templateItemsList.innerHTML = `<div class="empty-state">Add each monthly item here. They will repeat once per month across the selected month range.</div>`;
    return;
  }

  elements.templateItemsList.innerHTML = templateDraftItems
    .sort((left, right) => left.firstDate.localeCompare(right.firstDate))
    .map((item) => `
      <div class="history-item">
        <div class="template-top">
          <div>
            <strong>${escapeHTML(item.label)}</strong>
            <p class="history-copy">${formatDate(item.firstDate)} • ${escapeHTML(item.category)}</p>
          </div>
          <strong>${formatCurrency(item.amount)}</strong>
        </div>
        <div class="button-row">
          <button class="ghost-button small" data-action="edit-template-item" data-item-id="${item.id}">Edit</button>
          <button class="ghost-button small" data-action="remove-template-item" data-item-id="${item.id}">Remove</button>
        </div>
      </div>
    `).join("");

  elements.templateItemsList.querySelectorAll("button[data-action='edit-template-item']").forEach((button) => {
    button.addEventListener("click", () => {
      const item = templateDraftItems.find((entry) => entry.id === button.dataset.itemId);
      if (!item) return;
      fillTemplateItemDraft(item);
    });
  });
  elements.templateItemsList.querySelectorAll("button[data-action='remove-template-item']").forEach((button) => {
    button.addEventListener("click", () => {
      templateDraftItems = templateDraftItems.filter((entry) => entry.id !== button.dataset.itemId);
      if (elements.templateItemId.value === button.dataset.itemId) clearTemplateItemDraft();
      renderTemplateItems();
    });
  });
}

function fillTemplateItemDraft(item) {
  if (!elements.templateItemId) return;
  elements.templateItemId.value = item.id;
  elements.templateItemLabel.value = item.label;
  elements.templateItemAmount.value = item.amount;
  elements.templateItemDate.value = item.firstDate;
  elements.templateItemCategory.value = item.category || "Misc";
  elements.addTemplateItemButton.textContent = "Update recurring item";
}

function clearTemplateItemDraft() {
  if (!elements.templateItemId) return;
  elements.templateItemId.value = "";
  elements.templateItemLabel.value = "";
  elements.templateItemAmount.value = "";
  elements.templateItemDate.value = "";
  elements.templateItemCategory.value = "Misc";
  elements.addTemplateItemButton.textContent = "Add recurring item";
  syncTemplateDefaultDates();
}

function syncTemplateCategoryOptions() {
  if (!elements.templateCategory || !elements.templateItemCategory) return;
  const options = CATEGORY_OPTIONS.map((category) => `<option value="${category}">${category}</option>`).join("");
  elements.templateCategory.innerHTML = options;
  elements.templateItemCategory.innerHTML = options;
}

function syncTemplateDefaultDates() {
  if (elements.templateType?.value === "single") {
    if (elements.templateDate && !elements.templateDate.value) {
      elements.templateDate.value = addDaysISO(localISODate(new Date()), 14);
    }
    if (elements.templateDescriptionRecurring && !elements.templateDescriptionRecurring.value && elements.templateDescription.value) {
      elements.templateDescriptionRecurring.value = elements.templateDescription.value;
    }
    return;
  }

  if (elements.templateDescription && !elements.templateDescription.value && elements.templateDescriptionRecurring?.value) {
    elements.templateDescription.value = elements.templateDescriptionRecurring.value;
  }

  if (elements.templateStartMonth && !elements.templateStartMonth.value) {
    elements.templateStartMonth.value = currentMonthKey();
  }
  if (elements.templateEndMonth && !elements.templateEndMonth.value) {
    elements.templateEndMonth.value = elements.templateStartMonth.value || currentMonthKey();
  }
  if (elements.templateItemDate && !elements.templateItemDate.value) {
    elements.templateItemDate.value = `${elements.templateStartMonth.value || currentMonthKey()}-01`;
  }
}

function syncTimelineCategoryOptions() {
  if (!elements.timelineCategoryFilter || !elements.timelineSearch || !elements.timelineStatusFilter) return;
  const currentValue = state.ui.timelineCategoryFilter || "all";
  const options = ["all", ...new Set([...CATEGORY_OPTIONS, ...getBucketNames(state)])];
  elements.timelineCategoryFilter.innerHTML = options.map((category) => `
    <option value="${category}" ${currentValue === category ? "selected" : ""}>${category === "all" ? "All categories" : escapeHTML(category)}</option>
  `).join("");
  elements.timelineSearch.value = state.ui.timelineSearch || "";
  elements.timelineStatusFilter.value = state.ui.timelineStatusFilter || "all";
}

function describeTemplate(template) {
  if (template.type === "recurring") {
    const count = template.items?.length || 0;
    return `${count} recurring item${count === 1 ? "" : "s"} • ${formatMonthKey(template.startMonth)} to ${formatMonthKey(template.endMonth)}`;
  }
  return `${escapeHTML(template.category)} • Defaults to ${formatDate(template.date || localISODate(new Date()))}.`;
}

function formatTemplateAmount(template) {
  if (template.type === "recurring") {
    const total = (template.items || []).reduce((sum, item) => sum + item.amount, 0);
    return formatCurrency(total);
  }
  return formatCurrency(template.amount);
}

function materializeRecurringTemplate(template) {
  const months = monthRange(template.startMonth, template.endMonth);
  return months.flatMap((monthKey) => (template.items || []).map((item) => ({
    id: crypto.randomUUID(),
    label: item.label,
    amount: item.amount,
    date: buildMonthDayISO(monthKey, dayOfMonthFromISO(item.firstDate)),
    scenarioId: null,
    category: item.category || "Misc",
    isSettled: false,
    actualAmount: null,
    notes: item.notes || `Created from ${template.label} template.`
  })));
}

function monthRange(startMonth, endMonth) {
  const months = [];
  let cursor = `${startMonth}-01`;
  const end = `${endMonth}-01`;
  while (cursor <= end) {
    months.push(cursor.slice(0, 7));
    cursor = addMonthsISO(cursor, 1);
  }
  return months;
}

function addMonthsISO(isoDate, amount) {
  const date = fromISO(isoDate);
  date.setMonth(date.getMonth() + amount);
  return localISODate(date);
}

function buildMonthDayISO(monthKey, dayOfMonth) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return buildISODate(year, month, Math.min(dayOfMonth, lastDay));
}

function dayOfMonthFromISO(isoDate) {
  return Number(isoDate.split("-")[2]);
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
  requestAnimationFrame(() => {
    elements.settingsValue.focus({ preventScroll: true });
    elements.settingsValue.blur();
  });
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
    ? getBucketNames(sourceState).flatMap((category) =>
        (sourceState.buckets[monthPrefix][category]?.entries || []).map((entry) => ({
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

  const byCategory = [...new Set([...CATEGORY_OPTIONS, ...getBucketNames(sourceState)])]
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
  const amountMatch = cleanedForAmount.match(/[+-]?\d+(?:[.,]\d{1,2})?/);
  const amount = amountMatch ? Number(amountMatch[0].replace(",", ".")) : 0;
  const label = cleanedForAmount.replace(amountMatch?.[0] || "", "").trim().replace(/[+-]\s*$/, "").trim().replace(/\s+/g, " ");

  return {
    id: crypto.randomUUID(),
    label: label || "Quick event",
    amount: inferSignedAmount(sanitized, amountMatch?.[0] || "", amount),
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

function inferSignedAmount(raw, rawAmountToken, amount) {
  const lower = raw.toLowerCase();
  const absolute = Math.abs(amount);
  if (rawAmountToken.startsWith("+")) return absolute;
  if (rawAmountToken.startsWith("-")) return -absolute;
  if (amount < 0) return amount;
  if (/\b(salary|paycheck|invoice|bonus|refund|income)\b/.test(lower)) return absolute;
  return -absolute;
}

function inferCategory(raw) {
  const lower = raw.toLowerCase();
  if (/\b(credit card|card payment|payment|bill|phone|subscription|internet|electricity)\b/.test(lower)) return "Bills";
  if (/\b(salary|paycheck|bonus|invoice|refund|income)\b/.test(lower)) return "Income";
  if (["rent", "mortgage", "apartment"].some((keyword) => lower.includes(keyword))) return "Housing";
  if (["groceries", "grocery", "food", "supermarket"].some((keyword) => lower.includes(keyword))) return "Groceries";
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

  return getBucketNames(sourceState).map((category) => {
    const bucket = sourceState.buckets[monthKey][category];
    if (!bucket?.isActive) return null;
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
  }).filter((event) => event && event.amount !== 0);
}

function calculateBucketVariance(sourceState, monthKey) {
  const monthBuckets = sourceState.buckets[monthKey];
  if (!monthBuckets) return 0;

  return getBucketNames(sourceState).reduce((sum, category) => {
    const bucket = monthBuckets[category];
    if (!bucket?.isActive) return sum;
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
  getBucketTemplates(sourceState).forEach((template) => {
    const category = template.name;
    sourceState.buckets[monthKey][category] ||= {
      budgeted: template.defaultBudget,
      entries: [],
      isActive: template.isEnabledByDefault
    };
  });
}

function getBucketTemplates(sourceState) {
  return (sourceState.bucketTemplates?.length ? sourceState.bucketTemplates : DEFAULT_BUCKET_TEMPLATES).map((template) => ({
    name: template.name,
    defaultBudget: Number(template.defaultBudget) || 1000,
    isEnabledByDefault: template.isEnabledByDefault !== false
  }));
}

function getBucketNames(sourceState) {
  return getBucketTemplates(sourceState).map((template) => template.name);
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

function persist(options = {}) {
  const { markDirty = true } = options;
  ensureStateMeta(state);
  if (markDirty) {
    state.meta.lastModifiedAt = new Date().toISOString();
  }
  writeLocalCache(state);
  if (authUser && supabaseClient) {
    elements.syncBadge.textContent = "Saving";
    void saveRemoteState();
  }
}

async function loadRemoteState() {
  if (!authUser || !supabaseClient) return;

  elements.syncBadge.textContent = "Loading latest data";
  const localState = loadLocalCache();
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
    state = localState;
    render();
    persist({ markDirty: !state.meta.lastModifiedAt });
    render();
    return;
  }

  const remoteState = normalizeState(data.state);
  const remoteUpdatedAt = data.updated_at || remoteState.meta.lastModifiedAt || null;
  const localUpdatedAt = localState.meta.lastModifiedAt || null;
  const remoteIsNewer = isTimestampAfter(remoteUpdatedAt, localUpdatedAt);
  const localIsNewer = isTimestampAfter(localUpdatedAt, remoteUpdatedAt);

  if (remoteIsNewer) {
    lastRemoteUpdatedAt = remoteUpdatedAt;
    state = remoteState;
    writeLocalCache(state);
    elements.syncBadge.textContent = "Synced";
    render();
    return;
  }

  state = localState;
  render();
  if (localIsNewer || !remoteUpdatedAt) {
    elements.syncBadge.textContent = "Saving";
    void saveRemoteState();
    return;
  }

  lastRemoteUpdatedAt = remoteUpdatedAt;
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
  if (isTimestampAfter(state.meta.lastModifiedAt, data.updated_at)) return;
  lastRemoteUpdatedAt = data.updated_at;
  state = normalizeState(data.state);
  writeLocalCache(state);
  render();
}

async function saveRemoteState() {
  if (!authUser || !supabaseClient) return;

  ensureStateMeta(state);
  const serializedState = serializeState(state);
  const requestVersion = serializedState.meta.lastModifiedAt || new Date().toISOString();
  latestSaveRequestVersion = requestVersion;

  const payload = {
    user_id: authUser.id,
    state: serializedState,
    updated_at: requestVersion
  };

  const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert(payload);
  if (error) {
    console.error("Unable to save remote state", error);
    elements.syncBadge.textContent = "Sync failed";
    return;
  }

  lastRemoteUpdatedAt = payload.updated_at;
  if (state.meta.lastModifiedAt === requestVersion && latestSaveRequestVersion === requestVersion) {
    elements.syncBadge.textContent = "Synced";
    return;
  }

  elements.syncBadge.textContent = "Saving";
}

function serializeState(sourceState) {
  ensureStateMeta(sourceState);
  return {
    account: sourceState.account,
    meta: sourceState.meta,
    ui: {
      selectedDate: sourceState.ui.selectedDate,
      mobileTab: sourceState.ui.mobileTab || "forecast",
      clarityExpanded: Boolean(sourceState.ui.clarityExpanded),
      timelineSearch: sourceState.ui.timelineSearch || "",
      timelineStatusFilter: sourceState.ui.timelineStatusFilter || "all",
      timelineCategoryFilter: sourceState.ui.timelineCategoryFilter || "all",
      timelineSelectionMode: Boolean(sourceState.ui.timelineSelectionMode),
      selectedTimelineEventIds: Array.isArray(sourceState.ui.selectedTimelineEventIds) ? sourceState.ui.selectedTimelineEventIds : [],
      history: sourceState.ui.history || []
    },
    bucketTemplates: sourceState.bucketTemplates,
    buckets: sourceState.buckets,
    scenarios: sourceState.scenarios,
    templates: sourceState.templates,
    events: sourceState.events
  };
}

function normalizeState(rawState) {
  const normalizedBuckets = {};
  const rawBuckets = rawState.buckets || {};
  const bucketTemplates = (rawState.bucketTemplates || DEFAULT_BUCKET_TEMPLATES)
    .map((template) => ({
      name: (template.name || "").trim(),
      defaultBudget: Number(template.defaultBudget) || 1000,
      isEnabledByDefault: template.isEnabledByDefault !== false
    }))
    .filter((template, index, array) => template.name && array.findIndex((item) => item.name.toLowerCase() === template.name.toLowerCase()) === index);
  const effectiveTemplates = bucketTemplates.length ? bucketTemplates : structuredClone(DEFAULT_BUCKET_TEMPLATES);

  Object.keys(rawBuckets).forEach((monthKey) => {
    normalizedBuckets[monthKey] = {};
    effectiveTemplates.forEach((template) => {
      const category = template.name;
      const rawBucket = rawBuckets[monthKey]?.[category] || {};
      normalizedBuckets[monthKey][category] = {
        budgeted: Number(rawBucket.budgeted) || template.defaultBudget,
        entries: Array.isArray(rawBucket.entries)
          ? rawBucket.entries.map((entry) => ({
              id: entry.id || crypto.randomUUID(),
              amount: Number(entry.amount) || 0,
              date: entry.date || `${monthKey}-01`,
              note: entry.note || ""
            }))
          : [],
        isActive: rawBucket.isActive !== false
      };
    });
  });

  if (!Object.keys(normalizedBuckets).length) {
    const monthKey = currentMonthKey();
    normalizedBuckets[monthKey] = {};
    effectiveTemplates.forEach((template) => {
      normalizedBuckets[monthKey][template.name] = {
        budgeted: template.defaultBudget,
        entries: [],
        isActive: template.isEnabledByDefault
      };
    });
  }

  return {
    account: {
      currentBalance: rawState.account?.currentBalance ?? defaultState.account.currentBalance,
      warningThreshold: rawState.account?.warningThreshold ?? defaultState.account.warningThreshold
    },
    meta: {
      lastModifiedAt: rawState.meta?.lastModifiedAt || null
    },
    ui: {
      selectedDate: rawState.ui?.selectedDate || localISODate(new Date()),
      mobileTab: rawState.ui?.mobileTab || "forecast",
      clarityExpanded: Boolean(rawState.ui?.clarityExpanded),
      timelineSearch: rawState.ui?.timelineSearch || "",
      timelineStatusFilter: rawState.ui?.timelineStatusFilter || "all",
      timelineCategoryFilter: rawState.ui?.timelineCategoryFilter || "all",
      timelineSelectionMode: Boolean(rawState.ui?.timelineSelectionMode),
      selectedTimelineEventIds: Array.isArray(rawState.ui?.selectedTimelineEventIds) ? rawState.ui.selectedTimelineEventIds : [],
      undoNotice: null,
      history: Array.isArray(rawState.ui?.history) ? rawState.ui.history : []
    },
    bucketTemplates: effectiveTemplates,
    buckets: normalizedBuckets,
    scenarios: (rawState.scenarios || []).map((scenario) => ({
      id: scenario.id || crypto.randomUUID(),
      name: scenario.name || "Plan",
      description: scenario.description || "",
      isIncluded: Boolean(scenario.isIncluded)
    })),
    templates: (rawState.templates || defaultState.templates).map((template) => {
      const type = template.type === "recurring" ? "recurring" : "single";
      return {
        id: template.id || crypto.randomUUID(),
        type,
        label: template.label || "Template",
        description: template.description || "",
        amount: Number(template.amount) || 0,
        date: template.date || addDaysISO(localISODate(new Date()), Number(template.daysFromNow) || 0),
        category: template.category || inferCategory(template.label || ""),
        startMonth: template.startMonth || currentMonthKey(),
        endMonth: template.endMonth || currentMonthKey(),
        items: Array.isArray(template.items)
          ? template.items.map((item) => ({
              id: item.id || crypto.randomUUID(),
              label: item.label || "Recurring item",
              amount: Number(item.amount) || 0,
              firstDate: item.firstDate || buildISODate(new Date().getFullYear(), new Date().getMonth() + 1, Math.max(1, Math.min(31, Number(item.dayOfMonth) || 1))),
              category: item.category || inferCategory(item.label || ""),
              notes: item.notes || ""
            }))
          : []
      };
    }),
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

function ensureStateMeta(sourceState) {
  if (!sourceState.meta || typeof sourceState.meta !== "object") {
    sourceState.meta = { lastModifiedAt: null };
    return;
  }

  if (!("lastModifiedAt" in sourceState.meta)) {
    sourceState.meta.lastModifiedAt = null;
  }
}

function writeLocalCache(sourceState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(sourceState)));
}

function isTimestampAfter(left, right) {
  if (!left) return false;
  if (!right) return true;
  return left > right;
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

function escapeAttribute(value) {
  return escapeHTML(value);
}
