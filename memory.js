/* memory.js - Supabase realtime gallery for GitHub Pages
   EDIT THESE with your Supabase project values before committing to GitHub:
*/
const SUPABASE_URL = 'https://jeibfypjxiolkezasjku.supabase.co'; // ← replace
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplaWJmeXBqeGlvbGtlemFzamt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4Mzk3MjcsImV4cCI6MjA3MzQxNTcyN30.HQAJ7TXg-5SAH3d7io-HTyrjF-p66ddAHjwPUY-tayI';            // ← replace
const SUPABASE_BUCKET = 'gallery';                         // ← replace

const STORAGE_KEY = 'memories_images_v1';

let supabase = null;
let images = [];     // array of { url, id, path }
let currentIndex = 0;

/* DOM refs */
const memoryImage = document.getElementById('memoryImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const goToCakeBtn = document.getElementById('goToCakeBtn');

const uploadInput = document.getElementById('uploadInput');
const changeBtn = document.getElementById('changeBtn');
const changeInput = document.getElementById('changeInput');

const clearAllBtn = document.getElementById('clearAllBtn');

const thumbnails = document.getElementById('thumbnails');
const imageIndex = document.getElementById('imageIndex');

/* Initialize Supabase client (if available) */
(function initSupabase() {
  try {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Supabase client missing or config not set. Realtime disabled. window.supabase=', !!window.supabase);
      return;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
    console.log('Supabase client initialized.');
  } catch (e) {
    console.error('Supabase init failed:', e);
  }
})();

/* --- local storage helpers --- */
function saveImagesToLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
    return true;
  } catch (e) {
    console.warn('saveImagesToLocal failed', e);
    return false;
  }
}
function loadImagesFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('loadImagesFromLocal failed', e);
    return [];
  }
}

/* --- file helpers (resize/convert) --- */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = (e) => resolve(e.target.result);
    fr.onerror = (e) => reject(e);
    fr.readAsDataURL(file);
  });
}
async function resizeImageFile(file, maxDim = 1200, quality = 0.78) {
  const dataUrl = await readFileAsDataURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const [w, h] = [img.width, img.height];
      let targetW = w, targetH = h;
      if (Math.max(w, h) > maxDim) {
        if (w > h) { targetW = maxDim; targetH = Math.round(h * (maxDim / w)); }
        else { targetH = maxDim; targetW = Math.round(w * (maxDim / h)); }
      }
      const canvas = document.createElement('canvas');
      canvas.width = targetW; canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
function dataURLToBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

/* --- Supabase: upload to storage + insert row --- */
async function uploadToSupabaseStorage(dataUrl, filename) {
  if (!supabase) throw new Error('Supabase not initialized');
  const arr = dataUrl.split(',');
  const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  const blob = new Blob([u8], { type: mime });

  const safeName = `${Date.now()}_${filename.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_\-\.]/g,'')}`;
  const path = safeName;

  const { data: uploadData, error: uploadError } = await supabase.storage.from(SUPABASE_BUCKET).upload(path, blob, { cacheControl: '3600', upsert: false });
  if (uploadError) { console.error('Storage upload error', uploadError); throw uploadError; }

  const { data: publicData } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  const publicUrl = publicData && publicData.publicUrl ? publicData.publicUrl : null;
  if (!publicUrl) throw new Error('Could not get public URL');

  const { data: insertData, error: insertError } = await supabase.from('images').insert([{ url: publicUrl, path }]).select().limit(1);
  if (insertError) { console.warn('DB insert failed (upload exists):', insertError); return { url: publicUrl, path, id: null }; }
  const row = insertData && insertData[0] ? insertData[0] : null;
  return { url: publicUrl, path, id: row ? row.id : null };
}

/* --- realtime subscription --- */
let supabaseSubscription = null;
function subscribeToImagesTable() {
  if (!supabase) return;
  try {
    if (supabaseSubscription && typeof supabaseSubscription.unsubscribe === 'function') supabaseSubscription.unsubscribe();
    supabaseSubscription = supabase
      .channel('public:images')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'images' }, (payload) => {
        const newRow = payload.new;
        if (!newRow || !newRow.url) return;
        if (images.some(i => i.url === newRow.url)) return;
        images.push({ url: newRow.url, id: newRow.id || null, path: newRow.path || null });
        saveImagesToLocal();
        showImage(images.length - 1);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'images' }, (payload) => {
        const oldRow = payload.old;
        if (!oldRow) return;
        const idx = images.findIndex(i => i.id === oldRow.id || i.url === oldRow.url || i.path === oldRow.path);
        if (idx !== -1) {
          images.splice(idx, 1);
          saveImagesToLocal();
          if (currentIndex >= images.length) currentIndex = images.length - 1;
          showImage(currentIndex);
        }
      })
      .subscribe()
      .catch(err => console.warn('subscribe error', err));
  } catch (e) {
    console.error('subscribeToImagesTable exception', e);
  }
}

