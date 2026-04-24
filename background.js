// Grok2FB - background.js v3.0 (Clean & Fast)
chrome.runtime.onInstalled.addListener(() => {
  console.log("Grok2FB Installed - Nagi Tool");
  chrome.alarms.create("checkQueueAlarm", { periodInMinutes: 15 });
});

// --- HÀM XỬ LÝ WATERMARK SIÊU TỐC ---
async function applyWatermark(imageUrl) {
  try {
    const logoUrl = chrome.runtime.getURL('icons/thanhgina.png');
    
    // Tải ảnh (Timeout 5s để không bị treo)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const [mainRes, logoRes] = await Promise.all([
      fetch(imageUrl, { signal: controller.signal }),
      fetch(logoUrl)
    ]);
    clearTimeout(timeoutId);

    const [mainBlob, logoBlob] = await Promise.all([mainRes.blob(), logoRes.blob()]);
    const [mainBitmap, logoBitmap] = await Promise.all([
      createImageBitmap(mainBlob),
      createImageBitmap(logoBlob)
    ]);

    const canvas = new OffscreenCanvas(mainBitmap.width, mainBitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(mainBitmap, 0, 0);

    const logoW = canvas.width * 0.3;
    const logoH = logoBitmap.height * (logoW / logoBitmap.width);
    const padding = canvas.width * 0.03;

    // Vị trí Random nửa dưới
    const x = Math.floor(Math.random() * (canvas.width - logoW - 2 * padding)) + padding;
    const minY = canvas.height / 2;
    const maxY = canvas.height - logoH - padding;
    const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

    ctx.drawImage(logoBitmap, x, y, logoW, logoH);

    const finalBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(finalBlob);
    });
  } catch (e) {
    console.error("Watermark failed, using original:", e);
    return imageUrl; 
  }
}

async function processNextInQueue(force = false) {
  const data = await chrome.storage.local.get(['postQueue', 'isPipelineActive', 'currentProcessingPost', 'lastProcessingTime']);
  const now = Date.now();

  if (!data.isPipelineActive && !force) {
    calculateSmartAlarm(data.postQueue);
    return;
  }

  // Dọn dẹp nếu bị kẹt quá 30s hoặc được yêu cầu force
  if (force || (data.currentProcessingPost && (now - (data.lastProcessingTime || 0) > 30000))) {
    await chrome.storage.local.remove(['currentProcessingPost', 'lastProcessingTime']);
  } else if (data.currentProcessingPost) {
    return; // Đang bận xử lý bài khác
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
        currentProcessingPost: { ...nextPost, mediaData: watermarkedData },
        lastProcessingTime: Date.now()
      });
      chrome.tabs.create({ url: "https://www.facebook.com/", active: true });
    } catch (e) {
      console.error("Pipeline Error:", e);
      const failedQueue = queue.map(p => p.id === nextPost.id ? { ...p, status: 'pending', scheduledTime: Date.now() + 120000 } : p);
      await chrome.storage.local.set({ postQueue: failedQueue });
      await chrome.storage.local.remove(['currentProcessingPost']);
    }
  } else {
    calculateSmartAlarm(queue);
  }
}

async function calculateSmartAlarm(queue) {
  const nextPending = (queue || [])
    .filter(p => !p.status || p.status === 'pending')
    .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];

  if (nextPending) {
    const diffMins = Math.max(1, Math.ceil((nextPending.scheduledTime - Date.now()) / 60000));
    chrome.alarms.create("checkQueueAlarm", { delayInMinutes: Math.min(diffMins, 15) });
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
});
