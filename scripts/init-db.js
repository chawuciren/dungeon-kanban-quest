#!/usr/bin/env node

/**
 * 地下城看板探险 - 数据库初始化脚本
 * 用于创建数据库表和初始数据
 *
 * 使用方法：
 * - 初始化数据库：node scripts/init-db.js
 * - 强制重置：node scripts/init-db.js --force
 * - 仅创建表结构：node scripts/init-db.js --schema-only
 */

const { syncDatabase, createDefaultData, sequelize } = require('../src/models');
const logger = require('../src/config/logger');
const readline = require('readline');

// 解析命令行参数
const args = process.argv.slice(2);
const isForce = args.includes('--force');
const isSchemaOnly = args.includes('--schema-only');
const isHelp = args.includes('--help') || args.includes('-h');

// 显示帮助信息
function showHelp() {
  console.log(`
🎮 地下城看板探险 - 数据库初始化工具

使用方法：
  node scripts/init-db.js [选项]

选项：
  --force        强制重置数据库（删除所有现有数据）
  --schema-only  仅创建表结构，不插入初始数据
  --help, -h     显示此帮助信息

示例：
  node scripts/init-db.js              # 正常初始化
  node scripts/init-db.js --force      # 强制重置
  node scripts/init-db.js --schema-only # 仅创建表
`);
}

// 确认用户操作
function askConfirmation(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function initDatabase() {
  try {
    if (isHelp) {
      showHelp();
      process.exit(0);
    }

    console.log('🎮 地下城看板探险 - 数据库初始化');
    console.log('=====================================');

    // 检查数据库连接
    console.log('🔍 检查数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    let shouldReset = isForce;

    // 如果不是强制模式，检查是否已有数据
    if (!isForce) {
      try {
        const tables = await sequelize.getQueryInterface().showAllTables();
        if (tables.length > 0) {
          console.log(`⚠️  检测到现有数据库表 (${tables.length} 个表)`);
          shouldReset = await askConfirmation('是否要重置数据库？这将删除所有现有数据');

          if (!shouldReset) {
            console.log('❌ 用户取消操作');
            process.exit(0);
          }
        }
      } catch (error) {
        // 如果查询失败，可能是数据库不存在，继续初始化
        console.log('📝 数据库为空，开始初始化...');
      }
    }

    console.log('🚀 开始同步数据库结构...');

    // 同步数据库结构
    await syncDatabase(shouldReset);

    console.log('✅ 数据库表结构创建完成');

    // 如果不是仅创建表结构模式，则插入初始数据
    if (!isSchemaOnly) {
      console.log('📊 创建初始数据...');
      await createDefaultData();
      console.log('✅ 初始数据创建完成');
    }

    console.log('');
    console.log('🎉 数据库初始化完成！');
    console.log('=====================================');

    if (!isSchemaOnly) {
      console.log('');
      console.log('🔑 默认管理员账户：');
      console.log('   用户名: admin');
      console.log('   邮箱: admin@kanban.local');
      console.log('   密码: admin123');
      console.log('   职业: ⚡ 神域守护者 (管理员)');
      console.log('');
      console.log('👥 示例用户账户：');
      console.log('   🔮 艾丽丝产品 (alice_pm) - 预言师 (产品经理)');
      console.log('   ⚔️  鲍勃开发 (bob_dev) - 剑士 (开发者)');
      console.log('   🏹 查理测试 (charlie_test) - 弓箭手 (测试员)');
      console.log('   🔮 戴安娜设计 (diana_ui) - 魔法师 (UI设计师)');
      console.log('   密码均为: [用户名]123 (如 alice123)');
      console.log('');
      console.log('🏰 默认公会：');
      console.log('   名称: 默认组织');
      console.log('   标识: default');
      console.log('   成员: 5人 (管理员 + 4个示例用户)');
      console.log('');
      console.log('🗺️  示例大陆（项目）：');
      console.log('   名称: 示例项目');
      console.log('   标识: SAMPLE');
      console.log('   类型: 🏗️ 据点建设');
      console.log('   成员: 4人 (管理员 + 3个示例用户)');
      console.log('');
      console.log('💡 重要说明：');
      console.log('   • 用户的职业仅作参考，实际角色在项目中单独管理');
      console.log('   • 公会级别不设置角色，只管理成员关系');
      console.log('   • 一个用户可以在不同项目中担任不同角色');
      console.log('   • 项目可以关联多个公会，支持跨组织协作');
    }

    console.log('');
    console.log('🎮 现在可以启动应用了：');
    console.log('   npm run dev');
    console.log('');
    console.log('🌐 访问地址：');
    console.log('   http://localhost:3000');

    process.exit(0);
  } catch (error) {
    logger.error('数据库初始化失败:', error);
    console.error('');
    console.error('❌ 数据库初始化失败:');
    console.error('   错误信息:', error.message);

    if (error.name === 'SequelizeConnectionError') {
      console.error('');
      console.error('💡 可能的解决方案：');
      console.error('   1. 检查数据库服务是否启动');
      console.error('   2. 检查 .env 文件中的数据库配置');
      console.error('   3. 确保数据库用户有足够的权限');
    }

    console.error('');
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
