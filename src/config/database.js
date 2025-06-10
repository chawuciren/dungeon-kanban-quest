const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './database/kanban.db';

// 确保数据库目录存在
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// 测试数据库连接
const testConnection = async () => {
  try {
    console.log('🔍 正在测试数据库连接...');
    console.log(`📁 数据库路径: ${dbPath}`);
    console.log(`📂 数据库目录: ${dbDir}`);
    console.log(`📊 数据库文件是否存在: ${fs.existsSync(dbPath) ? '是' : '否'}`);

    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    // 检查数据库表
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    console.log(`📋 数据库中的表 (${tables.length}个):`, tables);

  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    throw error;
  }
};

module.exports = {
  sequelize,
  testConnection
};
