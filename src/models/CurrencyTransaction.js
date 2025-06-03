const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CurrencyTransaction = sequelize.define('CurrencyTransaction', {
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
  // 交易类型
  type: {
    type: DataTypes.ENUM('income', 'expense', 'transfer_in', 'transfer_out', 'freeze', 'unfreeze'),
    allowNull: false,
    comment: 'income: 收入, expense: 支出, transfer_in: 转入, transfer_out: 转出, freeze: 冻结, unfreeze: 解冻'
  },
  // 货币类型
  currency: {
    type: DataTypes.ENUM('diamond', 'gold', 'silver', 'copper'),
    allowNull: false
  },
  // 交易金额
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  // 交易前余额
  balanceBefore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'balance_before',
    validate: {
      min: 0
    }
  },
  // 交易后余额
  balanceAfter: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'balance_after',
    validate: {
      min: 0
    }
  },
  // 交易描述
  description: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  // 交易来源/目标
  source: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '交易来源，如: daily_checkin, task_reward, task_publish, transfer等'
  },
  // 关联的业务ID（如任务ID、转账ID等）
  relatedId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'related_id',
    comment: '关联的业务对象ID，如任务ID、转账记录ID等'
  },
  // 关联的业务类型
  relatedType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'related_type',
    comment: '关联的业务类型，如: task, transfer, checkin等'
  },
  // 转账相关字段
  fromUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'from_user_id',
    references: {
      model: 'users',
      key: 'id'
    },
    comment: '转账发起用户ID（仅转账交易使用）'
  },
  toUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'to_user_id',
    references: {
      model: 'users',
      key: 'id'
    },
    comment: '转账接收用户ID（仅转账交易使用）'
  },
  // 交易状态
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
    defaultValue: 'completed',
    comment: 'pending: 待处理, completed: 已完成, failed: 失败, cancelled: 已取消'
  },
  // 交易备注
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '交易备注信息'
  },
  // 交易时间
  transactionAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'transaction_at'
  }
}, {
  tableName: 'currency_transactions',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['currency']
    },
    {
      fields: ['transaction_at']
    },
    {
      fields: ['source']
    },
    {
      fields: ['related_id', 'related_type']
    },
    {
      fields: ['from_user_id']
    },
    {
      fields: ['to_user_id']
    },
    {
      fields: ['status']
    }
  ]
});

// 实例方法
CurrencyTransaction.prototype.getDisplayAmount = function() {
  const sign = this.type === 'income' || this.type === 'transfer_in' ? '+' : '-';
  return `${sign}${this.amount.toLocaleString()}`;
};

CurrencyTransaction.prototype.getTypeDisplay = function() {
  const typeMap = {
    income: '收入',
    expense: '支出',
    transfer_in: '转入',
    transfer_out: '转出',
    freeze: '冻结',
    unfreeze: '解冻'
  };
  return typeMap[this.type] || this.type;
};

CurrencyTransaction.prototype.getCurrencyDisplay = function() {
  const currencyMap = {
    diamond: '钻石',
    gold: '金币',
    silver: '银币',
    copper: '铜币'
  };
  return currencyMap[this.currency] || this.currency;
};

module.exports = CurrencyTransaction;
