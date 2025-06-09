#!/usr/bin/env node

/**
 * 地下城看板探险 - 用户设置表迁移脚本
 * 用于添加用户设置表和相关功能
 * 
 * 使用方法：
 * - 执行迁移：node scripts/migrate-add-user-settings.js
 * - 强制执行：node scripts/migrate-add-user-settings.js --force
 */

const { sequelize, UserSettings } = require('../src/models');
const logger = require('../src/config/logger');
const readline = require('readline');

// 解析命令行参数
const args = process.argv.slice(2);
const isForce = args.includes('--force');
const isHelp = args.includes('--help') || args.includes('-h');

// 显示帮助信息
function showHelp() {
  console.log(`
🎮 地下城看板探险 - 用户设置表迁移工具

使用方法：
  node scripts/migrate-add-user-settings.js [选项]

选项：
  --force     强制执行迁移，不询问确认
  --help, -h  显示此帮助信息

功能：
  - 创建 user_settings 表
  - 为现有用户创建默认设置记录
  - 验证数据完整性

注意：
  - 此脚本是安全的，不会删除现有数据
  - 如果表已存在，会跳过创建步骤
  - 建议在执行前备份数据库
`);
}

// 询问用户确认
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function migrateUserSettings() {
  try {
    if (isHelp) {
      showHelp();
      process.exit(0);
    }

    console.log('🎮 地下城看板探险 - 用户设置表迁移');
    console.log('=====================================');

    // 检查数据库连接
    console.log('🔍 检查数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    let shouldProceed = isForce;

    // 如果不是强制模式，询问确认
    if (!isForce) {
      console.log('📋 此迁移将执行以下操作：');
      console.log('   1. 创建 user_settings 表');
      console.log('   2. 为现有用户创建默认设置记录');
      console.log('   3. 验证数据完整性');
      console.log('');
      shouldProceed = await askConfirmation('是否继续执行迁移？');

      if (!shouldProceed) {
        console.log('❌ 用户取消操作');
        process.exit(0);
      }
    }

    console.log('🚀 开始执行迁移...');

    // 1. 创建用户设置表
    console.log('📊 创建用户设置表...');
    await UserSettings.sync({ alter: true });
    console.log('✅ 用户设置表创建/更新完成');

    // 2. 为现有用户创建默认设置
    console.log('👥 为现有用户创建默认设置...');
    const { User } = require('../src/models');
    
    // 获取所有没有设置记录的用户
    const usersWithoutSettings = await User.findAll({
      include: [
        {
          model: UserSettings,
          as: 'settings',
          required: false
        }
      ],
      where: {
        '$settings.id$': null
      }
    });

    console.log(`📝 找到 ${usersWithoutSettings.length} 个用户需要创建默认设置`);

    // 为每个用户创建默认设置
    for (const user of usersWithoutSettings) {
      await UserSettings.create({
        userId: user.id
      });
      console.log(`   ✓ 为用户 ${user.username} 创建默认设置`);
    }

    // 3. 验证数据完整性
    console.log('🔍 验证数据完整性...');
    const totalUsers = await User.count();
    const totalSettings = await UserSettings.count();

    if (totalUsers === totalSettings) {
      console.log(`✅ 数据完整性验证通过 (${totalUsers} 个用户，${totalSettings} 条设置记录)`);
    } else {
      console.log(`⚠️  数据不一致：${totalUsers} 个用户，${totalSettings} 条设置记录`);
    }

    console.log('');
    console.log('🎉 用户设置表迁移完成！');
    console.log('=====================================');
    console.log('');
    console.log('📊 迁移统计：');
    console.log(`   👥 总用户数：${totalUsers}`);
    console.log(`   ⚙️  设置记录数：${totalSettings}`);
    console.log(`   ➕ 新增设置记录：${usersWithoutSettings.length}`);
    console.log('');
    console.log('✨ 用户现在可以在个人资料页面访问用户设置功能');

    process.exit(0);
  } catch (error) {
    logger.error('用户设置表迁移失败:', error);
    console.error('');
    console.error('❌ 迁移失败:');
    console.error('   错误信息:', error.message);

    if (error.name === 'SequelizeConnectionError') {
      console.error('');
      console.error('💡 可能的解决方案：');
      console.error('   1. 检查数据库服务是否启动');
      console.error('   2. 检查 .env 文件中的数据库配置');
      console.error('   3. 确保数据库用户有足够的权限');
    }

    console.error('');
    console.error('🔧 如需帮助，请查看日志文件或联系开发团队');
    process.exit(1);
  }
}

// 执行迁移
migrateUserSettings();
