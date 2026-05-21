// Smooth LERP (Linear Interpolation) for Mouse Parallax Drift
let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;
const ease = 0.08; // LERP speed

// Handle mouse movements to track cursor glow and compute drift targets
document.addEventListener('mousemove', (e) => {
  // Update raw cursor coordinates for glow effects
  document.documentElement.style.setProperty('--cursor-x', `${e.clientX}px`);
  document.documentElement.style.setProperty('--cursor-y', `${e.clientY}px`);

  // Compute normalized coordinate offsets (-0.5 to 0.5) for parallax calculations
  targetX = (e.clientX / window.innerWidth) - 0.5;
  targetY = (e.clientY / window.innerHeight) - 0.5;
});

// Update touch movements to work on mobile screens
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches[0]) {
    const touch = e.touches[0];
    document.documentElement.style.setProperty('--cursor-x', `${touch.clientX}px`);
    document.documentElement.style.setProperty('--cursor-y', `${touch.clientY}px`);

    targetX = (touch.clientX / window.innerWidth) - 0.5;
    targetY = (touch.clientY / window.innerHeight) - 0.5;
  }
});

// Parallax Animation Loop
function animateParallax() {
  // Calculate LERP
  currentX += (targetX - currentX) * ease;
  currentY += (targetY - currentY) * ease;

  // Set the CSS drift variables
  document.documentElement.style.setProperty('--drift-x', currentX.toFixed(4));
  document.documentElement.style.setProperty('--drift-y', currentY.toFixed(4));

  requestAnimationFrame(animateParallax);
}

// Start animation loop
animateParallax();

// Simulate the Mockup Timer ticking
const timerElement = document.querySelector('.timer-display');
let timerSeconds = 105; // Starting time: 01:45 (105 seconds)

function updateMockupTimer() {
  if (timerElement) {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const secs = timerSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');
    timerElement.textContent = `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;

    if (timerSeconds <= 0) {
      timerSeconds = 105; // Reset back to 01:45 to keep the mockup looping
    } else {
      timerSeconds--;
    }
  }
}

// Tick every second
setInterval(updateMockupTimer, 1000);
updateMockupTimer(); // Run once immediately
