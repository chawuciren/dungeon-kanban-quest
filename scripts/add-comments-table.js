#!/usr/bin/env node

/**
 * 添加任务评论表的数据库迁移脚本
 * 用法: node scripts/add-comments-table.js
 */

const { sequelize, TaskComment } = require('../src/models');
const logger = require('../src/config/logger');

async function addCommentsTable() {
  try {
    console.log('🚀 开始添加任务评论表...');

    // 检查表是否已存在
    const tableExists = await sequelize.getQueryInterface().showAllTables()
      .then(tables => tables.includes('task_comments'));

    if (tableExists) {
      console.log('⚠️  任务评论表已存在，跳过创建');
      return;
    }

    // 同步TaskComment模型，只创建这个表
    await TaskComment.sync({ force: false });
    
    console.log('✅ 任务评论表创建成功');

    // 验证表结构
    const tableInfo = await sequelize.getQueryInterface().describeTable('task_comments');
    console.log('📋 表结构验证:');
    console.log('   - id (主键):', tableInfo.id ? '✅' : '❌');
    console.log('   - task_id (外键):', tableInfo.task_id ? '✅' : '❌');
    console.log('   - user_id (外键):', tableInfo.user_id ? '✅' : '❌');
    console.log('   - content (内容):', tableInfo.content ? '✅' : '❌');
    console.log('   - parent_comment_id (父评论):', tableInfo.parent_comment_id ? '✅' : '❌');
    console.log('   - reply_to_user_id (回复用户):', tableInfo.reply_to_user_id ? '✅' : '❌');
    console.log('   - level (层级):', tableInfo.level ? '✅' : '❌');
    console.log('   - is_edited (编辑标记):', tableInfo.is_edited ? '✅' : '❌');
    console.log('   - edited_at (编辑时间):', tableInfo.edited_at ? '✅' : '❌');
    console.log('   - likes_count (点赞数):', tableInfo.likes_count ? '✅' : '❌');
    console.log('   - created_at (创建时间):', tableInfo.created_at ? '✅' : '❌');
    console.log('   - updated_at (更新时间):', tableInfo.updated_at ? '✅' : '❌');

    // 创建一些示例评论数据（可选）
    const createSampleData = process.argv.includes('--sample-data');
    if (createSampleData) {
      await createSampleComments();
    }

    console.log('🎉 任务评论功能已成功添加到数据库！');
    console.log('');
    console.log('📝 使用说明:');
    console.log('   1. 重启应用服务器');
    console.log('   2. 访问任务详情页面');
    console.log('   3. 在页面底部可以看到评论功能');
    console.log('   4. 支持富文本编辑、回复、@提醒等功能');

  } catch (error) {
    console.error('❌ 添加任务评论表失败:', error);
    logger.error('添加任务评论表失败:', error);
    process.exit(1);
  }
}

async function createSampleComments() {
  try {
    console.log('📝 创建示例评论数据...');

    const { BountyTask, User } = require('../src/models');

    // 获取第一个任务和用户
    const task = await BountyTask.findOne();
    const users = await User.findAll({ limit: 3 });

    if (!task || users.length === 0) {
      console.log('⚠️  没有找到任务或用户，跳过创建示例数据');
      return;
    }

    // 创建主评论
    const mainComment = await TaskComment.create({
      taskId: task.id,
      userId: users[0].id,
      content: '<p>这个任务的技术方案看起来不错，我有几个建议：</p><ul><li>建议增加单元测试覆盖</li><li>考虑性能优化方案</li><li>文档需要补充完整</li></ul>',
      level: 0
    });

    // 创建回复评论
    if (users.length > 1) {
      await TaskComment.create({
        taskId: task.id,
        userId: users[1].id,
        content: `<p>@${users[0].firstName}${users[0].lastName} 同意你的建议，我来负责单元测试的部分。</p>`,
        parentCommentId: mainComment.id,
        replyToUserId: users[0].id,
        level: 1
      });
    }

    if (users.length > 2) {
      await TaskComment.create({
        taskId: task.id,
        userId: users[2].id,
        content: '<p>我可以协助完善文档，预计明天完成。</p>',
        parentCommentId: mainComment.id,
        level: 1
      });
    }

    console.log('✅ 示例评论数据创建成功');

  } catch (error) {
    console.error('❌ 创建示例评论数据失败:', error);
  }
}

// 主函数
async function main() {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    console.log('🔗 数据库连接成功');

    // 添加评论表
    await addCommentsTable();

  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await sequelize.close();
    console.log('🔌 数据库连接已关闭');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('🎯 任务评论表添加脚本');
  console.log('=====================================');
  console.log('');
  
  // 显示帮助信息
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('用法:');
    console.log('  node scripts/add-comments-table.js              # 只添加表结构');
    console.log('  node scripts/add-comments-table.js --sample-data # 添加表结构并创建示例数据');
    console.log('');
    console.log('选项:');
    console.log('  --sample-data    创建示例评论数据');
    console.log('  --help, -h       显示帮助信息');
    console.log('');
    process.exit(0);
  }

  main();
}

module.exports = { addCommentsTable, createSampleComments };
