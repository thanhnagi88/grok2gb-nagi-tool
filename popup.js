// Grok2FB - Nagi Pro Core v2.2
let foundMedia = [];
let countdownInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  renderInitialState();
  startCountdownLoop();

  // Primary Actions
  document.getElementById('scan-btn').onclick = scanGrok;
  document.getElementById('confirm-queue-btn').onclick = confirmToQueue;
  document.getElementById('toggle-pipeline-btn').onclick = togglePipeline;
  document.getElementById('clear-queue-btn').onclick = clearQueue;
  document.getElementById('select-all').onchange = (e) => toggleAllSelection(e.target.checked);

  // Load existing state
  const data = await chrome.storage.local.get(['isPipelineActive']);
  updateGlobalStatus(data.isPipelineActive);
});

async function scanGrok() {
  addLog("🔍 Đang tìm hình từ Grok...");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('grok.com') && !tab.url.includes('x.ai')) {
    addLog("❌ Vui lòng mở trang Grok trước!");
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: "scan_media" }, (response) => {
    if (response && response.media && response.media.length > 0) {
      foundMedia = response.media;
      renderMediaGrid();
      document.getElementById('selection-controls').classList.remove('hidden');
      addLog(`✨ Đã tìm thấy ${foundMedia.length} kết quả.`);
    } else {
      addLog("❓ Không tìm thấy hình nào mới.");
    }
  });
}

function renderMediaGrid() {
  const grid = document.getElementById('media-grid');
  grid.innerHTML = foundMedia.map((item, idx) => `
    <div class="media-card" id="card-${idx}" data-idx="${idx}">
      <img src="${item.previewUrl}">
      <div class="preview-btn" data-url="${item.url}" title="Xem thử Logo">👁️</div>
      <div class="card-overlay">✓</div>
    </div>
  `).join('');

  grid.querySelectorAll('.preview-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openPreview(btn.dataset.url);
    };
  });

  grid.querySelectorAll('.media-card').forEach((card, idx) => {
    card.onclick = () => toggleSelection(idx);
  });
}

function toggleSelection(idx) {
  const card = document.getElementById(`card-${idx}`);
  card.classList.toggle('selected');
  updateConfirmButton();
}

function toggleAllSelection(checked) {
  document.querySelectorAll('.media-card').forEach(card => {
    if (checked) card.classList.add('selected');
    else card.classList.remove('selected');
  });
  updateConfirmButton();
}

function updateConfirmButton() {
  const count = document.querySelectorAll('.media-card.selected').length;
  const btn = document.getElementById('confirm-queue-btn');
  if (count > 0) {
    btn.classList.remove('hidden');
    btn.innerText = `XÁC NHẬN CHỌN (${count}) ✅`;
  } else {
    btn.classList.add('hidden');
  }
}

async function confirmToQueue() {
  const selectedIndices = Array.from(document.querySelectorAll('.media-card.selected'))
    .map(card => parseInt(card.dataset.idx));

  if (selectedIndices.length === 0) return;

  const data = await chrome.storage.local.get(['postQueue']);
  let queue = data.postQueue || [];
  
  const lastTime = queue.length > 0 ? Math.max(...queue.map(p => p.scheduledTime)) : Date.now();
  const interval = 15; // default 15 mins

  const newItems = selectedIndices.map((idx, i) => {
    const item = foundMedia[idx];
    if (!item) return null;
    return {
      id: Math.random().toString(36).substr(2, 9),
      url: item.url,
      previewUrl: item.previewUrl,
      caption: typeof transformPromptToStatus === 'function' ? transformPromptToStatus(item.caption) : (item.caption || ""),
      scheduledTime: lastTime + ((i + 1) * interval * 60 * 1000),
      status: 'pending'
    };
  }).filter(item => item !== null);

  const fullQueue = [...queue, ...newItems];
  await chrome.storage.local.set({ postQueue: fullQueue });
  
  // Clean up and switch view
  foundMedia = [];
  document.getElementById('media-grid').innerHTML = '';
  document.getElementById('selection-controls').classList.add('hidden');
  document.getElementById('scanning-section').classList.add('hidden'); // Ẩn luôn phần quét
  document.getElementById('queue-section').classList.remove('hidden');
  
  updateQueueUI(fullQueue); 
  addLog(`✅ Đã thêm ${newItems.length} hình vào hàng chờ.`);
}

