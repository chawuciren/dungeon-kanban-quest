const { sequelize, CurrencyTransaction, User, UserWallet } = require('../models');
const logger = require('../config/logger');

/**
 * 迁移脚本：创建交易记录表并添加一些示例数据
 */
async function migrateTransactions() {
  try {
    console.log('🔄 开始迁移交易记录表...');

    // 同步交易记录表
    await CurrencyTransaction.sync({ force: false });
    console.log('✅ 交易记录表同步完成');

    // 检查是否已有交易记录
    const existingTransactions = await CurrencyTransaction.count();
    if (existingTransactions > 0) {
      console.log(`⚠️  已存在 ${existingTransactions} 条交易记录，跳过示例数据创建`);
      return;
    }

    // 获取所有用户
    const users = await User.findAll({
      include: [{
        model: UserWallet,
        as: 'wallet',
        required: true
      }]
    });

    if (users.length === 0) {
      console.log('⚠️  没有找到用户，跳过示例交易记录创建');
      return;
    }

    console.log(`📊 为 ${users.length} 个用户创建示例交易记录...`);

    // 为每个用户创建一些示例交易记录
    for (const user of users) {
      const wallet = user.wallet;

      // 简化的交易记录创建，确保余额始终为正
      let balance = 0;

      // 系统初始化（所有用户都有）
      await CurrencyTransaction.create({
        userId: user.id,
        type: 'income',
        currency: 'gold',
        amount: 500,
        balanceBefore: balance,
        balanceAfter: balance + 500,
        description: '系统初始化奖励',
        source: 'system_init',
        relatedType: 'system',
        status: 'completed',
        transactionAt: new Date('2024-01-01T00:00:00')
      });
      balance += 500;

      // 创建一些历史签到记录
      const signInDates = [
        new Date('2024-01-10T09:00:00'),
        new Date('2024-01-11T09:15:00'),
        new Date('2024-01-12T08:45:00'),
        new Date('2024-01-13T09:30:00'),
        new Date('2024-01-14T09:10:00')
      ];

      for (const date of signInDates) {
        await CurrencyTransaction.create({
          userId: user.id,
          type: 'income',
          currency: 'gold',
          amount: 100,
          balanceBefore: balance,
          balanceAfter: balance + 100,
          description: '每日签到奖励',
          source: 'daily_checkin',
          relatedType: 'checkin',
          status: 'completed',
          transactionAt: date
        });
        balance += 100;
      }

      // 如果是管理员，创建额外的钻石奖励
      if (user.role === 'admin') {
        await CurrencyTransaction.create({
          userId: user.id,
          type: 'income',
          currency: 'diamond',
          amount: 100,
          balanceBefore: 0,
          balanceAfter: 100,
          description: '管理员特权奖励',
          source: 'admin_bonus',
          relatedType: 'system',
          status: 'completed',
          transactionAt: new Date('2024-01-01T00:01:00')
        });
      }

      console.log(`✅ 为用户 ${user.username} 创建了示例交易记录`);
    }

    const totalTransactions = await CurrencyTransaction.count();
    console.log(`🎉 迁移完成！共创建了 ${totalTransactions} 条交易记录`);

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateTransactions()
    .then(() => {
      console.log('✅ 迁移脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = migrateTransactions;
