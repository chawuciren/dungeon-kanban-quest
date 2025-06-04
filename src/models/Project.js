const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Project = sequelize.define('Project', {
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
  key: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      len: [2, 10],
      isUppercase: true,
      isAlphanumeric: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // 游戏化项目类型
  projectType: {
    type: DataTypes.ENUM('exploration', 'construction', 'racing', 'maintenance', 'hybrid'),
    defaultValue: 'construction',
    field: 'project_type'
  },
  // 项目星级（影响预算和资源）
  starLevel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    field: 'star_level',
    validate: {
      min: 1,
      max: 5
    }
  },
  status: {
    type: DataTypes.ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled'),
    defaultValue: 'planning'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'internal'),
    defaultValue: 'private'
  },
  // organizationId 字段已移除，改为通过 project_organizations 表管理多对多关系
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  leaderId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'leader_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date'
  },
  // 项目设置
  settings: {
    type: DataTypes.JSON,
    defaultValue: {
      enableTimeTracking: true,
      enableBountyTasks: true,
      autoAssignTasks: false,
      requireApproval: true,
      workflowStages: ['todo', 'in_progress', 'review', 'done'],
      notifications: {
        taskAssigned: true,
        taskCompleted: true,
        deadlineApproaching: true
      }
    }
  },
  // 项目统计
  stats: {
    type: DataTypes.JSON,
    defaultValue: {
      totalTasks: 0,
      completedTasks: 0,
      totalMembers: 0,
      averageTaskCompletionTime: 0,
      onTimeCompletionRate: 0
    }
  },
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  color: {
    type: DataTypes.STRING(7),
    defaultValue: '#1976d2',
    validate: {
      is: /^#[0-9A-F]{6}$/i
    }
  }
}, {
  tableName: 'projects',
  indexes: [
    {
      unique: true,
      fields: ['key'] // 项目key全局唯一
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['leader_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['project_type']
    },
    {
      fields: ['star_level']
    }
  ]
});

// 实例方法
Project.prototype.isOwner = function(userId) {
  return this.ownerId === userId;
};

Project.prototype.isLeader = function(userId) {
  return this.leaderId === userId;
};



Project.prototype.updateStats = async function(newStats) {
  this.stats = { ...this.stats, ...newStats };
  this.changed('stats', true);
  return this.save();
};

// 类方法
Project.findByKey = function(key) {
  return this.findOne({
    where: {
      key
    }
  });
};

module.exports = Project;
