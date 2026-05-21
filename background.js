const STORAGE_KEY = "focusBreakerState";
const RULE_ID_START = 1000;
const PHASE_ALARM = "focusBreakerPhaseAlarm";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStateIsCurrent();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureStateIsCurrent();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_STATE") {
    getState().then((state) => sendResponse({ state }));
    return true;
  }

  if (message?.type === "START_SCHEDULE") {
    startSchedule(message.payload).then((state) => sendResponse({ state }));
    return true;
  }

  if (message?.type === "STOP_SCHEDULE") {
    stopSchedule().then((state) => sendResponse({ state }));
    return true;
  }


  return false;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const visitedUrl = changeInfo.url || tab.url;

  if (!visitedUrl && changeInfo.status !== "complete") {
    return;
  }

  await handleTabVisit(tabId, visitedUrl, Boolean(changeInfo.url));
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await handleTabVisit(tabId, tab.url, false);
  } catch (_error) {
    // Some browser pages and special tabs cannot be inspected.
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== PHASE_ALARM) {
    return;
  }

  await advancePhase();
});

async function getState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || createDefaultState();
}

async function setState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  return state;
}

function createDefaultState() {
  return {
    enabled: false,
    phase: "idle",
    useSeconds: 0,
    blockSeconds: 0,
    sites: [],
    phaseEndsAt: null,
    lastBlockedUrl: null
  };
}

async function startSchedule(payload) {
  const sites = normalizeSites(payload?.sites || []);
  const useSeconds = clampSeconds(payload?.useSeconds);
  const blockSeconds = clampSeconds(payload?.blockSeconds);

  if (!useSeconds || !blockSeconds || sites.length === 0) {
    return getState();
  }

  await clearBlockingRules();
  const state = {
    enabled: true,
    phase: "armed",
    useSeconds,
    blockSeconds,
    sites,
    phaseEndsAt: null,
    lastBlockedUrl: null
  };

  await chrome.alarms.clear(PHASE_ALARM);
  await notify("Focus Breaker is ready", "Your use timer will start when you open a listed website.");
  await setState(state);
  await startUseTimerIfUrlMatches(payload?.activeTabUrl);
  await startUseTimerIfActiveTabMatches();
  return getState();
}

async function stopSchedule() {
  await chrome.alarms.clear(PHASE_ALARM);
  await clearBlockingRules();

  const state = await getState();
  return setState({
    ...state,
    enabled: false,
    phase: "idle",
    phaseEndsAt: null,
    lastBlockedUrl: null
  });
}

async function advancePhase() {
  const state = await getState();

  if (!state.enabled) {
    await clearBlockingRules();
    return;
  }

  if (state.phase === "use") {
    const nextState = {
      ...state,
      phase: "block",
      phaseEndsAt: Date.now() + state.blockSeconds * 1000
    };

    await clearBlockingRules();
    await chrome.alarms.create(PHASE_ALARM, { when: nextState.phaseEndsAt });
    await setState(nextState);
    await redirectOpenBlockedTabs(nextState.sites);
    await notify("Websites blocked", `Blocked sites will resume in ${state.blockSeconds} seconds.`);
    return;
  }

  if (state.phase === "block") {
    await clearBlockingRules();
    await restoreBlockedTabs();

    const nextState = {
      ...state,
      enabled: false,
      phase: "idle",
      phaseEndsAt: null,
      lastBlockedUrl: null
    };

    await notify("Websites resumed", "Your blocked websites are available again.");
    await setState(nextState);
  }
}

async function ensureStateIsCurrent() {
  const state = await getState();

  if (!state.enabled) {
    await clearBlockingRules();
    return;
  }

  if (state.phaseEndsAt && Date.now() >= state.phaseEndsAt) {
    await advancePhase();
    return;
  }

  if (state.phase === "block") {
    await clearBlockingRules();
    await redirectOpenBlockedTabs(state.sites);
  } else if (state.phase === "use") {
    await clearBlockingRules();
    await chrome.alarms.create(PHASE_ALARM, { when: state.phaseEndsAt });
  } else {
    await clearBlockingRules();
  }
}

function normalizeSites(sites) {
  const normalized = sites
    .map((site) => site.trim().toLowerCase())
    .map((site) => site.replace(/^https?:\/\//, ""))
    .map((site) => site.replace(/^www\./, ""))
    .map((site) => site.split("/")[0])
    .filter((site) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(site));

  return [...new Set(normalized)].slice(0, 100);
}

function clampSeconds(value) {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isInteger(seconds) || seconds < 1) {
    return 0;
  }

  return Math.min(seconds, 86400);
}

async function applyBlockingRules(sites) {
  await clearBlockingRules();

  const addRules = sites.map((site, index) => ({
    id: RULE_ID_START + index,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: "/blocked.html" }
    },
    condition: {
      urlFilter: `||${site}^`,
      resourceTypes: ["main_frame"]
    }
  }));

  if (addRules.length === 0) {
    return;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
}

