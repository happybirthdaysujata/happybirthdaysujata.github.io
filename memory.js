const images = [
  "img1.jpg",
  "img2.jpg",
  "img3.jpg",
  "img4.jpg",
  // Add more image filenames here
];

let current = 0;
const imgElement = document.getElementById("memoryImage");

document.getElementById("prevBtn").addEventListener("click", () => {
  current = (current - 1 + images.length) % images.length;
  imgElement.src = images[current];
});

document.getElementById("nextBtn").addEventListener("click", () => {
  current = (current + 1) % images.length;
  imgElement.src = images[current];
});


function createFallingFlower() {
  const el = document.createElement('div');
  el.classList.add('falling');

  const emojis = ['🌸', '🌼', '🍃', '🌺'];
  el.textContent = emojis[Math.floor(Math.random() * emojis.length)];

  el.style.left = Math.random() * 100 + 'vw';
  el.style.fontSize = (20 + Math.random() * 10) + 'px';
  el.style.animationDuration = (4 + Math.random() * 4) + 's';

  document.getElementById('falling-container').appendChild(el);

  setTimeout(() => el.remove(), 8000); // Clean up after fall
}

// Create flower every 400ms
setInterval(createFallingFlower, 400);



const goToCakeBtn = document.getElementById("goToCakeBtn");

if (goToCakeBtn) {
  goToCakeBtn.addEventListener("click", function () {
    window.location.href = "cake.html";
  });
}
