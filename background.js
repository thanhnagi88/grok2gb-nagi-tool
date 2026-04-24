// Grok2FB - background.js v2.5 (Stable Recovery)

chrome.runtime.onInstalled.addListener(() => {
  console.log("Grok2FB Installed - Nagi Tool");
  chrome.alarms.create("checkQueueAlarm", { periodInMinutes: 15 });
});

async function processNextInQueue(force = false) {
  const data = await chrome.storage.local.get(['postQueue', 'isPipelineActive', 'currentProcessingPost', 'lastProcessingTime']);
  const now = Date.now();

  if (!data.isPipelineActive) {
    calculateSmartAlarm(data.postQueue);
    return;
  }

  // Nếu người dùng chủ động nhấn nút hoặc kẹt lâu (>1 phút), hãy dọn dẹp bài cũ
  if (force || (data.currentProcessingPost && (now - (data.lastProcessingTime || 0) > 60000))) {
    console.log("[Background] Làm mới trạng thái đăng bài...");
    await chrome.storage.local.remove(['currentProcessingPost', 'lastProcessingTime']);
  } else if (data.currentProcessingPost) {
    return; // Đang xử lý bận, không làm gì thêm
  }

  const queue = data.postQueue || [];
  const nextPost = queue
    .filter(p => (!p.status || p.status === 'pending') && p.scheduledTime <= now)
    .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];

  if (nextPost) {
    console.log("[Background] Đang khởi động đăng bài:", nextPost.caption);
    const updatedQueue = queue.map(p => p.id === nextPost.id ? { ...p, status: 'processing' } : p);
    
    await chrome.storage.local.set({ 
      postQueue: updatedQueue,
      lastProcessingTime: now 
    });

    try {
      const resp = await fetch(nextPost.url);
      if (!resp.ok) throw new Error("Image fetch failed");
      
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          // BƯỚC ĐÓNG DẤU LOGO
          await setupOffscreenDocument();
          const logoUrl = chrome.runtime.getURL('icons/thanhgina.png');
          
          const response = await chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'watermark',
            imageUrl: reader.result,
            logoUrl: logoUrl
          });

          const finalDataUrl = response.success ? response.dataUrl : reader.result;
          if (!response.success) console.warn("Lỗi đóng dấu, sử dụng hình gốc:", response.error);

          await chrome.storage.local.set({ 
            currentProcessingPost: { ...nextPost, mediaData: finalDataUrl } 
          });
          
          chrome.tabs.create({ url: "https://www.facebook.com/", active: true });
        } catch (err) {
          console.error("Watermark Error:", err);
          // Fallback nếu có lỗi
          await chrome.storage.local.set({ 
            currentProcessingPost: { ...nextPost, mediaData: reader.result } 
          });
          chrome.tabs.create({ url: "https://www.facebook.com/", active: true });
        }
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error("Background Fetch Error:", e);
      // Trả bài về trạng thái chờ và đẩy lùi thời gian để tránh lặp lại lỗi ngay lập tức
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

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'checkQueue') processNextInQueue(message.force || false);
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkQueueAlarm') processNextInQueue();
});

// Quản lý Offscreen Document cho xử lý Canvas
async function setupOffscreenDocument() {
  const OFFSCREEN_PATH = 'offscreen/offscreen.html';
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['DOM_PARSER'], 
    justification: 'Xử lý đóng dấu logo lên hình ảnh trước khi đăng'
  });
}
