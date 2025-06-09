const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserSettings = sequelize.define('UserSettings', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  
  // 任务视图配置
  defaultTaskView: {
    type: DataTypes.ENUM('list', 'kanban', 'gantt', 'tree'),
    defaultValue: 'list',
    field: 'default_task_view'
  },
  
  // 每页显示任务数量
  tasksPerPage: {
    type: DataTypes.INTEGER,
    defaultValue: 20,
    field: 'tasks_per_page',
    validate: {
      min: 10,
      max: 100
    }
  },
  
  // 默认任务排序方式
  defaultTaskSort: {
    type: DataTypes.ENUM('created', 'deadline', 'priority'),
    defaultValue: 'created',
    field: 'default_task_sort'
  },
  
  // 甘特图配置 - 默认时间粒度
  ganttDefaultGranularity: {
    type: DataTypes.ENUM('day', 'week', 'month'),
    defaultValue: 'day',
    field: 'gantt_default_granularity'
  },
  
  // 创建任务时默认选择的任务类型
  defaultTaskType: {
    type: DataTypes.ENUM('requirement', 'task', 'bug', 'epic', 'story', 'dev_task', 'design_task', 'test_task', 'devops_task'),
    defaultValue: 'task',
    field: 'default_task_type'
  }
}, {
  tableName: 'user_settings',
  indexes: [
    {
      unique: true,
      fields: ['user_id']
    }
  ]
});

module.exports = UserSettings;
