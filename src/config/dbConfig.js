module.exports = {
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || '',
    database: process.env.MSSQL_DATABASE || 'Smoker',
    server: process.env.MSSQL_SERVER || 'localhost',
    port: Number.parseInt(process.env.MSSQL_PORT, 10) || 1433,
    // Set to true for local development, false for production with valid certificates
    options: {
  
      encrypt: true,
      trustServerCertificate: true,
    },
  };

  
  