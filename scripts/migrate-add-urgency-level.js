#!/usr/bin/env node

/**
 * 地下城看板探险 - 添加任务紧急程度字段迁移脚本
 * 为现有任务添加 urgency_level 字段
 * - urgency_level: 默认设置为 'normal'（普通）
 *
 * 使用方法：
 * - 执行迁移：node scripts/migrate-add-urgency-level.js
 * - 强制执行：node scripts/migrate-add-urgency-level.js --force
 */

const { sequelize, BountyTask } = require('../src/models');
const logger = require('../src/config/logger');
const readline = require('readline');

// 解析命令行参数
const args = process.argv.slice(2);
const isForce = args.includes('--force');
const isHelp = args.includes('--help') || args.includes('-h');

// 显示帮助信息
function showHelp() {
  console.log(`
🎮 地下城看板探险 - 任务紧急程度字段迁移工具

使用方法：
  node scripts/migrate-add-urgency-level.js [选项]

选项：
  --force     强制执行迁移，不询问确认
  --help, -h  显示此帮助信息

说明：
  此脚本会为所有现有任务添加以下字段：
  - urgency_level: 紧急程度字段，默认设置为 'normal'（普通）
  如果数据库表结构已经包含这个字段，脚本会自动跳过。

紧急程度选项：
  - urgent: 紧急
  - important: 重要
  - normal: 普通
  - delayed: 延后
  - frozen: 冻结
`);
}

// 询问用户确认
function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function migrateUrgencyLevel() {
  try {
    if (isHelp) {
      showHelp();
      process.exit(0);
    }

    console.log('🎮 地下城看板探险 - 任务紧急程度字段迁移');
    console.log('===============================================');

    // 检查数据库连接
    console.log('🔍 检查数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    // 检查是否已经存在字段
    const queryInterface = sequelize.getQueryInterface();
    const tableDescription = await queryInterface.describeTable('bounty_tasks');

    const hasUrgencyField = tableDescription.urgency_level;

    if (hasUrgencyField) {
      console.log('✅ urgency_level 字段已存在，无需迁移');
      process.exit(0);
    }

    let shouldMigrate = isForce;

    // 如果不是强制模式，询问用户确认
    if (!isForce) {
      console.log('📋 准备为任务表添加紧急程度字段...');
      console.log('   这将为所有现有任务设置默认紧急程度为"普通"');
      shouldMigrate = await askConfirmation('确定要执行迁移吗？');

      if (!shouldMigrate) {
        console.log('❌ 用户取消操作');
        process.exit(0);
      }
    }

    console.log('🔄 开始迁移...');

    // 添加 urgency_level 字段
    await queryInterface.addColumn('bounty_tasks', 'urgency_level', {
      type: sequelize.Sequelize.ENUM('urgent', 'important', 'normal', 'delayed', 'frozen'),
      defaultValue: 'normal',
      allowNull: false,
      comment: '任务紧急程度'
    });
    console.log('✅ 成功添加 urgency_level 字段');

    // 为所有现有任务设置默认值
    await sequelize.query(
      "UPDATE bounty_tasks SET urgency_level = 'normal' WHERE urgency_level IS NULL"
    );
    console.log('✅ 已为现有任务设置默认紧急程度');

    // 创建索引以提高查询性能
    try {
      await queryInterface.addIndex('bounty_tasks', ['urgency_level'], {
        name: 'idx_bounty_tasks_urgency_level'
      });
      console.log('✅ 成功创建紧急程度索引');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  紧急程度索引已存在');
      } else {
        console.warn('⚠️  创建紧急程度索引失败:', error.message);
      }
    }

    console.log('🎉 迁移完成！');
    console.log('');
    console.log('📝 迁移摘要：');
    console.log('  - 添加了 urgency_level 字段到 bounty_tasks 表');
    console.log('  - 所有现有任务默认设置为普通紧急程度');
    console.log('  - 创建了紧急程度索引以提高查询性能');
    console.log('');
    console.log('🔍 现在您可以在任务列表中使用按优先级排序功能了！');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    logger.error('任务紧急程度字段迁移失败:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// 执行迁移
migrateUrgencyLevel();
