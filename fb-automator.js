// Facebook Automator for Grok2FB - v2.1 Target Hunter
async function startAutomatedPost() {
  const data = await chrome.storage.local.get(['currentProcessingPost']);
  const post = data.currentProcessingPost;
  if (!post || !post.mediaData) return;

  showStatusOverlay("🚀 v2.1: Đang chuẩn bị mục tiêu...");

  try {
    // 1. Data Prep
    const res = await fetch(post.mediaData);
    const blob = await res.blob();
    const file = new File([blob], "grok_post.png", { type: blob.type });

    // 2. File Input
    showStatusOverlay("🖼️ Đang tìm cổng nạp ảnh...");
    let fileInput = document.querySelector('input[type="file"][accept*="image"]');
    if (!fileInput) {
      const trigger = await findSmartElement(["mind", "nghĩ", "Photo", "Ảnh"]);
      if (trigger) { trigger.click(); fileInput = await waitForElement('div[role="dialog"] input[type="file"]'); }
    }
    if (!fileInput) throw new Error("ERR_V2.1: Không thấy cổng nạp.");

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // 3. Caption
    showStatusOverlay("📝 Đang dán bài viết...");
    const textbox = await waitForElement('div[role="textbox"]');
    if (textbox) {
      textbox.focus();
      document.execCommand('insertText', false, post.caption);
    }

    // 4. Sequential Post Engine
    showStatusOverlay("⏳ Đang chuẩn bị chuỗi lệnh cuối...");
    
    setTimeout(async () => {
      // STEP A: Click "Next"
      const nextBtn = await findSmartElement(["Next", "Tiếp tục", "Tiếp"]);
      if (nextBtn) {
        showStatusOverlay("➡️ Bấm nút [Tiếp theo]...");
        clickElement(nextBtn);
        await new Promise(r => setTimeout(r, 4500)); // Wait longer for transition
      }

      // STEP B: Click "Post" or "Share"
      showStatusOverlay("🔍 Đang săn tìm nút [Đăng/Post]...");
      // Increase retries for the final button
      const postBtn = await findSmartElement(["Post", "Đăng", "Share", "Chia sẻ"], 10); 
      
      if (postBtn) {
        showStatusOverlay("🚀 ĐANG ĐĂNG BÀI TOÀN TẬP!");
        clickElement(postBtn);
        finalizePost(post.id);
      } else {
        showStatusOverlay("⚠️ Hãy giúp robot bấm [Đăng] bước CUỐI này.", true);
      }
    }, 10000);

  } catch (err) {
    showStatusOverlay(`❌ Lỗi v2.1: ${err.message}`, true);
  }
}

// Global Element Finder - Better Visibility Check
async function findSmartElement(keywords, retries = 5) {
  if (!Array.isArray(keywords)) keywords = [keywords];
  
  for (let i = 0; i < retries; i++) {
    const targets = document.querySelectorAll('div[role="button"], div[aria-label], span, button');
    for (const el of targets) {
      // Use Aria-Label high priority
      const label = el.getAttribute('aria-label');
      const text = el.innerText?.trim();
      
      const isMatch = (label && keywords.some(k => label.toLowerCase() === k.toLowerCase())) ||
                      (text && keywords.some(k => text.toLowerCase() === k.toLowerCase()) && el.children.length < 4);

      if (isMatch && isVisible(el)) return el;
    }
    await new Promise(r => setTimeout(r, 800));
  }
  return null;
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 5 && rect.height > 5 && window.getComputedStyle(el).display !== 'none';
}

function clickElement(el) {
  el.focus();
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.click();
}

function showStatusOverlay(msg, isError = false) {
  let overlay = document.getElementById('grok2fb-status');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'grok2fb-status';
    overlay.style = "position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:9999; padding:15px 30px; border-radius:40px; background:#00ba7c; color:white; font-weight:bold; box-shadow:0 10px 40px rgba(0,0,0,0.6); font-family:system-ui; font-size:16px; border:2px solid white;";
    document.body.appendChild(overlay);
  }
  overlay.innerText = msg;
  overlay.style.background = isError ? "#f4212e" : "#00ba7c";
}

async function finalizePost(postId) {
  const data = await chrome.storage.local.get(['postQueue']);
  const queue = data.postQueue || [];
  const updatedQueue = queue.map(p => p.id === postId ? { ...p, status: 'posted' } : p);
  await chrome.storage.local.set({ postQueue: updatedQueue, currentProcessingPost: null });
  showStatusOverlay("🏁 ĐÃ XONG! Tab sẽ tự đóng sau 9 giây.");
  setTimeout(() => window.close(), 9000);
}

function waitForElement(selector, timeout = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(interval); resolve(el); }
      else if (Date.now() - start > timeout) { clearInterval(interval); resolve(null); }
    }, 800);
  });
}

if (window.location.hostname.includes('facebook.com')) {
  setTimeout(startAutomatedPost, 2500);
}