async function redirectOpenBlockedTabs(sites) {
  const blockedHosts = new Set(sites);
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || !isBlockedUrl(tab.url, blockedHosts)) {
        return;
      }

      try {
        await redirectTabToBlockedPage(tab.id, tab.url);
      } catch (_error) {
        // Some browser pages and special tabs cannot be updated.
      }
    })
  );
}

async function startUseTimerIfActiveTabMatches() {
  const state = await getState();
  if (!state.enabled || state.phase !== "armed") {
    return;
  }

  const activeTabUrl = await getActiveBrowserTabUrl();
  if (activeTabUrl && isBlockedUrl(activeTabUrl, new Set(state.sites))) {
    await startUseTimer();
  }
}

async function getActiveBrowserTabUrl() {
  const queries = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
    { active: true }
  ];

  for (const query of queries) {
    try {
      const tabs = await chrome.tabs.query(query);
      if (tabs) {
        for (const tab of tabs) {
          if (tab?.url && /^https?:\/\//.test(tab.url)) {
            return tab.url;
          }
        }
      }
    } catch (_error) {
      // Ignore query errors
    }
  }

  try {
    const focusedWindow = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ["normal"]
    });
    const activeTab = focusedWindow.tabs?.find((tab) => tab.active);
    return activeTab?.url && /^https?:\/\//.test(activeTab.url) ? activeTab.url : null;
  } catch (_error) {
    return null;
  }
}

async function startUseTimerIfUrlMatches(url) {
  const state = await getState();
  if (!state.enabled || state.phase !== "armed" || !url) {
    return;
  }

  if (isBlockedUrl(url, new Set(state.sites))) {
    await startUseTimer();
  }
}

async function handleTabVisit(tabId, url, isNavigation) {
  const state = await getState();

  if (!state.enabled || !url || isExtensionUrl(url)) {
    return;
  }

  if (state.phase === "armed" && isBlockedUrl(url, new Set(state.sites))) {
    await startUseTimer();
    return;
  }

  if (state.phase === "block" && isBlockedUrl(url, new Set(state.sites))) {
    if (state.phaseEndsAt && Date.now() >= state.phaseEndsAt) {
      await advancePhase();
      return;
    }

    await redirectTabToBlockedPage(tabId, url);
  }
}

async function startUseTimer() {
  const state = await getState();

  if (!state.enabled || state.phase !== "armed") {
    return;
  }

  const nextState = {
    ...state,
    phase: "use",
    phaseEndsAt: Date.now() + state.useSeconds * 1000
  };

  await clearBlockingRules();
  await chrome.alarms.create(PHASE_ALARM, { when: nextState.phaseEndsAt });
  await notify("Use timer started", `You can use listed websites for ${state.useSeconds} seconds.`);
  await setState(nextState);
}

async function redirectTabToBlockedPage(tabId, targetUrl) {
  const blockedUrl = chrome.runtime.getURL(`blocked.html?target=${encodeURIComponent(targetUrl)}`);
  const state = await getState();

  await setState({
    ...state,
    lastBlockedUrl: targetUrl
  });
  await chrome.tabs.update(tabId, { url: blockedUrl });
}

async function restoreBlockedTabs() {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || !isExtensionBlockedPage(tab.url)) {
        return;
      }

      const targetUrl = getTargetFromBlockedPage(tab.url);
      if (!targetUrl) {
        return;
      }

      try {
        await chrome.tabs.update(tab.id, { url: targetUrl });
      } catch (_error) {
        // The tab may have closed before the block period ended.
      }
    })
  );
}

function isBlockedUrl(url, blockedHosts) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return [...blockedHosts].some((site) => hostname === site || hostname.endsWith(`.${site}`));
  } catch (_error) {
    return false;
  }
}

function isExtensionUrl(url) {
  return url.startsWith(chrome.runtime.getURL(""));
}

function isExtensionBlockedPage(url) {
  return url.startsWith(chrome.runtime.getURL("blocked.html"));
}

function getTargetFromBlockedPage(url) {
  try {
    const parsedUrl = new URL(url);
    const target = parsedUrl.searchParams.get("target");
    return target && /^https?:\/\//.test(target) ? target : null;
  } catch (_error) {
    return null;
  }
}

async function clearBlockingRules() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = rules
    .filter((rule) => rule.id >= RULE_ID_START && rule.id < RULE_ID_START + 100)
    .map((rule) => rule.id);

  if (removeRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
  }
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message
    });
  } catch (_error) {
    // Notifications can be unavailable in some development contexts.
  }
}
