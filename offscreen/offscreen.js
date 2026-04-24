// Grok2FB - Offscreen Processor v1.0
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.target !== 'offscreen') return;

  if (request.action === 'watermark') {
    try {
      const result = await processImage(request.imageUrl, request.logoUrl);
      sendResponse({ success: true, dataUrl: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});

async function processImage(imageUrl, logoUrl) {
  return new Promise((resolve, reject) => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    const mainImg = new Image();
    const logoImg = new Image();
    
    let loadedCount = 0;
    const onAllLoaded = () => {
      loadedCount++;
      if (loadedCount === 2) {
        // Cấu hình Canvas theo kích thước hình gốc
        canvas.width = mainImg.width;
        canvas.height = mainImg.height;
        
        // 1. Vẽ hình gốc
        ctx.drawImage(mainImg, 0, 0);
        
        // 2. Tính toán kích thước Logo (giữ tỷ lệ, rộng khoảng 15% hình gốc)
        const logoScale = (canvas.width * 0.15) / logoImg.width;
        const logoW = logoImg.width * logoScale;
        const logoH = logoImg.height * logoScale;
        
        // 3. Vị trí: Góc dưới bên phải, cách lề 2%
        const padding = canvas.width * 0.02;
        const x = canvas.width - logoW - padding;
        const y = canvas.height - logoH - padding;
        
        // Vẽ Logo
        ctx.globalAlpha = 0.8; // Hơi trong suốt một chút cho chuyên nghiệp
        ctx.drawImage(logoImg, x, y, logoW, logoH);
        ctx.globalAlpha = 1.0;
        
        resolve(canvas.toDataURL('image/png'));
      }
    };

    mainImg.onload = onAllLoaded;
    logoImg.onload = onAllLoaded;
    mainImg.onerror = () => reject(new Error('Failed to load main image'));
    logoImg.onerror = () => reject(new Error('Failed to load logo'));

    mainImg.src = imageUrl;
    logoImg.src = logoUrl;
  });
}
