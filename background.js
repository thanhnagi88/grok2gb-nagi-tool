// Grok2FB - background.js v2.3 (Eco-Friendly)

chrome.runtime.onInstalled.addListener(() => {
  console.log("Grok2FB Installed - Nagi Tool");
  // Set a default alarm to check every 15 mins even if empty
  chrome.alarms.create("checkQueueAlarm", { periodInMinutes: 15 });
});

async function processNextInQueue() {
  const data = await chrome.storage.local.get(['postQueue', 'isPipelineActive', 'currentProcessingPost']);
  if (!data.isPipelineActive || data.currentProcessingPost) {
    calculateSmartAlarm(data.postQueue);
    return;
  }

  const queue = data.postQueue || [];
  const now = Date.now();
  
  const nextPost = queue
    .filter(p => (!p.status || p.status === 'pending') && p.scheduledTime <= now)
    .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];

  if (nextPost) {
    const updatedQueue = queue.map(p => p.id === nextPost.id ? { ...p, status: 'processing' } : p);
    chrome.storage.local.set({ postQueue: updatedQueue }, async () => {
      try {
        const resp = await fetch(nextPost.url);
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          chrome.storage.local.set({ 
            currentProcessingPost: { ...nextPost, mediaData: reader.result } 
          }, () => {
            chrome.tabs.create({ url: "https://www.facebook.com/", active: true });
          });
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error("Background Fetch Error:", e);
      }
    });
  } else {
    // No post due, sleep smartly
    calculateSmartAlarm(queue);
  }
}

// SMART SLEEP LOGIC: Set alarm for the next due post
async function calculateSmartAlarm(queue) {
  const now = Date.now();
  const nextPending = (queue || [])
    .filter(p => !p.status || p.status === 'pending')
    .sort((a, b) => a.scheduledTime - b.scheduledTime)[0];

  if (nextPending) {
    const diffMs = nextPending.scheduledTime - now;
    const diffMins = Math.max(1, Math.ceil(diffMs / 60000));
    // Set alarm for the exact time needed (max 15 mins for safety)
    const sleepMins = Math.min(diffMins, 15);
    chrome.alarms.create("checkQueueAlarm", { delayInMinutes: sleepMins });
    console.log(`[SmartSleep] Next post in ${diffMins}m. Waking up in ${sleepMins}m.`);
  } else {
    // No posts, check every 15 mins anyway
    chrome.alarms.create("checkQueueAlarm", { delayInMinutes: 15 });
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'checkQueue') processNextInQueue();
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkQueueAlarm') processNextInQueue();
});
