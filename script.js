const startBtn = document.getElementById('startBtn');
const message = document.querySelector('.message');
const bgMusic = document.getElementById('bgMusic');
const music = document.getElementById('music');
const nextBtn = document.getElementById('nextBtn');

// Handle click on "Begin Your Surprise"
startBtn.addEventListener('click', () => {
  startBtn.style.display = 'none'; // Hide start button
  message.classList.remove('hidden'); // Show birthday message
  bgMusic.play(); // Play background music
  music.play(); // Play main birthday song

  // Now show the "Next" button
  nextBtn.classList.remove('hidden');
});

// Animate falling leaves or emojis
function createFallingLeaf() {
  const el = document.createElement('div');
  el.classList.add('falling');
  el.textContent = '🍃 🌼'; // Emoji choice
  el.style.left = Math.random() * 100 + 'vw';
  el.style.fontSize = (20 + Math.random() * 20) + 'px';
  el.style.animationDuration = (4 + Math.random() * 4) + 's';
  el.style.opacity = 0.6 + Math.random() * 0.4;

  document.getElementById('falling-container').appendChild(el);
  setTimeout(() => el.remove(), parseFloat(el.style.animationDuration) * 1000);
}

setInterval(createFallingLeaf, 200);

// Handle "Next" button click
nextBtn.addEventListener('click', () => {
  window.location.href = 'memory.html';
});