async function updateQueueUI(forcedQueue = null) {
  const data = forcedQueue ? { postQueue: forcedQueue } : await chrome.storage.local.get(['postQueue']);
  const queue = data.postQueue || [];
  const list = document.getElementById('queue-list');

  // Update counter
  const counter = document.getElementById('queue-count');
  if (counter) counter.innerText = queue.length;
  
  if (queue.length === 0) {
    list.innerHTML = `<div class="empty-state">Hàng chờ đang trống. Hãy quét hình từ Grok!</div>`;
    document.getElementById('queue-section').classList.add('hidden');
    return;
  }

  const sorted = [...queue].sort((a, b) => a.scheduledTime - b.scheduledTime);

  list.innerHTML = sorted.map(item => {
    const date = item.scheduledTime ? new Date(item.scheduledTime) : new Date();
    const isoStr = toLocalISO(date);
    const isPosted = item.status === 'posted';
    const isProcessing = item.status === 'processing';

    return `
      <div class="queue-item ${item.status || 'pending'}">
        <div class="thumb-wrapper">
          <img src="${item.previewUrl}" class="item-thumb" data-url="${item.url}" title="Bấm để xem thử Logo">
          <div class="preview-eye">👁️</div>
        </div>
        <div class="item-main">
          <textarea class="caption-editor" data-id="${item.id}" ${isPosted || isProcessing ? 'disabled' : ''}>${item.caption}</textarea>
          
          <div class="time-editor-row">
            ${isPosted ? '<span class="status-badge success">✅ ĐÃ ĐĂNG</span>' : 
              isProcessing ? '<span class="status-badge processing">📡 ĐANG ĐĂNG...</span>' : `
              <input type="datetime-local" class="large-time-input" data-id="${item.id}" value="${isoStr}">
              <button class="adj-btn" data-id="${item.id}" data-val="15">+15p</button>
              <button class="adj-btn" data-id="${item.id}" data-val="60">+1h</button>
              <button class="adj-btn 🚀" data-id="${item.id}" title="Đăng ngay">🚀</button>
            `}
            <button class="btn remove-btn small" data-id="${item.id}">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  attachQueueEvents();
}

function attachQueueEvents() {
  // Preview from queue
  document.querySelectorAll('.thumb-wrapper').forEach(wrapper => {
    const thumb = wrapper.querySelector('.item-thumb');
    wrapper.onclick = () => openPreview(thumb.dataset.url);
  });

  // Caption changes
  document.querySelectorAll('.caption-editor').forEach(el => {
    el.oninput = async () => {
      const id = el.dataset.id;
      const d = await chrome.storage.local.get(['postQueue']);
      const q = (d.postQueue || []).map(p => p.id === id ? { ...p, caption: el.value } : p);
      await chrome.storage.local.set({ postQueue: q });
    };
  });

  // Manual Time Change
  document.querySelectorAll('.large-time-input').forEach(el => {
    el.onchange = async () => {
      const id = el.dataset.id;
      const time = new Date(el.value).getTime();
      adjustTime(id, time, true);
    };
  });

  // Quick Adjustment Buttons
  document.querySelectorAll('.adj-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      if (btn.innerText === '🚀') {
         // Post Now Logic
         adjustTime(id, 0, true);
         chrome.runtime.sendMessage({ action: 'checkQueue' });
         addLog("🚀 Đang khởi động đăng ngay...");
      } else {
         const mins = parseInt(btn.dataset.val);
         const d = await chrome.storage.local.get(['postQueue']);
         const item = (d.postQueue || []).find(p => p.id === id);
         if (item) {
           const newTime = item.scheduledTime + (mins * 60 * 1000);
           adjustTime(id, newTime);
         }
      }
    };
  });

  // Remove
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const d = await chrome.storage.local.get(['postQueue']);
      const q = (d.postQueue || []).filter(p => p.id !== id);
      await chrome.storage.local.set({ postQueue: q });
      updateQueueUI();
    };
  });
}

async function adjustTime(id, time, isAbsolute = false) {
  const d = await chrome.storage.local.get(['postQueue']);
  const targetTime = time === 0 ? Date.now() : time;
  const q = (d.postQueue || []).map(p => p.id === id ? { ...p, scheduledTime: targetTime, status: 'pending' } : p);
  await chrome.storage.local.set({ postQueue: q });
  updateQueueUI();
  
  // Phát lệnh cho robot chạy ngay lập tức
  chrome.runtime.sendMessage({ action: 'checkQueue', force: true });
}

async function togglePipeline() {
  const data = await chrome.storage.local.get(['isPipelineActive']);
  const newState = !data.isPipelineActive;
  await chrome.storage.local.set({ isPipelineActive: newState });
  updateGlobalStatus(newState);
  
  if (newState) {
    addLog("▶ Tiến trình đã bắt đầu.");
    chrome.runtime.sendMessage({ action: 'checkQueue', force: true });
  } else {
    addLog("⏹ Đã tạm dừng tiến trình.");
  }
}

function updateGlobalStatus(active) {
  const btn = document.getElementById('toggle-pipeline-btn');
  
  if (active) {
    btn.innerHTML = `<span class="btn-icon">⏹</span> DỪNG TIẾN TRÌNH`;
    btn.className = "nagi-btn big-action active";
    addLog("▶ Tiến trình đang hoạt động.");
  } else {
    btn.innerHTML = `<span class="btn-icon">▶</span> BẮT ĐẦU ĐĂNG BÀI`;
    btn.className = "nagi-btn big-action";
    addLog("⏹ Tiến trình đang tạm dừng.");
  }
}

function startCountdownLoop() {
  setInterval(async () => {
    const data = await chrome.storage.local.get(['postQueue', 'isPipelineActive']);
    const queue = data.postQueue || [];
    const active = data.isPipelineActive;
    
    const display = document.getElementById('countdown-display');
    const timer = document.getElementById('countdown-timer');

    if (!active || queue.length === 0) {
      display.classList.add('hidden');
      return;
    }

    const nextPost = queue
      .filter(p => p.status === 'pending' || !p.status)
      .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];

    if (nextPost) {
      display.classList.remove('hidden');
      const diff = nextPost.scheduledTime - Date.now();
      if (diff > 0) {
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        timer.innerText = `${h}:${m}:${s}`;
      } else {
        timer.innerText = "POSTING...";
      }
    } else {
      display.classList.add('hidden');
    }
  }, 1000);
}

function transformPromptToStatus(prompt) {
  if (!prompt) return "Một khoảnh khắc tuyệt vời... ✨";
  const techWords = ["4k", "8k", "cinematic", "highly detailed", "photorealistic", "--v", "raw", "style", "16:9", "render", "grok", "ai"];
  let clean = prompt.toLowerCase();
  techWords.forEach(w => clean = clean.split(w).join(""));
  clean = clean.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const templates = [
    (c) => `Lạc vào vẻ đẹp của "${c}"... 🌌`,
    (c) => `Chút bình yên với "${c}". ✨`,
    (c) => `Góc nhìn thật lạ về "${c}"... 🌟`,
    (c) => `"${c.charAt(0).toUpperCase() + c.slice(1)}" qua một lăng kính mới. ❤️`
  ];
  return templates[Math.floor(Math.random() * templates.length)](clean);
}

async function clearQueue() {
  if (confirm("Bạn có chắc chắn muốn xóa toàn bộ hàng chờ không?")) {
    await chrome.storage.local.set({ postQueue: [] });
    updateQueueUI();
  }
}

function toLocalISO(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function addLog(msg) {
  document.getElementById('status-logs').innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
}

async function openPreview(url) {
  const modal = document.getElementById('preview-modal');
  const loading = document.getElementById('preview-loading');
  const img = document.getElementById('preview-img');
  
  modal.classList.remove('hidden');
  loading.classList.remove('hidden');
  img.classList.add('hidden');
  img.src = "";

  try {
    chrome.runtime.sendMessage({ action: 'request_watermark', url: url }, (response) => {
      if (response && response.success) {
        img.src = response.dataUrl;
        img.classList.remove('hidden');
        loading.classList.add('hidden');
      } else {
        alert("Lỗi xem trước: " + (response?.error || "Không rõ nguyên nhân"));
        modal.classList.add('hidden');
      }
    });
  } catch (e) {
    console.error("Preview Error:", e);
  }
}

// Close Modal Events
document.querySelector('.close-modal').onclick = () => {
  document.getElementById('preview-modal').classList.add('hidden');
};

window.onclick = (e) => {
  const modal = document.getElementById('preview-modal');
  if (e.target === modal) modal.classList.add('hidden');
};

function renderInitialState() {
  chrome.storage.local.get(['postQueue'], (data) => {
    // Luôn hiện phần quét để người dùng sẵn sàng làm việc
    document.getElementById('scanning-section').classList.remove('hidden');
    document.getElementById('scan-btn').classList.remove('hidden');

    if (data.postQueue && data.postQueue.length > 0) {
      document.getElementById('queue-section').classList.remove('hidden');
      updateQueueUI();
    }
  });
}
