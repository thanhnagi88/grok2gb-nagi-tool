// Grok2FB - background.js v4.0 (Ultra Stable)
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("checkQueueAlarm", { periodInMinutes: 15 });
});

async function applyWatermark(imageSource) {
  try {
    const logoUrl = chrome.runtime.getURL('icons/thanhgina.png');
    const [mainRes, logoRes] = await Promise.all([fetch(imageSource), fetch(logoUrl)]);
    const [mainBlob, logoBlob] = await Promise.all([mainRes.blob(), logoRes.blob()]);
    const [mainBitmap, logoBitmap] = await Promise.all([createImageBitmap(mainBlob), createImageBitmap(logoBlob)]);

    const canvas = new OffscreenCanvas(mainBitmap.width, mainBitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(mainBitmap, 0, 0);
    const logoW = canvas.width * 0.3;
    const logoH = logoBitmap.height * (logoW / logoBitmap.width);
    const padding = canvas.width * 0.03;
    const x = Math.floor(Math.random() * (canvas.width - logoW - 2 * padding)) + padding;
    const y = Math.floor(Math.random() * (canvas.height/2 - logoH - padding)) + canvas.height/2;
    ctx.drawImage(logoBitmap, x, y, logoW, logoH);

    const finalBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(finalBlob); });
  } catch (e) {
    return imageSource; 
  }
}

// Hàm tải dữ liệu thông minh
async function getSmartData(url) {
  // Thử tải trực tiếp trước
  try {
    const resp = await fetch(url, { referrer: "https://grok.com/" });
    if (resp.ok) {
      const blob = await resp.blob();
      return new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result); rd.readAsDataURL(blob); });
    }
  } catch (e) {}

  // Nếu trực tiếp thất bại, thử nhờ Tab Grok
  try {
    const tabs = await chrome.tabs.query({ url: ["*://grok.com/*", "*://x.ai/*"] });
    if (tabs.length > 0) {
      return new Promise((resolve, reject) => {
        const tout = setTimeout(() => reject("Quá thời gian (1p)"), 60000);
        chrome.tabs.sendMessage(tabs[0].id, { action: "fetch_blob", url: url }, (resp) => {
          clearTimeout(tout);
          if (resp && resp.success) resolve(resp.dataUrl);
          else reject("Tab không phản hồi");
        });
      });
    }
  } catch (e) {}

  return url; // Phương án cuối: trả về URL gốc
}

async function processNextInQueue(force = false) {
  const data = await chrome.storage.local.get(['postQueue', 'isPipelineActive', 'currentProcessingPost', 'lastProcessingTime']);
  const now = Date.now();

  if (!data.isPipelineActive && !force) return;

  if (force || (data.currentProcessingPost && (now - (data.lastProcessingTime || 0) > 30000))) {
    await chrome.storage.local.remove(['currentProcessingPost']);
  } else if (data.currentProcessingPost) return;

  const queue = data.postQueue || [];
  const nextPost = queue
    .filter(p => (!p.status || p.status === 'pending') && p.scheduledTime <= now)
    .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];

  if (nextPost) {
    const updatedQueue = queue.map(p => p.id === nextPost.id ? { ...p, status: 'processing' } : p);
    await chrome.storage.local.set({ postQueue: updatedQueue, lastProcessingTime: Date.now() });

    try {
      const rawData = await getSmartData(nextPost.url);
      const finalData = (nextPost.type === 'image' && rawData.startsWith('data:')) ? await applyWatermark(rawData) : rawData;

      await chrome.storage.local.set({ 
        currentProcessingPost: { ...nextPost, mediaData: finalData },
        lastProcessingTime: Date.now()
      });
      chrome.tabs.create({ url: "https://www.facebook.com/", active: true });
    } catch (e) {
      console.error("Critical Processing Error:", e);
      // Gạt lỗi, không đẩy lùi thời gian để người dùng thử lại ngay
      const resetQueue = queue.map(p => p.id === nextPost.id ? { ...p, status: 'pending' } : p);
      await chrome.storage.local.set({ postQueue: resetQueue });
      await chrome.storage.local.remove(['currentProcessingPost']);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkQueue') processNextInQueue(message.force || false);
  else if (message.action === 'request_watermark') {
    getSmartData(message.url).then(d => applyWatermark(d)).then(dataUrl => sendResponse({ success: true, dataUrl: dataUrl }));
    return true; 
  }
  return true;
});

chrome.alarms.onAlarm.addListener(() => processNextInQueue());
