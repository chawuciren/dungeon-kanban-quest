const { UserWallet } = require('../models');
const config = require('../config');
const logger = require('../config/logger');
const TransactionService = require('./TransactionService');

class ExchangeService {
  /**
   * 获取所有支持的货币类型
   */
  static getSupportedCurrencies() {
    return [
      {
        key: 'diamond',
        name: '钻石',
        icon: 'fas fa-gem',
        color: '#00bcd4'
      },
      {
        key: 'gold',
        name: '金币',
        icon: 'fas fa-coins',
        color: '#ffd700'
      },
      {
        key: 'silver',
        name: '银币',
        icon: 'fas fa-coins',
        color: '#c0c0c0'
      },
      {
        key: 'copper',
        name: '铜币',
        icon: 'fas fa-coins',
        color: '#2d5016'
      }
    ];
  }

  /**
   * 获取两种货币之间的兑换比例
   * 返回的比例表示：1个fromCurrency可以换多少个toCurrency
   */
  static getExchangeRate(fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return 1; // 相同货币比例为1:1
    }

    const rates = config.gamification.exchangeRates;

    // 直接查找配置中的兑换比例
    const exchangeKey = `${fromCurrency}_to_${toCurrency}`;
    if (rates[exchangeKey]) {
      // 配置中的值表示需要多少个fromCurrency换1个toCurrency
      // 所以1个fromCurrency可以换 1/配置值 个toCurrency
      return 1 / rates[exchangeKey];
    }

    // 如果没有直接配置，尝试反向查找
    const reverseKey = `${toCurrency}_to_${fromCurrency}`;
    if (rates[reverseKey]) {
      // 反向配置表示需要多少个toCurrency换1个fromCurrency
      // 所以1个fromCurrency可以换 配置值 个toCurrency
      return rates[reverseKey];
    }

    // 如果都没有直接配置，通过级联计算
    const currencyLevels = {
      copper: 1,
      silver: 2,
      gold: 3,
      diamond: 4
    };

    const fromLevel = currencyLevels[fromCurrency];
    const toLevel = currencyLevels[toCurrency];

    if (!fromLevel || !toLevel) {
      return 0.001; // 默认比例：1000:1
    }

