const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Root1234!',
    database: 'hyper_db',
    port: 3306,
    charset: 'utf8mb4'
});

module.exports = db;


