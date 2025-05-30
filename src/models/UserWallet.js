const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserWallet = sequelize.define('UserWallet', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // 可用余额
  diamondBalance: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'diamond_balance',
    validate: {
      min: 0
    }
  },
  goldBalance: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'gold_balance',
    validate: {
      min: 0
    }
  },
  silverBalance: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'silver_balance',
    validate: {
      min: 0
    }
  },
  copperBalance: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'copper_balance',
    validate: {
      min: 0
    }
  },
  // 冻结金额（用于任务预扣）
  frozenDiamond: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'frozen_diamond',
    validate: {
      min: 0
    }
  },
  frozenGold: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'frozen_gold',
    validate: {
      min: 0
    }
  },
  frozenSilver: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'frozen_silver',
    validate: {
      min: 0
    }
  },
  frozenCopper: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'frozen_copper',
    validate: {
      min: 0
    }
  },
  // 累计收入（用于排行榜）
  totalEarned: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_earned',
    validate: {
      min: 0
    }
  },
  // 累计支出
  totalSpent: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_spent',
    validate: {
      min: 0
    }
  },
  // 最后充值时间
  lastRechargeAt: {
    type: DataTypes.DATE,
    field: 'last_recharge_at'
  },
  // 最后日充值时间
  lastDailyRechargeAt: {
    type: DataTypes.DATE,
    field: 'last_daily_recharge_at'
  },
  // 最后月充值时间
  lastMonthlyRechargeAt: {
    type: DataTypes.DATE,
    field: 'last_monthly_recharge_at'
  }
}, {
  tableName: 'user_wallets',
  indexes: [
    {
      unique: true,
      fields: ['user_id']
    },
    {
      fields: ['total_earned']
    }
  ]
});

// 实例方法
UserWallet.prototype.getTotalBalance = function() {
  const config = require('../config');
  const rates = config.gamification.currencyRates;
  
  return this.diamondBalance * rates.diamond * rates.gold * rates.silver +
         this.goldBalance * rates.gold * rates.silver +
         this.silverBalance * rates.silver +
         this.copperBalance;
};

UserWallet.prototype.getAvailableBalance = function(currency) {
  switch (currency) {
    case 'diamond':
      return this.diamondBalance;
    case 'gold':
      return this.goldBalance;
    case 'silver':
      return this.silverBalance;
    case 'copper':
      return this.copperBalance;
    default:
      return 0;
  }
};

UserWallet.prototype.getFrozenBalance = function(currency) {
  switch (currency) {
    case 'diamond':
      return this.frozenDiamond;
    case 'gold':
      return this.frozenGold;
    case 'silver':
      return this.frozenSilver;
    case 'copper':
      return this.frozenCopper;
    default:
      return 0;
  }
};

UserWallet.prototype.hasEnoughBalance = function(currency, amount) {
  return this.getAvailableBalance(currency) >= amount;
};

// 冻结资金
UserWallet.prototype.freezeAmount = async function(currency, amount) {
  if (!this.hasEnoughBalance(currency, amount)) {
    throw new Error('余额不足');
  }
  
  const balanceField = `${currency}Balance`;
  const frozenField = `frozen${currency.charAt(0).toUpperCase() + currency.slice(1)}`;
  
  this[balanceField] -= amount;
  this[frozenField] += amount;
  
  return this.save();
};

// 解冻资金
UserWallet.prototype.unfreezeAmount = async function(currency, amount) {
  const balanceField = `${currency}Balance`;
  const frozenField = `frozen${currency.charAt(0).toUpperCase() + currency.slice(1)}`;
  
  if (this[frozenField] < amount) {
    throw new Error('冻结金额不足');
  }
  
  this[balanceField] += amount;
  this[frozenField] -= amount;
  
  return this.save();
};

module.exports = UserWallet;
