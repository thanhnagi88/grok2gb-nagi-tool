// Grok2FB - background.js v2.5 (Stable Recovery)

chrome.runtime.onInstalled.addListener(() => {
  console.log("Grok2FB Installed - Nagi Tool");
  chrome.alarms.create("checkQueueAlarm", { periodInMinutes: 15 });
});

// --- HÀM XỬ LÝ WATERMARK TRỰC TIẾP (OFFSCREEN CANVAS) ---
async function applyWatermark(imageUrl) {
  try {
    const logoUrl = chrome.runtime.getURL('icons/thanhgina.png');
    
    // Tải ảnh gốc và logo
    const [mainRes, logoRes] = await Promise.all([fetch(imageUrl), fetch(logoUrl)]);
    const [mainBlob, logoBlob] = await Promise.all([mainRes.blob(), logoRes.blob()]);
    
    // Chuyển sang Bitmap để vẽ lên Canvas
    const [mainBitmap, logoBitmap] = await Promise.all([
      createImageBitmap(mainBlob),
      createImageBitmap(logoBlob)
    ]);

    const canvas = new OffscreenCanvas(mainBitmap.width, mainBitmap.height);
    const ctx = canvas.getContext('2d');

    // 1. Vẽ hình gốc
    ctx.drawImage(mainBitmap, 0, 0);

    // 2. Cấu hình Logo (30% chiều rộng, opacity 100%)
    const logoW = canvas.width * 0.3;
    const logoH = logoBitmap.height * (logoW / logoBitmap.width);
    const padding = canvas.width * 0.03;

    // 3. Vị trí RANDOM ở nửa dưới
    const x = Math.floor(Math.random() * (canvas.width - logoW - 2 * padding)) + padding;
    const minY = canvas.height / 2;
    const maxY = canvas.height - logoH - padding;
    const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

    ctx.drawImage(logoBitmap, x, y, logoW, logoH);

    // 4. Xuất kết quả DataURL
    const finalBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(finalBlob);
    });
  } catch (e) {
    console.error("Watermark processing failed:", e);
    return imageUrl; // Trả về ảnh gốc nếu lỗi
  }
}

async function processNextInQueue(force = false) {
  const data = await chrome.storage.local.get(['postQueue', 'isPipelineActive', 'currentProcessingPost', 'lastProcessingTime']);
  const now = Date.now();

  if (!data.isPipelineActive) {
    calculateSmartAlarm(data.postQueue);
    return;
  }

  if (force || (data.currentProcessingPost && (now - (data.lastProcessingTime || 0) > 60000))) {
    console.log("[Background] Làm mới trạng thái đăng bài...");
    await chrome.storage.local.remove(['currentProcessingPost', 'lastProcessingTime']);
  } else if (data.currentProcessingPost) {
    return;
  }

  const queue = data.postQueue || [];
  const nextPost = queue
    .filter(p => (!p.status || p.status === 'pending') && p.scheduledTime <= now)
    .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];

  if (nextPost) {
    const updatedQueue = queue.map(p => p.id === nextPost.id ? { ...p, status: 'processing' } : p);
    await chrome.storage.local.set({ postQueue: updatedQueue, lastProcessingTime: now });

    try {
      const watermarkedData = await applyWatermark(nextPost.url);
      await chrome.storage.local.set({ 
        currentProcessingPost: { ...nextPost, mediaData: watermarkedData } 
      });
      chrome.tabs.create({ url: "https://www.facebook.com/", active: true });
    } catch (e) {
      console.error("Background Fast Processing Error:", e);
      const failedQueue = updatedQueue.map(p => p.id === nextPost.id ? { ...p, status: 'pending', scheduledTime: now + 300000 } : p);
      await chrome.storage.local.set({ postQueue: failedQueue });
      await chrome.storage.local.remove(['currentProcessingPost', 'lastProcessingTime']);
    }
  } else {
    calculateSmartAlarm(queue);
  }
}

async function calculateSmartAlarm(queue) {
  const now = Date.now();
  const nextPending = (queue || [])
    .filter(p => !p.status || p.status === 'pending')
    .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];

  if (nextPending) {
    const diffMs = nextPending.scheduledTime - now;
    const diffMins = Math.max(1, Math.ceil(diffMs / 60000));
    const sleepMins = Math.min(diffMins, 15);
    chrome.alarms.create("checkQueueAlarm", { delayInMinutes: sleepMins });
  } else {
    chrome.alarms.create("checkQueueAlarm", { delayInMinutes: 15 });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkQueue') {
    processNextInQueue(message.force || false);
  } else if (message.action === 'request_watermark') {
    applyWatermark(message.url).then(dataUrl => {
      sendResponse({ success: true, dataUrl: dataUrl });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; 
  }
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkQueueAlarm') processNextInQueue();
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [fullUrl]
    });
    if (existingContexts.length > 0) return;
  } else {
    // Fallback cho Chrome cũ: Thử kiểm tra qua storage hoặc bỏ qua để tránh lỗi treo
    const data = await chrome.storage.local.get(['has_offscreen']);
    if (data.has_offscreen) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['DOM_PARSER'], 
      justification: 'Xử lý đóng dấu logo lên hình ảnh trước khi đăng'
    });
    await chrome.storage.local.set({ has_offscreen: true });
  } catch (e) {
    console.error("Offscreen creation failed:", e);
  }
}
