const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BountyTask = sequelize.define('BountyTask', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      len: [5, 200]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // 任务类型
  taskType: {
    type: DataTypes.ENUM('requirement', 'task', 'bug', 'epic', 'story'),
    defaultValue: 'task',
    field: 'task_type'
  },
  // 星级难度
  starLevel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'star_level',
    validate: {
      min: 1,
      max: 5
    }
  },
  // 紧急程度
  urgencyLevel: {
    type: DataTypes.ENUM('urgent', 'important', 'normal', 'delayed', 'frozen'),
    defaultValue: 'normal',
    field: 'urgency_level'
  },
  // 技能要求
  skillRequired: {
    type: DataTypes.ENUM('novice', 'bronze', 'silver', 'gold', 'diamond'),
    defaultValue: 'novice',
    field: 'skill_required'
  },
  // 任务状态
  status: {
    type: DataTypes.ENUM('draft', 'published', 'bidding', 'assigned', 'in_progress', 'review', 'completed', 'cancelled'),
    defaultValue: 'draft'
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  publisherId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'publisher_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  assigneeId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assignee_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  parentTaskId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_task_id',
    references: {
      model: 'bounty_tasks',
      key: 'id'
    }
  },
  // 任务层级管理
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 3
    },
    comment: '任务层级，0为根任务，最大3级'
  },
  path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '任务路径，如：1/2/3'
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'sort_order',
    comment: '同级任务排序'
  },
  // 奖励配置
  baseReward: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'base_reward',
    validate: {
      min: 0
    }
  },
  bonusReward: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'bonus_reward',
    validate: {
      min: 0
    }
  },
  rewardCurrency: {
    type: DataTypes.ENUM('diamond', 'gold', 'silver', 'copper'),
    defaultValue: 'gold',
    field: 'reward_currency'
  },
  totalBudget: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_budget',
    validate: {
      min: 0
    }
  },
  // 工时相关
  estimatedHours: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'estimated_hours',
    validate: {
      min: 0
    }
  },
  actualHours: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    field: 'actual_hours',
    validate: {
      min: 0
    }
  },
  // 时间相关
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  },
  // 任务标签
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  // 附加信息
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {
      priority: 'medium',
      complexity: 'medium',
      estimationMethod: 'expert',
      acceptanceCriteria: [],
      attachments: [],
      comments: []
    }
  }
}, {
  tableName: 'bounty_tasks',
  indexes: [
    {
      fields: ['project_id']
    },
    {
      fields: ['publisher_id']
    },
    {
      fields: ['assignee_id']
    },
    {
      fields: ['parent_task_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['star_level']
    },
    {
      fields: ['urgency_level']
    },
    {
      fields: ['skill_required']
    },
    {
      fields: ['due_date']
    }
  ]
});

// 实例方法
BountyTask.prototype.getTotalReward = function() {
  return this.baseReward + this.bonusReward;
};

BountyTask.prototype.isOverdue = function() {
  return this.dueDate && new Date() > this.dueDate;
};

BountyTask.prototype.getHoursOverrun = function() {
  if (!this.estimatedHours || !this.actualHours) {
    return 0;
  }
  return Math.max(0, this.actualHours - this.estimatedHours);
};

BountyTask.prototype.getHoursOverrunPercentage = function() {
  if (!this.estimatedHours || this.estimatedHours === 0) {
    return 0;
  }
  const overrun = this.getHoursOverrun();
  return (overrun / this.estimatedHours) * 100;
};

BountyTask.prototype.calculateFinalReward = function() {
  const config = require('../config');
  let finalReward = this.baseReward;

  // 星级奖励倍数
  const starMultiplier = config.gamification.starMultipliers[this.starLevel] || 1.0;
  finalReward *= starMultiplier;

  // 紧急程度奖励
  const urgencyMultiplier = config.gamification.urgencyMultipliers[this.urgencyLevel] || 1.0;
  finalReward *= urgencyMultiplier;

  // 工时达标奖励
  if (this.actualHours && this.estimatedHours) {
    if (this.actualHours <= this.estimatedHours) {
      // 工时达标，获得奖励金
      finalReward += this.bonusReward;
    } else {
      // 工时超标，按比例扣除
      const overrunPercentage = this.getHoursOverrunPercentage();
      let discountFactor = 1.0;

      if (overrunPercentage <= 20) {
        discountFactor = 0.9;
      } else if (overrunPercentage <= 50) {
        discountFactor = 0.8;
      } else if (overrunPercentage <= 100) {
        discountFactor = 0.7;
      } else {
        discountFactor = 0.6;
      }

      finalReward *= discountFactor;
    }
  }

  return Math.round(finalReward);
};

BountyTask.prototype.canBeBidBy = function(userId, userSkillLevel) {
  // 检查技能要求
  const skillLevels = ['novice', 'bronze', 'silver', 'gold', 'diamond'];
  const requiredIndex = skillLevels.indexOf(this.skillRequired);
  const userIndex = skillLevels.indexOf(userSkillLevel);

  return userIndex >= requiredIndex && this.status === 'published';
};

// 类方法
BountyTask.findAvailableForUser = function(userId, userSkillLevel) {
  const skillLevels = ['novice', 'bronze', 'silver', 'gold', 'diamond'];
  const userIndex = skillLevels.indexOf(userSkillLevel);
  const availableSkills = skillLevels.slice(0, userIndex + 1);

  return this.findAll({
    where: {
      status: 'published',
      skillRequired: availableSkills
    },
    order: [['createdAt', 'DESC']]
  });
};

module.exports = BountyTask;
