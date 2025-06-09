// 任务类型配置
// 定义各种任务类型的属性、权限和层级关系

const taskTypeConfig = {
  // 史诗 - 最高层级
  epic: {
    name: '史诗',
    icon: '🏰',
    color: 'purple',
    description: '大型功能模块或项目阶段',
    level: 0,
    canHaveChildren: ['story', 'requirement', 'dev_task', 'design_task', 'test_task', 'devops_task', 'task', 'bug'],
    allowedRoles: ['admin', 'product_manager', 'client'],
    defaultAssigneeRole: 'product_manager'
  },

  // 用户故事
  story: {
    name: '用户故事',
    icon: '📖',
    color: 'blue',
    description: '从用户角度描述的功能需求',
    level: 1,
    canHaveChildren: ['requirement', 'dev_task', 'design_task', 'test_task', 'devops_task', 'task', 'bug'],
    allowedRoles: ['admin', 'product_manager', 'client'],
    defaultAssigneeRole: 'product_manager'
  },

  // 需求
  requirement: {
    name: '需求',
    icon: '📋',
    color: 'info',
    description: '具体的功能需求或业务需求',
    level: 2,
    canHaveChildren: ['dev_task', 'design_task', 'test_task', 'devops_task', 'task', 'bug'],
    allowedRoles: ['admin', 'product_manager'],
    defaultAssigneeRole: 'product_manager'
  },

  // 开发任务
  dev_task: {
    name: '开发任务',
    icon: '⚔️',
    color: 'primary',
    description: '代码开发、功能实现相关任务',
    level: 3,
    canHaveChildren: ['bug'],
    allowedRoles: ['admin', 'product_manager', 'developer'],
    defaultAssigneeRole: 'developer'
  },

  // 设计任务
  design_task: {
    name: '设计任务',
    icon: '🎨',
    color: 'success',
    description: 'UI/UX设计、原型设计相关任务',
    level: 3,
    canHaveChildren: ['bug'],
    allowedRoles: ['admin', 'product_manager', 'ui_designer'],
    defaultAssigneeRole: 'ui_designer'
  },

  // 测试任务
  test_task: {
    name: '测试任务',
    icon: '🏹',
    color: 'warning',
    description: '测试用例编写、功能测试相关任务',
    level: 3,
    canHaveChildren: ['bug'],
    allowedRoles: ['admin', 'product_manager', 'tester'],
    defaultAssigneeRole: 'tester'
  },

  // 运维任务
  devops_task: {
    name: '运维任务',
    icon: '⚙️',
    color: 'dark',
    description: '部署、监控、运维相关任务',
    level: 3,
    canHaveChildren: ['bug'],
    allowedRoles: ['admin', 'product_manager', 'devops'],
    defaultAssigneeRole: 'devops'
  },

  // 通用任务
  task: {
    name: '通用任务',
    icon: '📝',
    color: 'secondary',
    description: '无法明确分类的其他任务',
    level: 3,
    canHaveChildren: ['bug'],
    allowedRoles: ['admin', 'product_manager', 'developer', 'tester', 'ui_designer', 'devops'],
    defaultAssigneeRole: null
  },

  // 缺陷 - 可以出现在任何层级
  bug: {
    name: '缺陷',
    icon: '🐛',
    color: 'danger',
    description: '系统缺陷、问题修复',
    level: 'flexible', // 灵活层级，取决于父任务
    canHaveChildren: [],
    allowedRoles: ['admin', 'product_manager', 'tester'],
    defaultAssigneeRole: 'developer',
    canBeChildOf: ['epic', 'story', 'requirement', 'dev_task', 'design_task', 'test_task', 'devops_task', 'task']
  }
};

// 获取任务类型配置
const getTaskTypeConfig = (taskType) => {
  return taskTypeConfig[taskType] || {
    name: '未知类型',
    icon: '❓',
    color: 'secondary',
    description: '未定义的任务类型',
    level: 0,
    canHaveChildren: [],
    allowedRoles: [],
    defaultAssigneeRole: null
  };
};

// 获取所有任务类型
const getAllTaskTypes = () => {
  return Object.keys(taskTypeConfig).map(key => ({
    value: key,
    ...taskTypeConfig[key]
  }));
};

// 检查用户是否可以创建指定类型的任务
const canCreateTaskType = (userRoles, taskType) => {
  const config = getTaskTypeConfig(taskType);
  
  // 如果用户角色是数组，检查是否有任何角色匹配
  if (Array.isArray(userRoles)) {
    return userRoles.some(role => config.allowedRoles.includes(role));
  }
  
  // 如果是单个角色
  return config.allowedRoles.includes(userRoles);
};

// 检查任务类型是否可以作为指定父任务的子任务
const canBeChildTask = (childType, parentType) => {
  if (!parentType) return true; // 根任务
  
  const parentConfig = getTaskTypeConfig(parentType);
  return parentConfig.canHaveChildren.includes(childType);
};

// 获取用户可创建的任务类型列表
const getAvailableTaskTypes = (userRoles, parentTaskType = null) => {
  const availableTypes = [];
  
  for (const [taskType, config] of Object.entries(taskTypeConfig)) {
    // 检查用户权限
    if (canCreateTaskType(userRoles, taskType)) {
      // 检查是否可以作为子任务
      if (canBeChildTask(taskType, parentTaskType)) {
        availableTypes.push({
          value: taskType,
          ...config
        });
      }
    }
  }
  
  return availableTypes;
};

// 计算Bug的动态层级
const calculateBugLevel = (parentTask) => {
  if (!parentTask) return 1; // 独立Bug
  return (parentTask.level || 0) + 1;
};

// 获取任务类型的显示名称
const getTaskTypeDisplayName = (taskType) => {
  const config = getTaskTypeConfig(taskType);
  return config.name;
};

// 获取任务类型的图标
const getTaskTypeIcon = (taskType) => {
  const config = getTaskTypeConfig(taskType);
  return config.icon;
};

// 获取任务类型的颜色
const getTaskTypeColor = (taskType) => {
  const config = getTaskTypeConfig(taskType);
  return config.color;
};

module.exports = {
  taskTypeConfig,
  getTaskTypeConfig,
  getAllTaskTypes,
  canCreateTaskType,
  canBeChildTask,
  getAvailableTaskTypes,
  calculateBugLevel,
  getTaskTypeDisplayName,
  getTaskTypeIcon,
  getTaskTypeColor
};
