#!/usr/bin/env node

/**
 * 地下城看板探险 - 任务负责人和审核人必填字段迁移脚本
 * 将 assignee_id 和 reviewer_id 字段设为必填
 */

const { sequelize } = require('../src/models');
const logger = require('../src/config/logger');
const readline = require('readline');

// 解析命令行参数
const args = process.argv.slice(2);
const isForce = args.includes('--force');
const isHelp = args.includes('--help') || args.includes('-h');

// 显示帮助信息
function showHelp() {
  console.log(`
🎮 地下城看板探险 - 任务负责人和审核人必填字段迁移

使用方法：
  node scripts/migrate-required-assignee-reviewer.js [选项]

选项：
  --force    强制执行迁移，不询问确认
  --help     显示此帮助信息

功能：
  - 将 bounty_tasks 表的 assignee_id 字段设为必填
  - 将 bounty_tasks 表的 reviewer_id 字段设为必填
  - 检查并处理现有的空值数据

注意：
  - 此操作会修改数据库结构
  - 如果存在空值数据，迁移会失败
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

async function migrateRequiredFields() {
  try {
    if (isHelp) {
      showHelp();
      process.exit(0);
    }

    console.log('🎮 地下城看板探险 - 任务负责人和审核人必填字段迁移');
    console.log('=====================================');

    // 检查数据库连接
    console.log('🔍 检查数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    const queryInterface = sequelize.getQueryInterface();

    // 检查表是否存在
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('bounty_tasks')) {
      console.log('❌ bounty_tasks 表不存在，请先运行数据库初始化脚本');
      process.exit(1);
    }

    // 检查现有数据中是否有空值
    console.log('🔍 检查现有数据...');
    const [nullAssigneeCount] = await sequelize.query(
      'SELECT COUNT(*) as count FROM bounty_tasks WHERE assignee_id IS NULL'
    );
    const [nullReviewerCount] = await sequelize.query(
      'SELECT COUNT(*) as count FROM bounty_tasks WHERE reviewer_id IS NULL'
    );

    const nullAssignees = nullAssigneeCount[0].count;
    const nullReviewers = nullReviewerCount[0].count;

    console.log(`📊 数据检查结果:`);
    console.log(`   - 负责人为空的任务: ${nullAssignees} 个`);
    console.log(`   - 审核人为空的任务: ${nullReviewers} 个`);

    if (nullAssignees > 0 || nullReviewers > 0) {
      console.log('');
      console.log('⚠️  警告：发现空值数据！');
      console.log('   在设置字段为必填之前，需要先处理这些空值。');
      console.log('   建议：');
      console.log('   1. 手动为这些任务分配负责人和审核人');
      console.log('   2. 或者删除这些不完整的任务');
      console.log('');
      
      if (!isForce) {
        const shouldContinue = await askConfirmation('是否要自动删除这些不完整的任务？');
        if (!shouldContinue) {
          console.log('❌ 用户取消操作');
          process.exit(0);
        }
      }

      // 删除不完整的任务
      console.log('🗑️  删除不完整的任务...');
      await sequelize.query(
        'DELETE FROM bounty_tasks WHERE assignee_id IS NULL OR reviewer_id IS NULL'
      );
      console.log(`✅ 已删除 ${nullAssignees + nullReviewers} 个不完整的任务`);
    }

    let shouldMigrate = isForce;

    // 如果不是强制模式，询问用户确认
    if (!isForce) {
      console.log('📋 准备执行以下操作：');
      console.log('   1. 将 assignee_id 字段设为必填 (NOT NULL)');
      console.log('   2. 将 reviewer_id 字段设为必填 (NOT NULL)');
      console.log('');
      shouldMigrate = await askConfirmation('确定要执行迁移吗？');

      if (!shouldMigrate) {
        console.log('❌ 用户取消操作');
        process.exit(0);
      }
    }

    console.log('🔄 开始迁移...');

    // 修改 assignee_id 字段为必填
    try {
      await queryInterface.changeColumn('bounty_tasks', 'assignee_id', {
        type: sequelize.Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      });
      console.log('✅ assignee_id 字段已设为必填');
    } catch (error) {
      if (error.message.includes('NOT NULL constraint failed')) {
        console.log('❌ 仍有空值数据，无法设置为必填');
        throw error;
      } else {
        console.log('ℹ️  assignee_id 字段可能已经是必填');
      }
    }

    // 修改 reviewer_id 字段为必填
    try {
      await queryInterface.changeColumn('bounty_tasks', 'reviewer_id', {
        type: sequelize.Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      });
      console.log('✅ reviewer_id 字段已设为必填');
    } catch (error) {
      if (error.message.includes('NOT NULL constraint failed')) {
        console.log('❌ 仍有空值数据，无法设置为必填');
        throw error;
      } else {
        console.log('ℹ️  reviewer_id 字段可能已经是必填');
      }
    }

    console.log('🎉 迁移完成！');
    console.log('');
    console.log('📝 迁移摘要：');
    console.log('  - assignee_id 字段已设为必填');
    console.log('  - reviewer_id 字段已设为必填');
    console.log('  - 现在创建任务时必须指定负责人和审核人');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    logger.error('任务负责人和审核人必填字段迁移失败:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// 运行迁移
if (require.main === module) {
  migrateRequiredFields();
}

module.exports = { migrateRequiredFields };
