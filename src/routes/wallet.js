const express = require('express');
const { UserWallet, User } = require('../models');
const config = require('../config');
const logger = require('../config/logger');
const TransactionService = require('../services/TransactionService');
const CheckinService = require('../services/CheckinService');
const ExchangeService = require('../services/ExchangeService');

const router = express.Router();

// 认证中间件
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: '请先登录'
    });
  }
  next();
};

// 获取钱包余额
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const wallet = await UserWallet.findOne({
      where: { userId: req.session.userId }
    });

    if (!wallet) {
      // 如果钱包不存在，创建一个
      const newWallet = await UserWallet.create({
        userId: req.session.userId
      });

      return res.json({
        success: true,
        data: newWallet
      });
    }

    res.json({
      success: true,
      data: wallet
    });

  } catch (error) {
    logger.error('获取钱包余额失败:', error);
    res.status(500).json({
      success: false,
      message: '获取钱包余额失败'
    });
  }
});

// 每日签到奖励
router.post('/daily-checkin', requireAuth, async (req, res) => {
  try {
    // 获取用户信息
    const user = await User.findByPk(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 执行签到
    const result = await CheckinService.performDailyCheckin(req.session.userId, user);

    if (result.success) {
      logger.info(`用户每日签到: ${req.session.userId}`, {
        role: user.role,
        rewards: result.rewards
      });

      res.json({
        success: true,
        message: result.message,
        data: {
          rewards: result.rewards,
          userRole: user.role
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error('每日签到失败:', error);
    res.status(500).json({
      success: false,
      message: '签到失败，请稍后重试'
    });
  }
});

// 月度充值奖励
router.post('/monthly-recharge', requireAuth, async (req, res) => {
  try {
    const wallet = await UserWallet.findOne({
      where: { userId: req.session.userId }
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: '钱包不存在'
      });
    }

    const today = new Date();
    const lastRecharge = wallet.lastMonthlyRechargeAt;

    // 检查是否已经领取过本月奖励
    if (lastRecharge) {
      const lastRechargeDate = new Date(lastRecharge);
      if (lastRechargeDate.getMonth() === today.getMonth() &&
          lastRechargeDate.getFullYear() === today.getFullYear()) {
        return res.status(400).json({
          success: false,
          message: '本月已领取过奖励了'
        });
      }
    }

    // 发放月度奖励
    const monthlyGoldReward = config.gamification.monthlyCoinReward;
    const monthlyDiamondReward = config.gamification.monthlyDiamondReward;

    await wallet.update({
      goldBalance: wallet.goldBalance + monthlyGoldReward,
      diamondBalance: wallet.diamondBalance + monthlyDiamondReward,
      totalEarned: wallet.totalEarned + monthlyGoldReward + (monthlyDiamondReward * 1000), // 钻石按1000金币计算
      lastMonthlyRechargeAt: today
    });

    logger.info(`用户月度充值: ${req.session.userId}`, {
      goldReward: monthlyGoldReward,
      diamondReward: monthlyDiamondReward
    });

    res.json({
      success: true,
      message: `月度充值成功！获得 ${monthlyGoldReward} 金币和 ${monthlyDiamondReward} 钻石`,
      data: {
        goldReward: monthlyGoldReward,
        diamondReward: monthlyDiamondReward,
        newGoldBalance: wallet.goldBalance + monthlyGoldReward,
        newDiamondBalance: wallet.diamondBalance + monthlyDiamondReward
      }
    });

  } catch (error) {
    logger.error('月度充值失败:', error);
    res.status(500).json({
      success: false,
      message: '充值失败，请稍后重试'
    });
  }
});

// 获取交易历史（简化版）
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    // 这里应该从交易记录表获取，暂时返回空数组
    res.json({
      success: true,
      data: {
        transactions: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0
        }
      }
    });

  } catch (error) {
    logger.error('获取交易历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取交易历史失败'
    });
  }
});

// 获取钱包统计信息
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const wallet = await UserWallet.findOne({
      where: { userId: req.session.userId }
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: '钱包不存在'
      });
    }

    // 计算总资产（以铜币为单位）
    const rates = config.gamification.currencyRates;
    const totalAssets =
      wallet.diamondBalance * rates.diamond * rates.gold * rates.silver +
      wallet.goldBalance * rates.gold * rates.silver +
      wallet.silverBalance * rates.silver +
      wallet.copperBalance;

    const stats = {
      totalAssets,
      totalEarned: wallet.totalEarned,
      totalSpent: wallet.totalSpent,
      balances: {
        diamond: wallet.diamondBalance,
        gold: wallet.goldBalance,
        silver: wallet.silverBalance,
        copper: wallet.copperBalance
      },
      frozenBalances: {
        diamond: wallet.frozenDiamond,
        gold: wallet.frozenGold,
        silver: wallet.frozenSilver,
        copper: wallet.frozenCopper
      },
      lastCheckin: wallet.lastDailyRechargeAt,
      lastMonthlyRecharge: wallet.lastMonthlyRechargeAt
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('获取钱包统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取钱包统计失败'
    });
  }
});



// 执行货币兑换
router.post('/exchange', requireAuth, async (req, res) => {
  try {
    const { fromCurrency, toCurrency, fromAmount } = req.body;

    if (!fromCurrency || !toCurrency || !fromAmount) {
      return res.status(400).json({
        success: false,
        message: '请选择兑换币种和数量'
      });
    }

    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: '兑换数量必须是正数'
      });
    }

    // 执行兑换
    const result = await ExchangeService.performExchange(
      req.session.userId,
      fromCurrency,
      toCurrency,
      amount
    );

    res.json(result);

  } catch (error) {
    logger.error('货币兑换失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '兑换失败，请稍后重试'
    });
  }
});

// 获取兑换比例
router.get('/exchange-rate/:from/:to', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.params;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: '请指定兑换币种'
      });
    }

    const rate = ExchangeService.getExchangeRate(from, to);
    const fromInfo = ExchangeService.getCurrencyInfo(from);
    const toInfo = ExchangeService.getCurrencyInfo(to);

    res.json({
      success: true,
      data: {
        rate,
        fromCurrency: from,
        toCurrency: to,
        fromName: fromInfo?.name || from,
        toName: toInfo?.name || to
      }
    });

  } catch (error) {
    logger.error('获取兑换比例失败:', error);
    res.status(500).json({
      success: false,
      message: '获取兑换比例失败'
    });
  }
});

module.exports = router;