    if (fromLevel > toLevel) {
      // 高级货币换低级货币，累乘反向比例
      let rate = 1;
      for (let level = fromLevel; level > toLevel; level--) {
        const currentCurrency = Object.keys(currencyLevels).find(key => currencyLevels[key] === level);
        const nextCurrency = Object.keys(currencyLevels).find(key => currencyLevels[key] === level - 1);
        const stepKey = `${nextCurrency}_to_${currentCurrency}`;
        rate *= (rates[stepKey] || 1000);
      }
      return rate;
    } else {
      // 低级货币换高级货币，累除正向比例
      let rate = 1;
      for (let level = fromLevel; level < toLevel; level++) {
        const currentCurrency = Object.keys(currencyLevels).find(key => currencyLevels[key] === level);
        const nextCurrency = Object.keys(currencyLevels).find(key => currencyLevels[key] === level + 1);
        const stepKey = `${currentCurrency}_to_${nextCurrency}`;
        rate *= (rates[stepKey] || 1000);
      }
      return 1 / rate;
    }
  }

  /**
   * 获取货币信息
   */
  static getCurrencyInfo(currencyKey) {
    const currencies = this.getSupportedCurrencies();
    return currencies.find(c => c.key === currencyKey);
  }

  /**
   * 计算兑换结果（根据原始币数量计算目标币数量）
   */
  static calculateFromAmount(fromCurrency, toCurrency, fromAmount) {
    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      return { fromAmount: 0, toAmount: 0, rate: 0 };
    }

    const rate = this.getExchangeRate(fromCurrency, toCurrency);
    const toAmount = Math.floor(amount * rate);

    return {
      fromAmount: amount,
      toAmount,
      rate,
      fromCurrency,
      toCurrency
    };
  }

  /**
   * 计算兑换结果（根据目标币数量计算原始币数量）
   */
  static calculateToAmount(fromCurrency, toCurrency, toAmount) {
    const amount = parseFloat(toAmount);
    if (isNaN(amount) || amount <= 0) {
      return { fromAmount: 0, toAmount: 0, rate: 0 };
    }

    const rate = this.getExchangeRate(fromCurrency, toCurrency);
    const fromAmount = Math.ceil(amount / rate); // 向上取整，确保能兑换到足够的目标币

    return {
      fromAmount,
      toAmount: amount,
      rate,
      fromCurrency,
      toCurrency
    };
  }

  /**
   * 验证兑换是否可行
   */
  static validateExchange(fromCurrency, toCurrency, fromAmount, userWallet) {
    if (fromCurrency === toCurrency) {
      return { valid: false, message: '不能兑换相同的货币' };
    }

    if (!fromAmount || fromAmount <= 0) {
      return { valid: false, message: '兑换数量必须大于0' };
    }

    const balanceField = `${fromCurrency}Balance`;
    const currentBalance = userWallet[balanceField] || 0;

    if (currentBalance < fromAmount) {
      const currencyInfo = this.getCurrencyInfo(fromCurrency);
      return { valid: false, message: `${currencyInfo.name}余额不足` };
    }

    return { valid: true };
  }

  /**
   * 测试兑换比例计算（用于调试）
   */
  static testExchangeRates() {
    const currencies = ['diamond', 'gold', 'silver', 'copper'];
    console.log('=== 兑换比例测试 ===');

    for (const from of currencies) {
      for (const to of currencies) {
        if (from !== to) {
          const rate = this.getExchangeRate(from, to);
          console.log(`${from} -> ${to}: 1:${rate}`);
        }
      }
    }
  }

  /**
   * 执行货币兑换
   */
  static async performExchange(userId, fromCurrency, toCurrency, fromAmount) {
    // 获取用户钱包
    const wallet = await UserWallet.findOne({
      where: { userId }
    });

    if (!wallet) {
      throw new Error('用户钱包不存在');
    }

    // 验证兑换
    const validation = this.validateExchange(fromCurrency, toCurrency, fromAmount, wallet);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    // 计算兑换结果
    const calculation = this.calculateFromAmount(fromCurrency, toCurrency, fromAmount);
    const { toAmount } = calculation;

    if (toAmount <= 0) {
      throw new Error('兑换数量不足，无法完成兑换');
    }

    // 获取货币信息
    const fromCurrencyInfo = this.getCurrencyInfo(fromCurrency);
    const toCurrencyInfo = this.getCurrencyInfo(toCurrency);

    // 记录交易（TransactionService会自动更新钱包余额）
    await TransactionService.createTransaction({
      userId,
      type: 'expense',
      currency: fromCurrency,
      amount: fromAmount,
      description: `兑换${fromCurrencyInfo.name}为${toCurrencyInfo.name}`,
      source: 'currency_exchange'
    });

    await TransactionService.createTransaction({
      userId,
      type: 'income',
      currency: toCurrency,
      amount: toAmount,
      description: `兑换获得${toCurrencyInfo.name}`,
      source: 'currency_exchange'
    });

    // 重新获取更新后的钱包信息
    const updatedWallet = await UserWallet.findOne({
      where: { userId }
    });

    logger.info(`用户货币兑换: ${userId}`, {
      fromCurrency,
      toCurrency,
      fromAmount,
      toAmount,
      rate: calculation.rate
    });

    return {
      success: true,
      message: `兑换成功！消耗 ${fromAmount.toLocaleString()} ${fromCurrencyInfo.name}，获得 ${toAmount.toLocaleString()} ${toCurrencyInfo.name}`,
      data: {
        fromCurrency,
        toCurrency,
        fromAmount,
        toAmount,
        rate: calculation.rate,
        newFromBalance: updatedWallet[`${fromCurrency}Balance`],
        newToBalance: updatedWallet[`${toCurrency}Balance`]
      }
    };
  }
}

module.exports = ExchangeService;
