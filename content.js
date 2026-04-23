// Grok Scanner for Grok2FB - Reliable v1.4
function extractMediaWithCaptions() {
  const results = [];
  const seenUrls = new Set();

  // Simple and fast scan for images and videos
  const elements = document.querySelectorAll('img, video');
  
  elements.forEach(el => {
    let src = el.tagName === 'VIDEO' ? (el.src || el.currentSrc) : el.src;
    
    // Fallback to data attributes if src is empty (Lazy load support)
    if (!src) src = el.getAttribute('data-src') || el.getAttribute('data-full-src');
    
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return;
    
    const u = src.toLowerCase();
    // Broadest possible filter to catch Grok assets
    const isAi = u.includes('grok.com') || 
                 u.includes('x.ai') || 
                 u.includes('generated') ||
                 u.includes('content?cache=');
    
    if (!isAi) return;

    // Deduplicate using the raw URL to ensure 100% uniqueness
    if (seenUrls.has(src)) return;
    seenUrls.add(src);

    // 3. High-Quality Caption Discovery
    let caption = "";
    
    // Check Alt text (often contains the prompt in Grok's new UI)
    if (el.alt && el.alt.length > 5 && !el.alt.toLowerCase().includes('generated image')) {
      caption = el.alt;
    } 
    
    // Heuristic: Search nearby elements/containers for the prompt
    if (!caption) {
      const container = el.closest('article') || el.closest('[role="listitem"]') || el.closest('div[id*="message" i]');
      if (container) {
        // Find text nodes or paragraphs that are likely the prompt
        const textElements = container.querySelectorAll('p, span[dir="auto"]');
        for (const te of textElements) {
          const t = te.innerText.trim();
          if (t && t.length > 10 && t.length < 500) {
            caption = t;
            break;
          }
        }
      }
    }

    if (!caption) caption = "Một khoảnh khắc tuyệt vời... ✨"; 

    results.push({
      url: src,
      previewUrl: src,
      caption: caption,
      type: (el.tagName === 'VIDEO' || u.includes('.mp4')) ? 'video' : 'image',
      timestamp: Date.now()
    });
  });

  return results;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_media") {
    try {
      const data = extractMediaWithCaptions();
      sendResponse({ media: data });
    } catch (e) {
      console.error("Grok2FB Scan Error:", e);
      sendResponse({ media: [] });
    }
  }
  return true;
});