/* --- load existing rows --- */
async function loadExistingImagesFromDb() {
  if (!supabase) {
    images = loadImagesFromLocal().slice();
    if (images.length) showImage(0);
    return;
  }
  try {
    const { data, error } = await supabase.from('images').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    if (Array.isArray(data)) {
      for (const row of data) if (!images.some(i => i.url === row.url)) images.push({ url: row.url, id: row.id || null, path: row.path || null });
      if (images.length) showImage(0);
      saveImagesToLocal();
    }
  } catch (e) {
    console.warn('Could not load images from DB; using local', e);
    images = loadImagesFromLocal().slice();
    if (images.length) showImage(0);
  }
}

/* --- UI updates --- */
function updateThumbnails() {
  if (!thumbnails) return;
  thumbnails.innerHTML = '';
  images.forEach((obj, idx) => {
    const btn = document.createElement('button');
    btn.className = 'thumb-btn';
    btn.title = `Image ${idx + 1}`;
    btn.dataset.index = idx;
    const img = document.createElement('img');
    img.src = obj.url;
    img.alt = `thumb-${idx}`;
    img.className = 'thumb-img';
    btn.appendChild(img);
    if (idx === currentIndex) btn.classList.add('active-thumb');
    btn.addEventListener('click', () => { currentIndex = idx; showImage(currentIndex); });
    thumbnails.appendChild(btn);
  });
}
function showImage(index) {
  if (!memoryImage) return;
  if (images.length === 0) {
    memoryImage.src = ''; memoryImage.alt = 'No images uploaded yet';
    if (imageIndex) imageIndex.textContent = 'No images';
    updateThumbnails();
    return;
  }
  currentIndex = ((index % images.length) + images.length) % images.length;
  memoryImage.src = images[currentIndex].url;
  memoryImage.alt = `Memory ${currentIndex + 1}`;
  if (imageIndex) imageIndex.textContent = `${currentIndex + 1} / ${images.length}`;
  updateThumbnails();
}

/* --- navigation --- */
if (prevBtn) prevBtn.addEventListener('click', () => { if (images.length) { currentIndex = (currentIndex - 1 + images.length) % images.length; showImage(currentIndex); }});
if (nextBtn) nextBtn.addEventListener('click', () => { if (images.length) { currentIndex = (currentIndex + 1) % images.length; showImage(currentIndex); }});
if (goToCakeBtn) goToCakeBtn.addEventListener('click', () => { window.location.href = 'cake.html'; });

/* --- upload handler --- */
if (uploadInput) {
  uploadInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      let compressedDataUrl;
      try { compressedDataUrl = await resizeImageFile(file, 1200, 0.78); } catch (err) { compressedDataUrl = await readFileAsDataURL(file); }
      try {
        const { url, path, id } = await uploadToSupabaseStorage(compressedDataUrl, file.name);
        if (!images.some(i => i.url === url)) {
          images.push({ url, id: id || null, path });
          saveImagesToLocal();
          showImage(images.length - 1);
        }
        console.log('Uploaded to Supabase:', url);
      } catch (err) {
        console.error('Supabase upload failed; using local:', err);
        images.push({ url: compressedDataUrl, id: null, path: null });
        saveImagesToLocal();
        showImage(images.length - 1);
      }
    }
    uploadInput.value = '';
  });
}

/* --- change (replace current) --- */
if (changeBtn) {
  changeBtn.addEventListener('click', () => {
    if (!images.length) { alert('No images to change. Add one first.'); return; }
    if (changeInput) changeInput.click();
  });
}
if (changeInput) {
  changeInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); changeInput.value = ''; return; }
    let compressedDataUrl;
    try { compressedDataUrl = await resizeImageFile(file, 1200, 0.78); } catch (err) { compressedDataUrl = await readFileAsDataURL(file); }
    try {
      const { url, path, id } = await uploadToSupabaseStorage(compressedDataUrl, file.name);
      const cur = images[currentIndex];
      if (cur && cur.id && supabase) {
        try { await supabase.from('images').update({ url, path }).eq('id', cur.id); } catch (e) { console.warn('DB update failed; replacing locally', e); images[currentIndex] = { url, id: cur.id, path }; saveImagesToLocal(); }
      } else { images[currentIndex] = { url, id: id || null, path }; saveImagesToLocal(); }
      showImage(currentIndex);
    } catch (err) {
      console.warn('Change upload failed; using local', err);
      images[currentIndex] = { url: compressedDataUrl, id: null, path: null }; saveImagesToLocal(); showImage(currentIndex);
    }
    changeInput.value = '';
  });
}

/* --- clear all (local only) --- */
if (clearAllBtn) clearAllBtn.addEventListener('click', async () => {
  if (!images.length) { alert('Nothing to clear.'); return; }
  if (!confirm('Clear all saved images from this browser? This will NOT delete storage files.')) return;
  images = []; currentIndex = 0; saveImagesToLocal(); showImage(currentIndex);
});

/* --- init --- */
async function init() {
  images = loadImagesFromLocal().slice();
  if (supabase) {
    await loadExistingImagesFromDb();
    subscribeToImagesTable();
  } else if (images.length) {
    showImage(0);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') prevBtn && prevBtn.click(); if (e.key === 'ArrowRight') nextBtn && nextBtn.click(); });
  console.log('App ready. images count:', images.length);
}
init();


