const { sequelize } = require('../config/database');

// 导入所有模型
const User = require('./User');
const UserWallet = require('./UserWallet');
const Organization = require('./Organization');
const Project = require('./Project');
const BountyTask = require('./BountyTask');
const Sprint = require('./Sprint');

// 定义模型关联关系

// User 和 UserWallet 的关联 (1:1)
User.hasOne(UserWallet, {
  foreignKey: 'userId',
  as: 'wallet',
  onDelete: 'CASCADE'
});
UserWallet.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// User 和 Organization 的关联
User.hasMany(Organization, {
  foreignKey: 'ownerId',
  as: 'ownedOrganizations',
  onDelete: 'CASCADE'
});
Organization.belongsTo(User, {
  foreignKey: 'ownerId',
  as: 'owner'
});

// Organization 和 Project 的关联 (1:N)
Organization.hasMany(Project, {
  foreignKey: 'organizationId',
  as: 'projects',
  onDelete: 'CASCADE'
});
Project.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization'
});

// User 和 Project 的关联
User.hasMany(Project, {
  foreignKey: 'ownerId',
  as: 'ownedProjects',
  onDelete: 'CASCADE'
});
Project.belongsTo(User, {
  foreignKey: 'ownerId',
  as: 'owner'
});

User.hasMany(Project, {
  foreignKey: 'leaderId',
  as: 'ledProjects',
  onDelete: 'SET NULL'
});
Project.belongsTo(User, {
  foreignKey: 'leaderId',
  as: 'leader'
});

// Project 和 BountyTask 的关联 (1:N)
Project.hasMany(BountyTask, {
  foreignKey: 'projectId',
  as: 'tasks',
  onDelete: 'CASCADE'
});
BountyTask.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project'
});

// User 和 BountyTask 的关联
User.hasMany(BountyTask, {
  foreignKey: 'publisherId',
  as: 'publishedTasks',
  onDelete: 'CASCADE'
});
BountyTask.belongsTo(User, {
  foreignKey: 'publisherId',
  as: 'publisher'
});

User.hasMany(BountyTask, {
  foreignKey: 'assigneeId',
  as: 'assignedTasks',
  onDelete: 'SET NULL'
});
BountyTask.belongsTo(User, {
  foreignKey: 'assigneeId',
  as: 'assignee'
});

// BountyTask 自关联 (父子任务)
BountyTask.hasMany(BountyTask, {
  foreignKey: 'parentTaskId',
  as: 'subtasks',
  onDelete: 'CASCADE'
});
BountyTask.belongsTo(BountyTask, {
  foreignKey: 'parentTaskId',
  as: 'parentTask'
});

// Sprint 和 Project 的关联 (N:1)
Project.hasMany(Sprint, {
  foreignKey: 'projectId',
  as: 'sprints',
  onDelete: 'CASCADE'
});
Sprint.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project'
});

// Sprint 和 User 的关联 (N:1) - 创建者
User.hasMany(Sprint, {
  foreignKey: 'creatorId',
  as: 'createdSprints',
  onDelete: 'CASCADE'
});
Sprint.belongsTo(User, {
  foreignKey: 'creatorId',
  as: 'creator'
});

// Sprint 和 BountyTask 的关联 (1:N) - 任务可以分配到探险季
Sprint.hasMany(BountyTask, {
  foreignKey: 'sprintId',
  as: 'tasks',
  onDelete: 'SET NULL'
});
BountyTask.belongsTo(Sprint, {
  foreignKey: 'sprintId',
  as: 'sprint'
});

// 同步数据库
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('✅ 数据库同步成功');

    // 如果是强制同步，创建默认数据
    if (force) {
      await createDefaultData();
    }
  } catch (error) {
    console.error('❌ 数据库同步失败:', error);
    throw error;
  }
};

// 创建默认数据
const createDefaultData = async () => {
  try {
    // 创建默认管理员用户
    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@kanban.local',
      password: 'admin123',
      firstName: '系统',
      lastName: '管理员',
      role: 'guild_master',
      skillLevel: 'diamond',
      status: 'active',
      emailVerifiedAt: new Date()
    });

    // 创建管理员钱包
    await UserWallet.create({
      userId: adminUser.id,
      diamondBalance: 100,
      goldBalance: 10000,
      silverBalance: 100000,
      copperBalance: 1000000
    });

    // 创建默认组织
    const defaultOrg = await Organization.create({
      name: '默认组织',
      slug: 'default',
      description: '系统默认组织',
      ownerId: adminUser.id,
      status: 'active'
    });

    // 创建示例项目
    const sampleProject = await Project.create({
      name: '示例项目',
      key: 'SAMPLE',
      description: '这是一个示例项目，用于演示游戏化项目管理功能',
      projectType: 'construction',
      starLevel: 3,
      status: 'active',
      organizationId: defaultOrg.id,
      ownerId: adminUser.id,
      leaderId: adminUser.id,
      budgetPool: {
        diamond: 10,
        gold: 1000,
        silver: 10000,
        copper: 100000,
        allocated: { diamond: 0, gold: 0, silver: 0, copper: 0 },
        spent: { diamond: 0, gold: 0, silver: 0, copper: 0 }
      }
    });

    // 创建示例任务
    await BountyTask.create({
      title: '实现用户登录功能',
      description: '开发用户登录和注册功能，包括表单验证和错误处理',
      taskType: 'task',
      starLevel: 2,
      urgencyLevel: 'normal',
      skillRequired: 'bronze',
      status: 'published',
      projectId: sampleProject.id,
      publisherId: adminUser.id,
      baseReward: 80,
      bonusReward: 20,
      rewardCurrency: 'gold',
      totalBudget: 100,
      estimatedHours: 8.0,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后
      tags: ['frontend', 'authentication'],
      metadata: {
        priority: 'medium',
        complexity: 'medium',
        estimationMethod: 'expert',
        acceptanceCriteria: [
          '用户可以使用邮箱和密码登录',
          '登录失败时显示错误信息',
          '登录成功后跳转到仪表板'
        ]
      }
    });

    console.log('✅ 默认数据创建成功');
  } catch (error) {
    console.error('❌ 默认数据创建失败:', error);
  }
};

module.exports = {
  sequelize,
  User,
  UserWallet,
  Organization,
  Project,
  BountyTask,
  Sprint,
  syncDatabase,
  createDefaultData
};
