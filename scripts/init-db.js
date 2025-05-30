#!/usr/bin/env node

/**
 * 数据库初始化脚本
 * 用于创建数据库表和初始数据
 */

const { syncDatabase } = require('../src/models');
const logger = require('../src/config/logger');

async function initDatabase() {
  try {
    console.log('🚀 开始初始化数据库...');
    
    // 强制同步数据库（会删除现有数据）
    await syncDatabase(true);
    
    console.log('✅ 数据库初始化完成！');
    console.log('');
    console.log('默认管理员账户：');
    console.log('用户名: admin');
    console.log('邮箱: admin@kanban.local');
    console.log('密码: admin123');
    console.log('');
    console.log('🎮 现在可以启动应用了：npm run dev');
    
    process.exit(0);
  } catch (error) {
    logger.error('数据库初始化失败:', error);
    console.error('❌ 数据库初始化失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
