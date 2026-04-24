// === CẤU HÌNH LOGO (Bạn có thể thay đổi ở đây) ===
const LOGO_SIZE_RATIO = 0.3;     // Kích thước logo (0.3 = 30% chiều rộng ảnh gốc)
const LOGO_OPACITY = 1.0;        // Độ đậm nhạt (1.0 = rõ nét hoàn toàn, 0.5 = mờ 50%)
const LOGO_PADDING_RATIO = 0.03; // Khoảng cách từ lề (0.03 = 3% ảnh gốc)
// ===========================================

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
        
        // 2. Tính toán kích thước Logo
        const logoScale = (canvas.width * LOGO_SIZE_RATIO) / logoImg.width;
        const logoW = logoImg.width * logoScale;
        const logoH = logoImg.height * logoScale;
        
        // 3. Vị trí: RANDOM trong nửa dưới của hình
        const padding = canvas.width * LOGO_PADDING_RATIO;
        
        // Ngẫu nhiên trục X (từ trái sang phải)
        const minX = padding;
        const maxX = canvas.width - logoW - padding;
        const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
        
        // Ngẫu nhiên trục Y (chỉ trong nửa dưới của hình)
        const minY = canvas.height / 2;
        const maxY = canvas.height - logoH - padding;
        const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        
        // Vẽ Logo
        ctx.globalAlpha = LOGO_OPACITY; 
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
