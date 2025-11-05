const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
;
const crypto = require("crypto");

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// Generate RTC token for a user to join a channel
function generateRtcToken(channelName, uid = 0, role = RtcRole.PUBLISHER, expirationTimeInSeconds = 3600) {
  if (!APP_ID || !APP_CERTIFICATE) {
    throw new Error("Agora credentials are not configured");
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    uid,
    role,
    privilegeExpiredTs
  );

  return token;
}

// Get channel credentials for frontend
function getChannelCredentials(accountId) {
  // Generate unique channel name (must be <= 64 bytes)
  // Format: ls_<accountId>_<timestamp>_<shortHash>
  // Truncate accountId to max 20 chars if needed
  const shortAccountId = String(accountId).substring(0, 20);
  const timestamp = Date.now().toString(36); // Base36 for shorter representation
  const shortHash = crypto.randomUUID().replace(/-/g, '').substring(0, 8); // Remove hyphens and take first 8 chars
  
  // Ensure total length is under 64 bytes
  let channelName = `ls_${shortAccountId}_${timestamp}_${shortHash}`;
  
  // If still too long, truncate further
  if (Buffer.byteLength(channelName, 'utf8') > 64) {
    const maxLength = 60; // Leave some buffer
    channelName = channelName.substring(0, maxLength);
  }
  
  // Generate UID (Agora recommends using 0 for automatic UID assignment, or a unique number)
  const uid = Math.floor(Math.random() * 100000);
  
  // Generate token with publisher role (can publish and subscribe)
  const token = generateRtcToken(channelName, uid, RtcRole.PUBLISHER);
  
  return {
    appId: APP_ID,
    channelName,
    uid,
    token,
  };
}

// Generate subscriber token for viewers
function getSubscriberToken(channelName) {
  const uid = Math.floor(Math.random() * 100000);
  const token = generateRtcToken(channelName, uid, RtcRole.SUBSCRIBER);
  
  return {
    uid,
    token,
  };
}

module.exports = {
  generateRtcToken,
  getChannelCredentials,
  getSubscriberToken,
};

