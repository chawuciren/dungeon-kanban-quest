// 异世界冒险者角色配置
// 保留原有英文角色名称，添加游戏化别名

const roleConfig = {
  // 👑 公会管理员 (原admin)
  admin: {
    name: '管理员',
    alias: '神域守护者',
    icon: '⚡',
    description: '冒险者公会总管，拥有所有权限',
    color: 'danger',
    permissions: ['all']
  },

  // 🔮 预言师 (原manager/产品经理)
  product_manager: {
    name: '产品经理',
    alias: '预言师',
    icon: '🔮',
    description: '地下城攻略规划师，负责项目管理和任务分配',
    color: 'warning',
    permissions: ['project_manage', 'task_assign', 'team_lead']
  },

  // ⚔️ 剑士 (原developer)
  developer: {
    name: '开发者',
    alias: '剑士',
    icon: '⚔️',
    description: '挥剑斩敌的勇者，负责任务开发和实现',
    color: 'primary',
    permissions: ['task_execute', 'code_develop']
  },

  // 🏹 弓箭手 (原tester)
  tester: {
    name: '测试员',
    alias: '弓箭手',
    icon: '🏹',
    description: '侦察和陷阱专家，负责质量保证和测试',
    color: 'info',
    permissions: ['quality_assurance', 'bug_report']
  },

  // 💎 委托贵族 (原client)
  client: {
    name: '客户',
    alias: '委托贵族',
    icon: '💎',
    description: '发布地下城探险委托的需求方',
    color: 'secondary',
    permissions: ['task_publish', 'requirement_define']
  },

  // 🔮 魔法师 (UI设计师)
  ui_designer: {
    name: 'UI设计师',
    alias: '魔法师',
    icon: '🔮',
    description: '装备美化大师，负责界面设计和用户体验',
    color: 'success',
    permissions: ['ui_design', 'ux_optimize']
  },

  // ✨ 牧师 (运维)
  devops: {
    name: '运维工程师',
    alias: '牧师',
    icon: '✨',
    description: '药剂和装备维护专家，负责系统运维和部署',
    color: 'dark',
    permissions: ['system_maintain', 'deploy_manage']
  }
};

// 获取角色配置
const getRoleConfig = (role) => {
  return roleConfig[role] || {
    name: '未知角色',
    alias: '流浪者',
    icon: '❓',
    description: '身份不明的冒险者',
    color: 'secondary',
    permissions: []
  };
};

// 获取角色显示名称（游戏化别名）
const getRoleDisplayName = (role, useAlias = true) => {
  const config = getRoleConfig(role);
  return useAlias ? config.alias : config.name;
};

// 获取角色图标
const getRoleIcon = (role) => {
  return getRoleConfig(role).icon;
};

// 获取角色颜色
const getRoleColor = (role) => {
  return getRoleConfig(role).color;
};

// 获取角色描述
const getRoleDescription = (role) => {
  return getRoleConfig(role).description;
};

// 获取所有角色列表（用于下拉选择）
const getAllRoles = () => {
  return Object.keys(roleConfig).map(key => ({
    value: key,
    name: roleConfig[key].name,
    alias: roleConfig[key].alias,
    icon: roleConfig[key].icon,
    description: roleConfig[key].description
  }));
};

// 检查角色权限
const hasPermission = (userRole, permission) => {
  const config = getRoleConfig(userRole);
  return config.permissions.includes('all') || config.permissions.includes(permission);
};

// 检查是否为管理员
const isAdmin = (userRole) => {
  return userRole === 'admin';
};

// 检查是否为项目管理者
const isProjectManager = (userRole) => {
  return userRole === 'admin' || userRole === 'product_manager';
};

module.exports = {
  roleConfig,
  getRoleConfig,
  getRoleDisplayName,
  getRoleIcon,
  getRoleColor,
  getRoleDescription,
  getAllRoles,
  hasPermission,
  isAdmin,
  isProjectManager
};
