#!/usr/bin/env node

/**
 * 地下城看板探险 - 移除技能等级字段迁移脚本
 * 用于从现有数据库中移除用户技能等级和任务技能要求字段
 *
 * 使用方法：
 * - 执行迁移：node scripts/migrate-remove-skill-level.js
 * - 强制执行：node scripts/migrate-remove-skill-level.js --force
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
🎮 地下城看板探险 - 移除技能等级字段迁移工具

使用方法：
  node scripts/migrate-remove-skill-level.js [选项]

选项：
  --force        强制执行迁移（不询问确认）
  --help, -h     显示此帮助信息

说明：
  此脚本将从数据库中移除以下字段：
  • users 表的 skill_level 字段
  • bounty_tasks 表的 skill_required 字段
  • 相关的索引

警告：
  此操作不可逆，请确保已备份重要数据！
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

async function migrateRemoveSkillLevel() {
  try {
    if (isHelp) {
      showHelp();
      process.exit(0);
    }

    console.log('🎮 地下城看板探险 - 移除技能等级字段迁移');
    console.log('===============================================');

    // 检查数据库连接
    console.log('🔍 检查数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功');

    const queryInterface = sequelize.getQueryInterface();

    // 检查表是否存在
    const tables = await queryInterface.showAllTables();
    const hasUsersTable = tables.includes('users');
    const hasBountyTasksTable = tables.includes('bounty_tasks');

    if (!hasUsersTable && !hasBountyTasksTable) {
      console.log('❌ 未找到相关数据表，可能数据库尚未初始化');
      process.exit(1);
    }

    console.log('📋 检查需要迁移的字段...');

    let fieldsToRemove = [];

    // 检查 users 表的 skill_level 字段
    if (hasUsersTable) {
      try {
        const usersColumns = await queryInterface.describeTable('users');
        if (usersColumns.skill_level) {
          fieldsToRemove.push('users.skill_level');
          console.log('   ✓ 发现 users.skill_level 字段');
        }
      } catch (error) {
        console.log('   ⚠️  无法检查 users 表结构:', error.message);
      }
    }

    // 检查 bounty_tasks 表的 skill_required 字段
    if (hasBountyTasksTable) {
      try {
        const tasksColumns = await queryInterface.describeTable('bounty_tasks');
        if (tasksColumns.skill_required) {
          fieldsToRemove.push('bounty_tasks.skill_required');
          console.log('   ✓ 发现 bounty_tasks.skill_required 字段');
        }
      } catch (error) {
        console.log('   ⚠️  无法检查 bounty_tasks 表结构:', error.message);
      }
    }

    if (fieldsToRemove.length === 0) {
      console.log('✅ 未发现需要移除的技能等级字段，数据库已是最新状态');
      process.exit(0);
    }

    console.log('');
    console.log('📝 将要移除的字段：');
    fieldsToRemove.forEach(field => {
      console.log(`   • ${field}`);
    });

    // 确认操作
    if (!isForce) {
      console.log('');
      console.log('⚠️  警告：此操作将永久删除上述字段及其数据！');
      const confirmed = await askConfirmation('确定要继续执行迁移吗？');

      if (!confirmed) {
        console.log('❌ 用户取消操作');
        process.exit(0);
      }
    }

    console.log('');
    console.log('🚀 开始执行迁移...');

    // 移除 users 表的 skill_level 字段
    if (fieldsToRemove.includes('users.skill_level')) {
      try {
        console.log('   📝 移除 users.skill_level 字段...');
        
        // 先尝试移除相关索引
        try {
          await queryInterface.removeIndex('users', ['skill_level']);
          console.log('   ✓ 移除 skill_level 索引');
        } catch (error) {
          // 索引可能不存在，忽略错误
          console.log('   ℹ️  skill_level 索引不存在或已移除');
        }

        // 移除字段
        await queryInterface.removeColumn('users', 'skill_level');
        console.log('   ✅ users.skill_level 字段移除成功');
      } catch (error) {
        console.log('   ❌ 移除 users.skill_level 字段失败:', error.message);
      }
    }

    // 移除 bounty_tasks 表的 skill_required 字段
    if (fieldsToRemove.includes('bounty_tasks.skill_required')) {
      try {
        console.log('   📝 移除 bounty_tasks.skill_required 字段...');
        
        // 先尝试移除相关索引
        try {
          await queryInterface.removeIndex('bounty_tasks', ['skill_required']);
          console.log('   ✓ 移除 skill_required 索引');
        } catch (error) {
          // 索引可能不存在，忽略错误
          console.log('   ℹ️  skill_required 索引不存在或已移除');
        }

        // 移除字段
        await queryInterface.removeColumn('bounty_tasks', 'skill_required');
        console.log('   ✅ bounty_tasks.skill_required 字段移除成功');
      } catch (error) {
        console.log('   ❌ 移除 bounty_tasks.skill_required 字段失败:', error.message);
      }
    }

    console.log('');
    console.log('🎉 技能等级字段迁移完成！');
    console.log('===============================================');
    console.log('');
    console.log('✅ 已移除的功能：');
    console.log('   • 用户技能等级评级系统');
    console.log('   • 任务技能要求限制');
    console.log('   • 相关的筛选和显示功能');
    console.log('');
    console.log('🎯 保留的功能：');
    console.log('   • 任务星级难度评定');
    console.log('   • 任务紧急程度管理');
    console.log('   • 用户角色权限系统');
    console.log('   • 项目级角色分配');
    console.log('');
    console.log('💡 系统现在更专注于：');
    console.log('   • 工时管理和效率统计');
    console.log('   • 基于项目的角色管理');
    console.log('   • 任务进度和完成度跟踪');

    process.exit(0);
  } catch (error) {
    logger.error('技能等级字段迁移失败:', error);
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
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateRemoveSkillLevel();
}

module.exports = { migrateRemoveSkillLevel };
