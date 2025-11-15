const { Sequelize } = require('sequelize');
const dbConfig = require('../config/dbConfig');

const sequelize = new Sequelize(dbConfig.database, dbConfig.user, dbConfig.password, {
  host: dbConfig.server,
  dialect: 'mssql',
  dialectOptions: {
    options: {
      encrypt: true, 
      trustServerCertificate: true, 
    },
  },
  logging: false, 
});

module.exports = sequelize;
