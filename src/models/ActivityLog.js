const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 活动记录模型 - 记录用户在系统中的各种操作
const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // 操作用户
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // 操作类型
  actionType: {
    type: DataTypes.ENUM(
      'task_created',      // 创建任务
      'task_updated',      // 更新任务
      'task_status_changed', // 任务状态变更
      'task_assigned',     // 任务分配
      'task_completed',    // 任务完成
      'project_created',   // 创建项目
      'project_updated',   // 更新项目
      'project_joined',    // 加入项目
      'sprint_created',    // 创建迭代
      'sprint_updated',    // 更新迭代
      'sprint_started',    // 开始迭代
      'sprint_completed',  // 完成迭代
      'user_login',        // 用户登录
      'user_logout',       // 用户登出
      'comment_added',     // 添加评论
      'file_uploaded',     // 文件上传
      'other'              // 其他操作
    ),
    allowNull: false,
    field: 'action_type'
  },
  // 操作描述
  description: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  // 关联的实体类型
  entityType: {
    type: DataTypes.ENUM('task', 'project', 'sprint', 'user', 'organization', 'other'),
    allowNull: true,
    field: 'entity_type'
  },
  // 关联的实体ID
  entityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'entity_id'
  },
  // 项目ID（用于过滤项目相关活动）
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  // 操作前的数据（JSON格式）
  oldData: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'old_data'
  },
  // 操作后的数据（JSON格式）
  newData: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'new_data'
  },
  // 额外的元数据
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  // IP地址
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
    field: 'ip_address'
  },
  // 用户代理
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'user_agent'
  }
}, {
  tableName: 'activity_logs',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['action_type']
    },
    {
      fields: ['entity_type', 'entity_id']
    },
    {
      fields: ['project_id']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['user_id', 'created_at']
    },
    {
      fields: ['project_id', 'created_at']
    }
  ]
});

// 实例方法

// 获取操作类型的显示文本
ActivityLog.prototype.getActionText = function() {
  const actionTexts = {
    'task_created': '创建了任务',
    'task_updated': '更新了任务',
    'task_status_changed': '更改了任务状态',
    'task_assigned': '分配了任务',
    'task_completed': '完成了任务',
    'project_created': '创建了项目',
    'project_updated': '更新了项目',
    'project_joined': '加入了项目',
    'sprint_created': '创建了迭代',
    'sprint_updated': '更新了迭代',
    'sprint_started': '开始了迭代',
    'sprint_completed': '完成了迭代',
    'user_login': '登录了系统',
    'user_logout': '退出了系统',
    'comment_added': '添加了评论',
    'file_uploaded': '上传了文件',
    'other': '执行了操作'
  };
  return actionTexts[this.actionType] || '执行了操作';
};

// 获取操作类型的图标
ActivityLog.prototype.getActionIcon = function() {
  const actionIcons = {
    'task_created': 'fas fa-plus-circle text-success',
    'task_updated': 'fas fa-edit text-primary',
    'task_status_changed': 'fas fa-exchange-alt text-warning',
    'task_assigned': 'fas fa-user-plus text-info',
    'task_completed': 'fas fa-check-circle text-success',
    'project_created': 'fas fa-folder-plus text-success',
    'project_updated': 'fas fa-folder-open text-primary',
    'project_joined': 'fas fa-users text-info',
    'sprint_created': 'fas fa-calendar-plus text-success',
    'sprint_updated': 'fas fa-calendar-alt text-primary',
    'sprint_started': 'fas fa-play-circle text-success',
    'sprint_completed': 'fas fa-flag-checkered text-success',
    'user_login': 'fas fa-sign-in-alt text-info',
    'user_logout': 'fas fa-sign-out-alt text-secondary',
    'comment_added': 'fas fa-comment text-primary',
    'file_uploaded': 'fas fa-upload text-info',
    'other': 'fas fa-cog text-secondary'
  };
  return actionIcons[this.actionType] || 'fas fa-cog text-secondary';
};

// 静态方法

// 记录活动
ActivityLog.logActivity = async function(data) {
  try {
    return await this.create(data);
  } catch (error) {
    console.error('记录活动失败:', error);
    return null;
  }
};

// 获取用户最近的活动
ActivityLog.getUserRecentActivities = async function(userId, limit = 10) {
  const { User } = require('./index');
  return await this.findAll({
    where: { userId },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName']
      }
    ],
    order: [['createdAt', 'DESC']],
    limit
  });
};

// 获取项目最近的活动
ActivityLog.getProjectRecentActivities = async function(projectId, limit = 10) {
  const { User } = require('./index');
  return await this.findAll({
    where: { projectId },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName']
      }
    ],
    order: [['createdAt', 'DESC']],
    limit
  });
};

module.exports = ActivityLog;
