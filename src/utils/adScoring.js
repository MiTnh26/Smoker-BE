/**
 * Ad Scoring Utilities - MVP Version
 * Các công thức tính điểm cho quảng cáo trong hệ thống đấu giá
 *
 * Giai đoạn MVP:
 * - pCTR cố định = 0.001 (0.1%) theo tài liệu
 * - Không có ML model, không có targeting
 * - Quality Score = 1.0 (tất cả ads bằng nhau)
 * - Ad Rank = eCPM × Quality Score
 */

// ✅ PHẦN 1: pCTR cố định = 0.001 (0.1%) theo tài liệu MVP
const PCTR_FIXED = 0.001; // 0.1% - đúng theo tài liệu MVP
const MIN_SCORE_THRESHOLD = 0.01; // Ngưỡng tối thiểu để hiển thị ad

/**
 * ✅ PHẦN 2: Tính eCPM (Effective Cost Per Mille) - MVP Version
 * Theo tài liệu:
 * - CPM: eCPM = BidAmount_CPM
 * - CPC: eCPM = BidAmount_CPC × pCTR × 1000
 */
function calculateECPM(bidAmount, pricingModel = 'CPM') {
  if (!bidAmount || bidAmount <= 0) return 0;

  if (pricingModel === 'CPM') {
    // CPM: eCPM = BidAmount_CPM
    return parseFloat(bidAmount);
  } else if (pricingModel === 'CPC') {
    // CPC: eCPM = BidAmount_CPC × pCTR × 1000
    // Với pCTR = 0.001 (0.1%)
    return parseFloat(bidAmount) * PCTR_FIXED * 1000;
  }

  return 0;
}


/**
 * ✅ PHẦN 3: Tính Quality Score - MVP Version
 * Theo tài liệu: Quality Score = f(pCTR, Ad Relevance, Landing Page Experience)
 * Trong MVP: Quality Score = 1.0 (tất cả ads bằng nhau)
 * Trong tương lai: Quality Score = normalize(pCTR)
 */
function calculateQualityScore(ad, context = {}) {
  // MVP: Quality Score = 1.0 cho tất cả ads
  // Trong tương lai: Quality Score = normalize(pCTR, Ad Relevance, Landing Page Experience)
  return 1.0;
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
 * ✅ PHẦN 4: Tính Ad Rank - MVP Version
 * Theo tài liệu: Ad Rank = eCPM × Quality Score
 */
function calculateAdRank(ad, context = {}) {
  try {
    const bidAmount = parseFloat(ad.BidAmount || 0);
    const pricingModel = ad.PricingModel || 'CPM';

    // 1. Tính eCPM (theo công thức đúng)
    const eCPM = calculateECPM(bidAmount, pricingModel);

    // 2. Tính Quality Score (MVP: = 1.0)
    const qualityScore = calculateQualityScore(ad, context);

    // 3. Tính Ad Rank = eCPM × Quality Score
    const adRank = eCPM * qualityScore;

    // Debug log
    console.log(`[AdRank] Ad ${ad.UserAdId}: eCPM=${eCPM.toFixed(2)}, QS=${qualityScore}, AdRank=${adRank.toFixed(2)}`);

    return parseFloat(adRank.toFixed(4));

  } catch (error) {
    console.error(`[AdRank] Error calculating Ad Rank for ad ${ad.UserAdId}:`, error);
    return 0;
  }
}

/**
 * Tính điểm cuối cùng cho một quảng cáo - MVP Version
 * Sử dụng công thức: Ad Rank = eCPM × Quality Score
 * (Có thể thêm Budget Pacing nếu muốn)
 */
function calculateAdScore(ad, context = {}) {
  try {
    // ✅ PHẦN 4: Tính Ad Rank (theo tài liệu)
    const adRank = calculateAdRank(ad, context);

    // Tùy chọn: Áp dụng Budget Pacing (có thể bỏ qua trong MVP)
    const totalSpent = parseFloat(ad.TotalSpent || 0);
    const totalBudget = parseFloat(ad.PackagePrice || 0);
    const budgetMultiplier = calculateBudgetMultiplier(totalSpent, totalBudget);

    // Final Score = Ad Rank × Budget Multiplier (nếu muốn)
    // Hoặc chỉ dùng Ad Rank: const finalScore = adRank;
    const finalScore = adRank * budgetMultiplier;

    // Debug log
    console.log(`[AdScoring] Ad ${ad.UserAdId}: AdRank=${adRank.toFixed(2)}, BudgetMult=${budgetMultiplier}, FinalScore=${finalScore.toFixed(2)}`);

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
  // ✅ Các hàm chính theo tài liệu MVP
  calculateECPM,
  calculateQualityScore,
  calculateAdRank,
  // Các hàm hỗ trợ
  calculateBudgetMultiplier,
  calculateAdScore,
  isAdEligibleForAuction,
  rankAdsByScore
};

