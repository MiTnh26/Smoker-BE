module.exports = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  port: parseInt(process.env.MSSQL_PORT),
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};
