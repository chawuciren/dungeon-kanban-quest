// 异世界冒险者角色配置
// 保留原有英文角色名称，添加游戏化别名

const roleConfig = {
  // 👑 公会管理员 (原admin)
  guild_master: {
    name: '管理员',
    alias: '公会管理员',
    icon: '👑',
    description: '冒险者公会总管，拥有所有权限',
    color: 'danger',
    permissions: ['all']
  },

  // ⚔️ 探险队长 (原manager/产品经理)
  quest_captain: {
    name: '项目经理',
    alias: '探险队长',
    icon: '⚔️',
    description: '地下城攻略规划师，负责项目管理和任务分配',
    color: 'warning',
    permissions: ['project_manage', 'task_assign', 'team_lead']
  },

  // 🛡️ 剑士 (原developer)
  swordsman: {
    name: '开发者',
    alias: '剑士',
    icon: '🛡️',
    description: '挥剑斩敌的勇者，负责任务开发和实现',
    color: 'primary',
    permissions: ['task_execute', 'code_develop']
  },

  // 🏹 游侠 (原tester)
  ranger: {
    name: '测试员',
    alias: '游侠',
    icon: '🏹',
    description: '侦察和陷阱专家，负责质量保证和测试',
    color: 'info',
    permissions: ['quality_assurance', 'bug_report']
  },

  // 👤 任务委托人 (原client)
  quest_giver: {
    name: '客户',
    alias: '任务委托人',
    icon: '💰',
    description: '发布地下城探险委托的需求方',
    color: 'secondary',
    permissions: ['task_publish', 'requirement_define']
  },

  // ✨ 附魔师 (UI设计师 - 新增)
  enchanter: {
    name: 'UI设计师',
    alias: '附魔师',
    icon: '✨',
    description: '装备美化大师，负责界面设计和用户体验',
    color: 'success',
    permissions: ['ui_design', 'ux_optimize']
  },

  // 🧪 炼金术师 (运维 - 新增)
  alchemist: {
    name: '运维工程师',
    alias: '炼金术师',
    icon: '🧪',
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
  return userRole === 'guild_master';
};

// 检查是否为项目管理者
const isProjectManager = (userRole) => {
  return userRole === 'guild_master' || userRole === 'quest_captain';
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
