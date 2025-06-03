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
   */
  static getExchangeRate(fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return 1; // 相同货币比例为1:1
    }

    const rates = config.gamification.exchangeRates;
    const exchangeKey = `${fromCurrency}_to_${toCurrency}`;

    // 直接查找配置中的兑换比例
    if (rates[exchangeKey]) {
      return rates[exchangeKey];
    }

    // 如果没有直接配置，尝试反向查找
    const reverseKey = `${toCurrency}_to_${fromCurrency}`;
    if (rates[reverseKey]) {
      return 1 / rates[reverseKey]; // 反向比例
    }

    // 如果都没有，返回默认比例1000
    return 1000;
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

    // 执行兑换
    const fromBalanceField = `${fromCurrency}Balance`;
    const toBalanceField = `${toCurrency}Balance`;

    const updateData = {
      [fromBalanceField]: wallet[fromBalanceField] - fromAmount,
      [toBalanceField]: wallet[toBalanceField] + toAmount
    };

    await wallet.update(updateData);

    // 获取货币信息
    const fromCurrencyInfo = this.getCurrencyInfo(fromCurrency);
    const toCurrencyInfo = this.getCurrencyInfo(toCurrency);

    // 记录交易
    await TransactionService.createTransaction({
      userId,
      type: 'exchange_out',
      currency: fromCurrency,
      amount: fromAmount,
      description: `兑换${fromCurrencyInfo.name}为${toCurrencyInfo.name}`,
      source: 'currency_exchange'
    });

    await TransactionService.createTransaction({
      userId,
      type: 'exchange_in',
      currency: toCurrency,
      amount: toAmount,
      description: `兑换获得${toCurrencyInfo.name}`,
      source: 'currency_exchange'
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
        newFromBalance: wallet[fromBalanceField],
        newToBalance: wallet[toBalanceField]
      }
    };
  }
}

module.exports = ExchangeService;
