const config = require('../config');
const TransactionService = require('./TransactionService');
const { UserWallet } = require('../models');

class CheckinService {
  /**
   * 计算用户每日签到奖励
   * @param {Object} user 用户对象
   * @returns {Object} 奖励详情
   */
  static calculateDailyReward(user) {
    const checkinConfig = config.gamification.dailyCheckin;
    const baseRewards = checkinConfig.baseRewards;
    const roleBonus = checkinConfig.roleBonus[user.role] || checkinConfig.roleBonus.developer;

    // 计算最终奖励（基础奖励 + 角色奖励）
    const finalRewards = {};
    const currencies = ['diamond', 'gold', 'silver', 'copper'];

    currencies.forEach(currency => {
      const baseAmount = baseRewards[currency] || 0;
      const bonusAmount = roleBonus[currency] || 0;
      const totalAmount = baseAmount + bonusAmount;

      if (totalAmount > 0) {
        finalRewards[currency] = totalAmount;
      }
    });

    // 生成奖励描述
    const rewardParts = [];
    if (finalRewards.diamond) rewardParts.push(`${finalRewards.diamond}钻石`);
    if (finalRewards.gold) rewardParts.push(`${finalRewards.gold}金币`);
    if (finalRewards.silver) rewardParts.push(`${finalRewards.silver}银币`);
    if (finalRewards.copper) rewardParts.push(`${finalRewards.copper}铜币`);

    // 转换为奖励对象数组格式
    const rewardObjects = Object.entries(finalRewards).map(([currency, amount]) => ({
      currency,
      amount,
      description: this.getRewardDescription(user.role, currency)
    }));

    return {
      rewards: rewardObjects,
      description: `每日签到成功！获得 ${rewardParts.join('、')}`
    };
  }

  /**
   * 获取奖励描述
   * @param {string} userRole 用户角色
   * @param {string} currency 货币类型
   * @returns {string} 奖励描述
   */
  static getRewardDescription(userRole, currency) {
    if (userRole === 'client') {
      return '委托贵族签到奖励';
    } else if (userRole === 'admin') {
      return '管理员签到奖励';
    } else {
      return '每日签到奖励';
    }
  }

  /**
   * 执行每日签到
   * @param {string} userId 用户ID
   * @param {Object} user 用户对象
   * @returns {Promise<Object>} 签到结果
   */
  static async performDailyCheckin(userId, user) {
    try {
      // 检查钱包是否存在
      const wallet = await UserWallet.findOne({
        where: { userId }
      });

      if (!wallet) {
        throw new Error('用户钱包不存在');
      }

      // 检查是否已经签到过
      const today = new Date();
      const lastCheckin = wallet.lastDailyRechargeAt;

      if (lastCheckin) {
        const lastCheckinDate = new Date(lastCheckin);
        if (lastCheckinDate.toDateString() === today.toDateString()) {
          throw new Error('今日已签到过了');
        }
      }

      // 计算奖励
      const rewardInfo = this.calculateDailyReward(user);
      const transactionResults = [];

      // 创建每种货币的交易记录
      for (const reward of rewardInfo.rewards) {
        const result = await TransactionService.createTransaction({
          userId,
          type: 'income',
          currency: reward.currency,
          amount: reward.amount,
          description: reward.description,
          source: 'daily_checkin',
          relatedType: 'checkin'
        });
        transactionResults.push(result);
      }

      // 更新签到时间
      await wallet.update({
        lastDailyRechargeAt: today
      });

      // 计算总奖励摘要
      const rewardSummary = {};
      rewardInfo.rewards.forEach(reward => {
        rewardSummary[reward.currency] = reward.amount;
      });

      return {
        success: true,
        message: rewardInfo.description,
        rewards: rewardSummary,
        transactions: transactionResults
      };

    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 检查用户是否可以签到
   * @param {string} userId 用户ID
   * @returns {Promise<boolean>} 是否可以签到
   */
  static async canCheckin(userId) {
    try {
      const wallet = await UserWallet.findOne({
        where: { userId }
      });

      if (!wallet) {
        return false;
      }

      const today = new Date();
      const lastCheckin = wallet.lastDailyRechargeAt;

      if (!lastCheckin) {
        return true;
      }

      const lastCheckinDate = new Date(lastCheckin);
      return lastCheckinDate.toDateString() !== today.toDateString();

    } catch (error) {
      return false;
    }
  }

  /**
   * 获取用户角色的签到奖励预览
   * @param {Object} user 用户对象
   * @returns {Object} 奖励预览
   */
  static getRewardPreview(user) {
    const rewardInfo = this.calculateDailyReward(user);
    const preview = {};

    rewardInfo.rewards.forEach(reward => {
      preview[reward.currency] = reward.amount;
    });

    return {
      rewards: preview,
      description: rewardInfo.description
    };
  }
}

module.exports = CheckinService;
