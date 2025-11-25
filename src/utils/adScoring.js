/**
 * Ad Scoring Utilities
 * Các công thức tính điểm cho quảng cáo trong hệ thống đấu giá
 *
 * pCTR được cố định là 0.1 (10%) cho hệ thống mới phát triển
 * Các yếu tố khác sẽ được tính toán dựa trên dữ liệu thực tế
 */

const PCTR_FIXED = 0.1; // 10% - cố định cho hệ thống mới
const MIN_SCORE_THRESHOLD = 0.5; // Ngưỡng tối thiểu để hiển thị ad

/**
 * Tính điểm cơ bản dựa trên bid amount và pricing model
 */
function calculateBaseScore(bidAmount, pricingModel = 'CPM') {
  if (!bidAmount || bidAmount <= 0) return 0;

  // Chuyển đổi về CPM nếu là CPC
  let cpmValue = bidAmount;
  if (pricingModel === 'CPC') {
    // Giả sử CTR trung bình 2% để chuyển từ CPC sang CPM
    cpmValue = (bidAmount / 0.02) * 1000;
  }

  return parseFloat(cpmValue);
}

/**
 * Tính hệ số thời gian (time decay)
 * Ads mới được ưu tiên hơn ads cũ
 */
function calculateTimeMultiplier(activatedAt) {
  if (!activatedAt) return 1.0;

  const now = new Date();
  const activatedDate = new Date(activatedAt);
  const hoursSinceActivation = (now - activatedDate) / (1000 * 60 * 60);

  // Giảm dần 10% mỗi 24 giờ
  const decay = Math.max(0.1, 1.0 - (hoursSinceActivation * 0.1 / 24));

  return parseFloat(decay.toFixed(3));
}

/**
 * Tính hệ số impressions còn lại
 * Ưu tiên ads còn nhiều impressions để tiêu thụ hết budget
 */
function calculateImpressionMultiplier(remainingImpressions, totalImpressions = 1000) {
  if (!remainingImpressions || remainingImpressions <= 0) return 0.1; // Penalty cho ads hết impressions

  // Ưu tiên ads còn > 50% impressions
  const ratio = remainingImpressions / totalImpressions;
  let multiplier = 1.0;

  if (ratio > 0.8) multiplier = 1.2;      // Còn > 80% - bonus
  else if (ratio > 0.5) multiplier = 1.0;  // Còn 50-80% - normal
  else if (ratio > 0.2) multiplier = 0.8;  // Còn 20-50% - penalty nhẹ
  else multiplier = 0.6;                   // Còn < 20% - penalty mạnh

  return parseFloat(multiplier.toFixed(3));
}

/**
 * Tính hệ số CTR (sử dụng pCTR cố định 0.1)
 * Trong tương lai có thể tính dựa trên dữ liệu thực tế
 */
function calculateCTRMultiplier(actualCTR = null) {
  // Sử dụng CTR thực tế nếu có, nếu không dùng pCTR cố định
  const ctr = actualCTR || PCTR_FIXED;

  // Bonus cho CTR cao
  let multiplier = 1.0;
  if (ctr > 0.05) multiplier = 1.3;      // CTR > 5% - bonus mạnh
  else if (ctr > 0.03) multiplier = 1.1;  // CTR > 3% - bonus nhẹ
  else if (ctr > 0.01) multiplier = 1.0;  // CTR > 1% - normal
  else multiplier = 0.8;                  // CTR < 1% - penalty

  return parseFloat(multiplier.toFixed(3));
}

/**
 * Tính hệ số budget
 * Đảm bảo ads không chi tiêu quá nhanh hoặc quá chậm
 */
function calculateBudgetMultiplier(totalSpent, totalBudget) {
  if (!totalSpent || totalSpent <= 0) return 1.0; // Ads mới chưa chi
  if (!totalBudget || totalBudget <= 0) return 1.0;

  const spentRatio = totalSpent / totalBudget;

  // Ưu tiên ads đã chi tiêu hợp lý (30-70% budget)
  let multiplier = 1.0;
  if (spentRatio < 0.1) multiplier = 0.9;     // Chi quá ít - penalty
  else if (spentRatio <= 0.7) multiplier = 1.2; // Chi hợp lý - bonus
  else if (spentRatio <= 0.9) multiplier = 1.0; // Chi khá nhiều - normal
  else multiplier = 0.7;                      // Chi gần hết - penalty

  return parseFloat(multiplier.toFixed(3));
}

/**
 * Tính điểm cuối cùng cho một quảng cáo
 */
function calculateAdScore(ad, context = {}) {
  try {
    // Lấy dữ liệu từ ad object
    const bidAmount = parseFloat(ad.BidAmount || 0);
    const pricingModel = ad.PricingModel || 'CPM';
    const activatedAt = ad.ActivatedAt || ad.CreatedAt;
    const remainingImpressions = parseInt(ad.RemainingImpressions || 0);
    const totalImpressions = parseInt(ad.TotalImpressions || 0);
    const actualCTR = ad.CTR ? parseFloat(ad.CTR) : null;
    const totalSpent = parseFloat(ad.TotalSpent || 0);

    // Tính các hệ số
    const baseScore = calculateBaseScore(bidAmount, pricingModel);
    const timeMultiplier = calculateTimeMultiplier(activatedAt);
    const impressionMultiplier = calculateImpressionMultiplier(remainingImpressions, totalImpressions);
    const ctrMultiplier = calculateCTRMultiplier(actualCTR);

    // Tính budget multiplier (dựa trên package price)
    // Giả sử total budget = package price (có thể điều chỉnh)
    const totalBudget = parseFloat(ad.PackagePrice || bidAmount * 10);
    const budgetMultiplier = calculateBudgetMultiplier(totalSpent, totalBudget);

    // Công thức tổng: Score = BaseScore × Time × Impressions × CTR × Budget
    const finalScore = baseScore * timeMultiplier * impressionMultiplier * ctrMultiplier * budgetMultiplier;

    // Debug log (có thể tắt trong production)
    console.log(`[AdScoring] Ad ${ad.UserAdId}: Score=${finalScore.toFixed(2)} (Base:${baseScore}, Time:${timeMultiplier}, Imp:${impressionMultiplier}, CTR:${ctrMultiplier}, Budget:${budgetMultiplier})`);

    return parseFloat(finalScore.toFixed(4));

  } catch (error) {
    console.error(`[AdScoring] Error calculating score for ad ${ad.UserAdId}:`, error);
    return 0;
  }
}

/**
 * Kiểm tra xem ad có đủ điều kiện tham gia đấu giá không
 */
function isAdEligibleForAuction(ad) {
  // Điều kiện cơ bản
  if (!ad || ad.Status !== 'active') return false;
  if ((ad.RemainingImpressions || 0) <= 0) return false;
  if (!ad.BidAmount || parseFloat(ad.BidAmount) <= 0) return false;

  return true;
}

/**
 * Lọc và sắp xếp ads theo score
 */
function rankAdsByScore(ads, context = {}) {
  return ads
    .filter(ad => isAdEligibleForAuction(ad))
    .map(ad => ({
      ad,
      score: calculateAdScore(ad, context)
    }))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  PCTR_FIXED,
  MIN_SCORE_THRESHOLD,
  calculateBaseScore,
  calculateTimeMultiplier,
  calculateImpressionMultiplier,
  calculateCTRMultiplier,
  calculateBudgetMultiplier,
  calculateAdScore,
  isAdEligibleForAuction,
  rankAdsByScore
};

