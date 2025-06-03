const { UserWallet, CurrencyTransaction, User } = require('../models');
const { sequelize } = require('../config/database');

class TransactionService {
  /**
   * 创建交易记录
   * @param {Object} params 交易参数
   * @param {string} params.userId 用户ID
   * @param {string} params.type 交易类型 (income, expense, transfer_in, transfer_out, freeze, unfreeze)
   * @param {string} params.currency 货币类型 (diamond, gold, silver, copper)
   * @param {number} params.amount 交易金额
   * @param {string} params.description 交易描述
   * @param {string} params.source 交易来源
   * @param {string} params.relatedId 关联业务ID
   * @param {string} params.relatedType 关联业务类型
   * @param {string} params.fromUserId 转账发起用户ID（仅转账使用）
   * @param {string} params.toUserId 转账接收用户ID（仅转账使用）
   * @param {string} params.notes 交易备注
   * @returns {Promise<Object>} 交易结果
   */
  static async createTransaction(params) {
    const transaction = await sequelize.transaction();

    try {
      const {
        userId,
        type,
        currency,
        amount,
        description,
        source = null,
        relatedId = null,
        relatedType = null,
        fromUserId = null,
        toUserId = null,
        notes = null
      } = params;

      // 获取用户钱包
      const wallet = await UserWallet.findOne({
        where: { userId },
        transaction
      });

      if (!wallet) {
        throw new Error('用户钱包不存在');
      }

      // 获取当前余额
      const balanceField = `${currency}Balance`;
      const currentBalance = wallet[balanceField];

      // 计算新余额
      let newBalance;
      if (type === 'income' || type === 'transfer_in' || type === 'unfreeze') {
        newBalance = currentBalance + amount;
      } else if (type === 'expense' || type === 'transfer_out' || type === 'freeze') {
        if (currentBalance < amount) {
          throw new Error(`${currency}余额不足`);
        }
        newBalance = currentBalance - amount;
      } else {
        throw new Error('无效的交易类型');
      }

      // 更新钱包余额
      await wallet.update({
        [balanceField]: newBalance
      }, { transaction });

      // 如果是收入，更新总收入
      if (type === 'income') {
        await wallet.update({
          totalEarned: wallet.totalEarned + amount
        }, { transaction });
      }

      // 如果是支出，更新总支出
      if (type === 'expense') {
        await wallet.update({
          totalSpent: wallet.totalSpent + amount
        }, { transaction });
      }

      // 创建交易记录
      const transactionRecord = await CurrencyTransaction.create({
        userId,
        type,
        currency,
        amount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        description,
        source,
        relatedId,
        relatedType,
        fromUserId,
        toUserId,
        notes,
        status: 'completed',
        transactionAt: new Date()
      }, { transaction });

      await transaction.commit();

      return {
        success: true,
        transaction: transactionRecord,
        wallet: await UserWallet.findByPk(wallet.id)
      };

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * 获取用户交易记录
   * @param {string} userId 用户ID
   * @param {Object} options 查询选项
   * @param {number} options.page 页码
   * @param {number} options.limit 每页数量
   * @param {string} options.type 交易类型筛选
   * @param {string} options.currency 货币类型筛选
   * @returns {Promise<Object>} 交易记录和分页信息
   */
  static async getUserTransactions(userId, options = {}) {
    const {
      page = 1,
      limit = 10,
      type = null,
      currency = null
    } = options;

    const where = { userId };

    if (type) {
      where.type = type;
    }

    if (currency) {
      where.currency = currency;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await CurrencyTransaction.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'fromUser',
          attributes: ['id', 'firstName', 'lastName', 'username'],
          required: false
        },
        {
          model: User,
          as: 'toUser',
          attributes: ['id', 'firstName', 'lastName', 'username'],
          required: false
        }
      ],
      order: [['transactionAt', 'DESC']],
      limit,
      offset
    });

    return {
      transactions: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    };
  }

  /**
   * 每日签到奖励（已废弃，请使用CheckinService）
   * @deprecated 请使用CheckinService.performDailyCheckin()
   */
  static async dailyCheckin(userId, amount = 100) {
    console.warn('TransactionService.dailyCheckin已废弃，请使用CheckinService.performDailyCheckin');
    return await this.createTransaction({
      userId,
      type: 'income',
      currency: 'gold',
      amount,
      description: '每日签到奖励',
      source: 'daily_checkin',
      relatedType: 'checkin'
    });
  }

  /**
   * 任务奖励
   * @param {string} userId 用户ID
   * @param {string} taskId 任务ID
   * @param {number} amount 奖励金额
   * @param {string} currency 货币类型
   * @param {string} taskTitle 任务标题
   * @returns {Promise<Object>} 交易结果
   */
  static async taskReward(userId, taskId, amount, currency, taskTitle) {
    return await this.createTransaction({
      userId,
      type: 'income',
      currency,
      amount,
      description: `完成任务：${taskTitle}`,
      source: 'task_reward',
      relatedId: taskId,
      relatedType: 'task'
    });
  }

  /**
   * 发布任务扣费
   * @param {string} userId 用户ID
   * @param {string} taskId 任务ID
   * @param {number} amount 扣费金额
   * @param {string} currency 货币类型
   * @param {string} taskTitle 任务标题
   * @returns {Promise<Object>} 交易结果
   */
  static async taskPublish(userId, taskId, amount, currency, taskTitle) {
    return await this.createTransaction({
      userId,
      type: 'expense',
      currency,
      amount,
      description: `发布任务：${taskTitle}`,
      source: 'task_publish',
      relatedId: taskId,
      relatedType: 'task'
    });
  }
}

module.exports = TransactionService;
