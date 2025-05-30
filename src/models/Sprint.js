const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Sprint = sequelize.define('Sprint', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [2, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // 探险季目标
  goal: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [5, 1000]
    }
  },
  // 探险季状态
  status: {
    type: DataTypes.ENUM('planning', 'active', 'completed', 'cancelled'),
    defaultValue: 'planning'
  },
  // 时间范围
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'end_date',
    validate: {
      isAfterStart(value) {
        if (value <= this.startDate) {
          throw new Error('结束时间必须晚于开始时间');
        }
      }
    }
  },
  // 实际完成时间
  actualEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'actual_end_date'
  },
  // 项目关联
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  // 创建者
  creatorId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'creator_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // 探险季容量（计划工时）
  capacity: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  // 已分配工时
  allocatedHours: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'allocated_hours',
    validate: {
      min: 0
    }
  },
  // 实际消耗工时
  actualHours: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'actual_hours',
    validate: {
      min: 0
    }
  },
  // 探险季预算
  budget: {
    type: DataTypes.JSON,
    defaultValue: {
      diamond: 0,
      gold: 0,
      silver: 0,
      copper: 0,
      allocated: {
        diamond: 0,
        gold: 0,
        silver: 0,
        copper: 0
      },
      spent: {
        diamond: 0,
        gold: 0,
        silver: 0,
        copper: 0
      }
    }
  },
  // 探险季设置
  settings: {
    type: DataTypes.JSON,
    defaultValue: {
      autoAssignTasks: false,
      allowOvertime: true,
      requireDailyStandup: false,
      enableBurndownChart: true,
      workingDaysPerWeek: 5,
      hoursPerDay: 8
    }
  },
  // 探险季统计
  stats: {
    type: DataTypes.JSON,
    defaultValue: {
      totalTasks: 0,
      completedTasks: 0,
      totalStoryPoints: 0,
      completedStoryPoints: 0,
      velocity: 0,
      burndownData: []
    }
  }
}, {
  tableName: 'sprints',
  indexes: [
    {
      fields: ['project_id']
    },
    {
      fields: ['creator_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['start_date']
    },
    {
      fields: ['end_date']
    }
  ]
});

// 实例方法
Sprint.prototype.getDuration = function() {
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
};

Sprint.prototype.getDaysRemaining = function() {
  if (this.status === 'completed' || this.status === 'cancelled') {
    return 0;
  }
  const now = new Date();
  const end = new Date(this.endDate);
  const remaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
};

Sprint.prototype.getProgress = function() {
  if (this.stats.totalTasks === 0) {
    return 0;
  }
  return Math.round((this.stats.completedTasks / this.stats.totalTasks) * 100);
};

Sprint.prototype.isActive = function() {
  const now = new Date();
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  return this.status === 'active' && now >= start && now <= end;
};

Sprint.prototype.isOverdue = function() {
  const now = new Date();
  const end = new Date(this.endDate);
  return this.status === 'active' && now > end;
};

Sprint.prototype.canStart = function() {
  return this.status === 'planning' && new Date() >= new Date(this.startDate);
};

Sprint.prototype.canComplete = function() {
  return this.status === 'active';
};

// 类方法
Sprint.getActiveSprint = function(projectId) {
  return this.findOne({
    where: {
      projectId,
      status: 'active'
    }
  });
};

Sprint.getUpcomingSprints = function(projectId, limit = 5) {
  return this.findAll({
    where: {
      projectId,
      status: 'planning',
      startDate: {
        [require('sequelize').Op.gte]: new Date()
      }
    },
    order: [['startDate', 'ASC']],
    limit
  });
};

module.exports = Sprint;
