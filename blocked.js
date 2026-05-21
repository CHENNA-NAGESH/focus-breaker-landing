const remainingTime = document.getElementById("remainingTime");
const params = new URLSearchParams(window.location.search);
const targetUrl = params.get("target");

function secondsUntil(timestamp) {
  if (!timestamp) {
    return 0;
  }

  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function formatSeconds(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const paddedHrs = String(hrs).padStart(2, "0");
  const paddedMins = String(mins).padStart(2, "0");
  const paddedSecs = String(secs).padStart(2, "0");

  return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
}

async function refreshBlockedPage() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const state = response?.state;

  if (!state?.enabled || state.phase !== "block") {
    navigateToTarget();
    return;
  }

  const remaining = secondsUntil(state.phaseEndsAt);
  remainingTime.textContent = formatSeconds(remaining);

  if (remaining <= 0) {
    navigateToTarget();
  }
}

function navigateToTarget() {
  if (targetUrl && /^https?:\/\//.test(targetUrl)) {
    window.location.replace(targetUrl);
  }
}

let targetDriftX = 0;
let targetDriftY = 0;
let currentDriftX = 0;
let currentDriftY = 0;

function updateCursorGlow(event) {
  const xPercent = event.clientX / window.innerWidth;
  const yPercent = event.clientY / window.innerHeight;

  const x = `${Math.round(xPercent * 100)}%`;
  const y = `${Math.round(yPercent * 100)}%`;

  document.documentElement.style.setProperty("--cursor-x", x);
  document.documentElement.style.setProperty("--cursor-y", y);

  targetDriftX = xPercent - 0.5;
  targetDriftY = yPercent - 0.5;
}

function animateParallax() {
  currentDriftX += (targetDriftX - currentDriftX) * 0.08;
  currentDriftY += (targetDriftY - currentDriftY) * 0.08;

  document.documentElement.style.setProperty("--drift-x", currentDriftX);
  document.documentElement.style.setProperty("--drift-y", currentDriftY);

  requestAnimationFrame(animateParallax);
}

document.addEventListener("mousemove", updateCursorGlow);
animateParallax();

refreshBlockedPage();
window.setInterval(refreshBlockedPage, 1000);
