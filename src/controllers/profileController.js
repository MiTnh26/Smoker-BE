const profileService = require('../services/profileService');

class ProfileController {
  async getProfile(req, res) {
    const startTime = Date.now();
    try {
      const { entityId } = req.params;
      const currentEntityId = req.user?.entityAccountId; // Giả sử thông tin user được lưu trong req.user

      console.log('[ProfileController] ===== GET PROFILE REQUEST =====');
      console.log('[ProfileController] Request params:', { entityId });
      console.log('[ProfileController] Current user:', { 
        userId: req.user?.id,
        entityAccountId: currentEntityId,
        email: req.user?.email,
        role: req.user?.role
      });
      console.log('[ProfileController] Request headers:', {
        authorization: req.headers.authorization ? 'Bearer ***' : 'Missing',
        'content-type': req.headers['content-type']
      });

      if (!entityId) {
        console.log('[ProfileController] ERROR: Entity ID is missing');
        return res.status(400).json({ success: false, message: 'Entity ID is required.' });
      }

      console.log('[ProfileController] Calling profileService.getProfileData...');
      const profileData = await profileService.getProfileData({ entityId, currentEntityId });
      console.log('[ProfileController] Profile data retrieved successfully');
      console.log('[ProfileController] Profile data keys:', Object.keys(profileData || {}));
      console.log('[ProfileController] Response time:', Date.now() - startTime, 'ms');

      res.status(200).json({ success: true, data: profileData });
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error('[ProfileController] ===== ERROR IN GET PROFILE =====');
      console.error('[ProfileController] Error message:', error.message);
      console.error('[ProfileController] Error name:', error.name);
      console.error('[ProfileController] Error stack:', error.stack);
      console.error('[ProfileController] Request params:', { entityId: req.params.entityId });
      console.error('[ProfileController] Current user:', { 
        userId: req.user?.id,
        entityAccountId: req.user?.entityAccountId
      });
      console.error('[ProfileController] Error time:', errorTime, 'ms');
      
      // Trả về thông báo lỗi chi tiết hơn để debug
      const errorMessage = error.message || 'Internal server error';
      
      // Nếu là lỗi "Profile not found" hoặc "Entity not found", trả về 404
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return res.status(404).json({ 
          success: false, 
          message: errorMessage
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

module.exports = new ProfileController();

