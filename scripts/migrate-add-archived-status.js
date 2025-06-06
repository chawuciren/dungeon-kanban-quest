#!/usr/bin/env node

/**
 * 地下城看板探险 - 添加任务归档状态和进度字段迁移脚本
 * 为现有任务添加 isArchived 和 progress 字段
 * - isArchived: 默认设置为 false（未归档）
 * - progress: 默认设置为 0（未开始）
 *
 * 使用方法：
 * - 执行迁移：node scripts/migrate-add-archived-status.js
 * - 强制执行：node scripts/migrate-add-archived-status.js --force
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
🎮 地下城看板探险 - 任务归档状态和进度迁移工具

使用方法：
  node scripts/migrate-add-archived-status.js [选项]

选项：
  --force     强制执行迁移，不询问确认
  --help, -h  显示此帮助信息

说明：
  此脚本会为所有现有任务添加以下字段：
  - is_archived: 归档状态字段，默认设置为未归档状态
  - progress: 进度字段，默认设置为0%
  如果数据库表结构已经包含这些字段，脚本会自动跳过。
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

async function migrateArchivedStatus() {
  try {
    if (isHelp) {
      showHelp();
      process.exit(0);
    }

    console.log('🎮 地下城看板探险 - 任务归档状态和进度迁移');
    console.log('===============================================');

    // 检查数据库连接
    console.log('🔍 检查数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    // 检查是否已经存在字段
    const queryInterface = sequelize.getQueryInterface();
    const tableDescription = await queryInterface.describeTable('bounty_tasks');

    const hasArchivedField = tableDescription.is_archived;
    const hasProgressField = tableDescription.progress;

    if (hasArchivedField && hasProgressField) {
      console.log('✅ is_archived 和 progress 字段都已存在，无需迁移');
      process.exit(0);
    }

    let shouldMigrate = isForce;

    // 如果不是强制模式，询问用户确认
    if (!isForce) {
      console.log('📋 准备为任务表添加归档状态和进度字段...');
      shouldMigrate = await askConfirmation('确定要执行迁移吗？');

      if (!shouldMigrate) {
        console.log('❌ 用户取消操作');
        process.exit(0);
      }
    }

    console.log('🔄 开始迁移...');

    // 添加 is_archived 字段（如果不存在）
    if (!hasArchivedField) {
      await queryInterface.addColumn('bounty_tasks', 'is_archived', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: '是否已归档'
      });
      console.log('✅ 成功添加 is_archived 字段');

      // 为所有现有任务设置默认值
      await sequelize.query(
        'UPDATE bounty_tasks SET is_archived = false WHERE is_archived IS NULL'
      );
      console.log('✅ 已为现有任务设置默认归档状态');
    } else {
      console.log('ℹ️  is_archived 字段已存在，跳过');
    }

    // 添加 progress 字段（如果不存在）
    if (!hasProgressField) {
      await queryInterface.addColumn('bounty_tasks', 'progress', {
        type: sequelize.Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
        validate: {
          min: 0,
          max: 100
        },
        comment: '任务完成进度百分比 (0-100)'
      });
      console.log('✅ 成功添加 progress 字段');

      // 为所有现有任务设置默认值
      await sequelize.query(
        'UPDATE bounty_tasks SET progress = 0 WHERE progress IS NULL'
      );
      console.log('✅ 已为现有任务设置默认进度');
    } else {
      console.log('ℹ️  progress 字段已存在，跳过');
    }

    // 创建索引以提高查询性能
    if (!hasArchivedField) {
      try {
        await queryInterface.addIndex('bounty_tasks', ['is_archived'], {
          name: 'idx_bounty_tasks_is_archived'
        });
        console.log('✅ 成功创建归档状态索引');
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('ℹ️  归档状态索引已存在');
        } else {
          console.warn('⚠️  创建归档状态索引失败:', error.message);
        }
      }
    }

    console.log('🎉 迁移完成！');
    console.log('');
    console.log('📝 迁移摘要：');
    if (!hasArchivedField) {
      console.log('  - 添加了 is_archived 字段到 bounty_tasks 表');
      console.log('  - 所有现有任务默认设置为未归档状态');
      console.log('  - 创建了归档状态索引以提高查询性能');
    }
    if (!hasProgressField) {
      console.log('  - 添加了 progress 字段到 bounty_tasks 表');
      console.log('  - 所有现有任务默认设置为0%进度');
    }
    console.log('');
    console.log('🔍 现在您可以在任务列表中使用归档状态筛选功能和进度显示了！');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    logger.error('任务归档状态迁移失败:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// 执行迁移
migrateArchivedStatus();
