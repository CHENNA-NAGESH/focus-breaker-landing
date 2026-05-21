const form = document.getElementById("settingsForm");
const useSecondsInput = document.getElementById("useSeconds");
const blockSecondsInput = document.getElementById("blockSeconds");
const sitesInput = document.getElementById("sites");
const statusText = document.getElementById("statusText");
const timerText = document.getElementById("timerText");
const stopButton = document.getElementById("stopButton");

let refreshTimer;

function updateCursorGlow(event) {
  const x = `${Math.round((event.clientX / window.innerWidth) * 100)}%`;
  const y = `${Math.round((event.clientY / window.innerHeight) * 100)}%`;

  document.documentElement.style.setProperty("--cursor-x", x);
  document.documentElement.style.setProperty("--cursor-y", y);
}

function parseSites(value) {
  return value
    .split(/[\n,]+/)
    .map((site) => site.trim())
    .filter(Boolean);
}

function secondsUntil(timestamp) {
  if (!timestamp) {
    return 0;
  }

  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function formatSeconds(seconds) {
  if (seconds < 60) {
    return `${seconds}s remaining`;
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s remaining`;
}

async function getActiveTabUrl() {
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

async function loadState(options = {}) {
  const { syncForm = false } = options;
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const state = response?.state;

  if (!state) {
    statusText.textContent = "Ready";
    timerText.textContent = "";
    return;
  }

  if (syncForm) {
    useSecondsInput.value = "";
    blockSecondsInput.value = "";
    sitesInput.value = (state.sites || []).join("\n");
  }

  if (!state.enabled) {
    statusText.textContent = "No session running";
    timerText.textContent = "";
    return;
  }

  if (state.phase === "armed") {
    statusText.textContent = "Ready when a limited site opens";
    timerText.textContent = "Waiting";
    return;
  }

  const remaining = secondsUntil(state.phaseEndsAt);
  if (state.phase === "use") {
    statusText.textContent = "Browsing time is active";
    timerText.textContent = formatSeconds(remaining);
  } else if (state.phase === "block") {
    statusText.textContent = "Break time is active";
    timerText.textContent = formatSeconds(remaining);
  } else {
    statusText.textContent = "Ready";
    timerText.textContent = "";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const useMinutes = Number.parseFloat(useSecondsInput.value);
  const blockMinutes = Number.parseFloat(blockSecondsInput.value);
  const sites = parseSites(sitesInput.value);

  if (Number.isNaN(useMinutes) || useMinutes <= 0) {
    useSecondsInput.focus();
    return;
  }

  if (Number.isNaN(blockMinutes) || blockMinutes <= 0) {
    blockSecondsInput.focus();
    return;
  }

  const useSeconds = Math.round(useMinutes * 60);
  const blockSeconds = Math.round(blockMinutes * 60);

  if (sites.length === 0) {
    sitesInput.focus();
    return;
  }

  const activeTabUrl = await getActiveTabUrl();

  await chrome.runtime.sendMessage({
    type: "START_SCHEDULE",
    payload: { useSeconds, blockSeconds, sites, activeTabUrl }
  });

  await loadState({ syncForm: true });
});

stopButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_SCHEDULE" });
  await loadState();
});

document.addEventListener("DOMContentLoaded", async () => {
  await loadState({ syncForm: true });
  refreshTimer = window.setInterval(loadState, 1000);
});

document.addEventListener("mousemove", updateCursorGlow);

window.addEventListener("unload", () => {
  window.clearInterval(refreshTimer);
});
