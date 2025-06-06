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
    type: DataTypes.ENUM('requirement', 'task', 'bug', 'epic', 'story', 'dev_task', 'design_task', 'test_task', 'devops_task'),
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

  // 任务状态
  status: {
    type: DataTypes.ENUM('draft', 'assigned', 'in_progress', 'review', 'completed', 'cancelled'),
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
  // 协助人员（可以有多个）
  assistantIds: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    field: 'assistant_ids',
    comment: '协助人员ID数组'
  },
  // 审核人员
  reviewerId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reviewer_id',
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
  sprintId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'sprint_id',
    references: {
      model: 'sprints',
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
  },
  // 任务进度百分比
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    },
    comment: '任务完成进度百分比 (0-100)'
  },
  // 归档状态
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_archived',
    comment: '是否已归档'
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
      fields: ['due_date']
    },
    {
      fields: ['sprint_id']
    }
  ]
});

// 实例方法

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

// 根据实际工时自动计算进度百分比
BountyTask.prototype.calculateProgressFromHours = function() {
  if (!this.estimatedHours || this.estimatedHours === 0) {
    return this.progress || 0;
  }
  if (!this.actualHours) {
    return 0;
  }
  // 根据实际工时占预估工时的比例计算进度，但不超过100%
  const calculatedProgress = Math.min(100, Math.round((this.actualHours / this.estimatedHours) * 100));
  return calculatedProgress;
};

// 根据任务状态自动设置进度
BountyTask.prototype.getProgressByStatus = function() {
  const statusProgressMap = {
    'draft': 0,
    'published': 0,
    'bidding': 0,
    'assigned': 10,
    'in_progress': this.progress || 50, // 使用当前进度或默认50%
    'review': 90,
    'completed': 100,
    'cancelled': this.progress || 0 // 保持当前进度或0%
  };
  return statusProgressMap[this.status] || this.progress || 0;
};

// 获取进度状态的显示文本
BountyTask.prototype.getProgressText = function() {
  const progress = this.progress || 0;
  if (progress === 0) return '未开始';
  if (progress < 25) return '刚开始';
  if (progress < 50) return '进行中';
  if (progress < 75) return '大部分完成';
  if (progress < 100) return '即将完成';
  return '已完成';
};



BountyTask.prototype.canBeAssignedTo = function(userId) {
  return this.status === 'draft' && !this.assigneeId;
};

// 类方法
BountyTask.findAvailableForUser = function(userId) {
  return this.findAll({
    where: {
      status: 'draft',
      assigneeId: null
    },
    order: [['createdAt', 'DESC']]
  });
};

module.exports = BountyTask;
