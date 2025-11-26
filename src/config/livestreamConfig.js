const TOKEN_TTL_SECONDS = Number.parseInt(process.env.AGORA_TOKEN_TTL || "3600", 10);
const LIST_LIMIT = Number.parseInt(process.env.LIVESTREAM_LIST_LIMIT || "50", 10);

module.exports = {
  agora: {
    appId: process.env.AGORA_APP_ID,
    certificate: process.env.AGORA_APP_CERTIFICATE,
    tokenTtl: TOKEN_TTL_SECONDS,
  },
  limits: {
    maxActive: Number.parseInt(process.env.LIVESTREAM_MAX_ACTIVE || "50", 10),
    listPageSize: LIST_LIMIT,
  },
};

