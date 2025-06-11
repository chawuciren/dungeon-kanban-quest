const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// 任务评论模型
const TaskComment = sequelize.define('TaskComment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // 关联任务ID
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'task_id',
    references: {
      model: 'bounty_tasks',
      key: 'id'
    }
  },
  // 评论用户ID
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // 评论内容（富文本）
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [1, 2000]
    }
  },
  // 父评论ID（用于回复功能）
  parentCommentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_comment_id',
    references: {
      model: 'task_comments',
      key: 'id'
    }
  },
  // 回复的目标用户ID（用于@功能）
  replyToUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reply_to_user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // 评论层级（0=主评论, 1=回复评论）
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    validate: {
      min: 0,
      max: 1
    },
    comment: '评论层级，0为主评论，1为回复评论'
  },
  // 是否已编辑
  isEdited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_edited'
  },
  // 编辑时间
  editedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'edited_at'
  },
  // 点赞数（可选功能）
  likesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'likes_count',
    validate: {
      min: 0
    }
  }
}, {
  tableName: 'task_comments',
  indexes: [
    {
      fields: ['task_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['parent_comment_id']
    },
    {
      fields: ['task_id', 'level']
    },
    {
      fields: ['created_at']
    }
  ]
});

// 实例方法

// 检查是否可以编辑
TaskComment.prototype.canEdit = function(userId) {
  return this.userId === userId;
};

// 检查是否可以删除
TaskComment.prototype.canDelete = function(userId, userRole) {
  return this.userId === userId || userRole === 'admin';
};

// 获取格式化的创建时间
TaskComment.prototype.getFormattedTime = function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return '刚刚';
  } else if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return created.toLocaleDateString('zh-CN');
  }
};

module.exports = TaskComment;
