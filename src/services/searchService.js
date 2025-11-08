const { getPool, sql } = require("../db/sqlserver");

function buildLike(q) {
  return `%${q.replace(/[%_]/g, "")}%`;
}

async function searchBars(pool, q, limit) {
  const result = await pool.request()
    .input("q", sql.NVarChar, buildLike(q))
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit)
        bp.BarPageId AS id,
        bp.BarName AS name,
        bp.Avatar AS avatar,
        'BAR' AS type,
        ea.EntityAccountId AS entityAccountId
      FROM BarPages bp
      LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BarPage' AND ea.EntityId = bp.BarPageId
      WHERE bp.BarName LIKE @q
      ORDER BY bp.created_at DESC
    `);
  return result.recordset;
}

async function searchBusiness(pool, q, limit) {
  const result = await pool.request()
    .input("q", sql.NVarChar, buildLike(q))
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit)
        ea.EntityAccountId AS id,
        ba.UserName AS name,
        ba.Avatar AS avatar,
        CASE WHEN UPPER(ba.Role) = 'DJ' THEN 'DJ' ELSE 'DANCER' END AS type
      FROM BussinessAccounts ba
      JOIN EntityAccounts ea ON ea.EntityType = 'BusinessAccount' AND ea.EntityId = ba.BussinessAccountId
      WHERE ba.UserName LIKE @q
      ORDER BY ba.created_at DESC
    `);
  return result.recordset;
}

async function searchUsers(pool, q, limit) {
  const result = await pool.request()
    .input("q", sql.NVarChar, buildLike(q))
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit)
        ea.EntityAccountId AS id,
        a.UserName AS name,
        a.Avatar AS avatar,
        'USER' AS type
      FROM Accounts a
      JOIN EntityAccounts ea ON ea.EntityType = 'Account' AND ea.EntityId = a.AccountId
      WHERE a.UserName LIKE @q
      ORDER BY a.created_at DESC
    `);
  return result.recordset;
}

exports.searchAll = async (q, limit = 10) => {
  const pool = await getPool();
  const [bars, performers, users] = await Promise.all([
    searchBars(pool, q, limit),
    searchBusiness(pool, q, limit),
    searchUsers(pool, q, limit)
  ]);
  const djs = performers.filter(p => String(p.type).toUpperCase() === 'DJ');
  const dancers = performers.filter(p => String(p.type).toUpperCase() === 'DANCER');
  return { users, bars, djs, dancers };
};


