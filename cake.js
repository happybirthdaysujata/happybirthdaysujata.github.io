cake.addEventListener('click', () => {
  if (fallingStarted) return;
  fallingStarted = true;
  flame.style.display = 'none';
  music.play();
  setInterval(createFallingCandle, 300);

  // Show the styled next button after click
  document.getElementById('nextBtn').classList.remove('hidden');
});
