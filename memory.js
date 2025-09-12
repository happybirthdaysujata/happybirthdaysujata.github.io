// memory.js
// Persistent image slider with add, change (replace), delete and thumbnails.
// Images are saved as data URLs in localStorage under key 'memories_images_v1'

const STORAGE_KEY = 'memories_images_v1';

let images = []; // array of data URLs
let currentIndex = 0;

const memoryImage = document.getElementById('memoryImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const goToCakeBtn = document.getElementById('goToCakeBtn');

const uploadInput = document.getElementById('uploadInput');
const changeBtn = document.getElementById('changeBtn');
const changeInput = document.getElementById('changeInput');

const deleteBtn = document.getElementById('deleteBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

const thumbnails = document.getElementById('thumbnails');
const imageIndex = document.getElementById('imageIndex');

// ---------- Local Storage helpers ----------
function saveImagesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  } catch (e) {
    console.warn('Could not save images to localStorage:', e);
  }
}

function loadImagesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) images = parsed;
    }
  } catch (e) {
    console.warn('Could not load images from storage:', e);
  }
}

// ---------- UI update ----------
function updateThumbnails() {
  thumbnails.innerHTML = '';
  images.forEach((dataUrl, idx) => {
    const btn = document.createElement('button');
    btn.className = 'thumb-btn';
    btn.title = `Image ${idx + 1}`;
    btn.dataset.index = idx;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = `thumb-${idx}`;
    img.className = 'thumb-img';

    btn.appendChild(img);
    if (idx === currentIndex) btn.classList.add('active-thumb');

    btn.addEventListener('click', () => {
      currentIndex = idx;
      showImage(currentIndex);
    });

    thumbnails.appendChild(btn);
  });
}

function showImage(index) {
  if (images.length === 0) {
    memoryImage.src = '';
    memoryImage.alt = 'No images uploaded yet';
    imageIndex.textContent = 'No images';
    return;
  }
  // clamp index
  currentIndex = ((index % images.length) + images.length) % images.length;
  memoryImage.src = images[currentIndex];
  memoryImage.alt = `Memory ${currentIndex + 1}`;
  imageIndex.textContent = `${currentIndex + 1} / ${images.length}`;
  updateThumbnails();
}

// ---------- Navigation ----------
prevBtn.addEventListener('click', () => {
  if (images.length > 0) {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    showImage(currentIndex);
  }
});

nextBtn.addEventListener('click', () => {
  if (images.length > 0) {
    currentIndex = (currentIndex + 1) % images.length;
    showImage(currentIndex);
  }
});

goToCakeBtn.addEventListener('click', () => {
  window.location.href = 'cake.html';
});

// ---------- Upload (add) ----------
uploadInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  // read files as DataURL sequentially to avoid memory spike
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const dataUrl = await readFileAsDataURL(file);
    images.push(dataUrl);
  }

  saveImagesToStorage();
  // show the last uploaded image by default
  currentIndex = images.length - 1;
  showImage(currentIndex);

  // clear input so same file can be re-selected later if needed
  uploadInput.value = '';
});

// Helper: read File -> data URL (returns Promise)
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Change (replace current) ----------
changeBtn.addEventListener('click', () => {
  if (images.length === 0) {
    alert('No images to change. Please add an image first.');
    return;
  }
  changeInput.click();
});

changeInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file.');
    changeInput.value = '';
    return;
  }
  const dataUrl = await readFileAsDataURL(file);
  images[currentIndex] = dataUrl;
  saveImagesToStorage();
  showImage(currentIndex);
  changeInput.value = '';
});

// ---------- Delete ----------
deleteBtn.addEventListener('click', () => {
  if (images.length === 0) {
    alert('No images to delete.');
    return;
  }
  const yes = confirm('Delete the current image? This cannot be undone.');
  if (!yes) return;

  images.splice(currentIndex, 1);
  if (currentIndex >= images.length) currentIndex = images.length - 1;
  saveImagesToStorage();
  showImage(currentIndex);
});

// ---------- Clear All ----------
clearAllBtn.addEventListener('click', () => {
  if (images.length === 0) {
    alert('Nothing to clear.');
    return;
  }
  const yes = confirm('Clear all saved images from this browser?');
  if (!yes) return;
  images = [];
  currentIndex = 0;
  saveImagesToStorage();
  showImage(currentIndex);
});

// ---------- Init ----------
function init() {
  loadImagesFromStorage();
  if (images.length === 0) {
    // Optionally set a default placeholder (optional)
    memoryImage.src = '';
    imageIndex.textContent = 'No images';
  } else {
    showImage(0);
  }
  // for accessibility: keyboard left/right
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prevBtn.click();
    if (e.key === 'ArrowRight') nextBtn.click();
  });
}

init();


