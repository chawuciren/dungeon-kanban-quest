const { sequelize } = require('../config/database');

// 导入所有模型
const User = require('./User');
const UserWallet = require('./UserWallet');
const CurrencyTransaction = require('./CurrencyTransaction');
const Organization = require('./Organization');
const OrganizationMember = require('./OrganizationMember');
const Project = require('./Project');
const ProjectOrganization = require('./ProjectOrganization');
const ProjectMember = require('./ProjectMember');
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

// User 和 CurrencyTransaction 的关联 (1:N)
User.hasMany(CurrencyTransaction, {
  foreignKey: 'userId',
  as: 'transactions',
  onDelete: 'CASCADE'
});
CurrencyTransaction.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// 转账相关的关联
CurrencyTransaction.belongsTo(User, {
  foreignKey: 'fromUserId',
  as: 'fromUser'
});
CurrencyTransaction.belongsTo(User, {
  foreignKey: 'toUserId',
  as: 'toUser'
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

// User 和 Organization 的多对多关联 (通过 OrganizationMember)
User.belongsToMany(Organization, {
  through: OrganizationMember,
  foreignKey: 'userId',
  otherKey: 'organizationId',
  as: 'memberOrganizations'
});
Organization.belongsToMany(User, {
  through: OrganizationMember,
  foreignKey: 'organizationId',
  otherKey: 'userId',
  as: 'members'
});

// OrganizationMember 的直接关联
OrganizationMember.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});
OrganizationMember.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization'
});
OrganizationMember.belongsTo(User, {
  foreignKey: 'invitedBy',
  as: 'inviter'
});

// Organization 和 Project 的多对多关联 (通过 ProjectOrganization)
Organization.belongsToMany(Project, {
  through: ProjectOrganization,
  foreignKey: 'organizationId',
  otherKey: 'projectId',
  as: 'projects'
});
Project.belongsToMany(Organization, {
  through: ProjectOrganization,
  foreignKey: 'projectId',
  otherKey: 'organizationId',
  as: 'organizations'
});

// ProjectOrganization 的直接关联
ProjectOrganization.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project'
});
ProjectOrganization.belongsTo(Organization, {
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

// User 和 Project 的多对多关联 (通过 ProjectMember)
User.belongsToMany(Project, {
  through: ProjectMember,
  foreignKey: 'userId',
  otherKey: 'projectId',
  as: 'memberProjects'
});
Project.belongsToMany(User, {
  through: ProjectMember,
  foreignKey: 'projectId',
  otherKey: 'userId',
  as: 'members'
});

// ProjectMember 的直接关联
ProjectMember.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});
ProjectMember.belongsTo(Project, {
  foreignKey: 'projectId',
  as: 'project'
});
ProjectMember.belongsTo(User, {
  foreignKey: 'invitedBy',
  as: 'inviter'
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
    // 检查是否已有管理员用户
    const existingAdmin = await User.findOne({ where: { username: 'admin' } });
    if (existingAdmin) {
      console.log('⚠️  管理员用户已存在，跳过创建');
      return;
    }

    console.log('📊 创建初始数据...');

    // 创建默认管理员用户
    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@kanban.local',
      password: 'admin123',
      firstName: '系统',
      lastName: '管理员',
      role: 'admin', // 管理员角色
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

    // 添加管理员为组织成员
    await OrganizationMember.create({
      organizationId: defaultOrg.id,
      userId: adminUser.id,
      status: 'active',
      permissions: {
        canManageOrganization: true,
        canManageMembers: true,
        canCreateProjects: true,
        canManageProjects: true,
        canViewReports: true,
        canManageBudget: true
      }
    });

    // 创建示例项目
    const sampleProject = await Project.create({
      name: '示例项目',
      key: 'SAMPLE',
      description: '这是一个示例项目，用于演示游戏化项目管理功能',
      projectType: 'construction',
      starLevel: 3,
      status: 'active',
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

    // 关联项目与组织
    await ProjectOrganization.create({
      projectId: sampleProject.id,
      organizationId: defaultOrg.id,
      relationshipType: 'primary',
      status: 'active'
    });

    // 添加管理员为项目成员（使用管理员的默认角色）
    await ProjectMember.create({
      projectId: sampleProject.id,
      userId: adminUser.id,
      roles: [adminUser.role, 'admin'], // 包含用户角色和管理员角色
      status: 'active',
      permissions: {
        canManageProject: true,
        canManageMembers: true,
        canCreateTasks: true,
        canAssignTasks: true,
        canDeleteTasks: true,
        canManageBudget: true,
        canViewReports: true
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

    // 创建一些示例用户，展示不同的默认职业
    const sampleUsers = [
      {
        username: 'alice_pm',
        email: 'alice@kanban.local',
        password: 'alice123',
        firstName: '艾丽丝',
        lastName: '产品',
        role: 'product_manager',
        skillLevel: 'gold'
      },
      {
        username: 'bob_dev',
        email: 'bob@kanban.local',
        password: 'bob123',
        firstName: '鲍勃',
        lastName: '开发',
        role: 'developer',
        skillLevel: 'silver'
      },
      {
        username: 'charlie_test',
        email: 'charlie@kanban.local',
        password: 'charlie123',
        firstName: '查理',
        lastName: '测试',
        role: 'tester',
        skillLevel: 'bronze'
      },
      {
        username: 'diana_ui',
        email: 'diana@kanban.local',
        password: 'diana123',
        firstName: '戴安娜',
        lastName: '设计',
        role: 'ui_designer',
        skillLevel: 'silver'
      }
    ];

    const createdUsers = [];
    for (const userData of sampleUsers) {
      const user = await User.create(userData);

      // 为每个用户创建钱包
      await UserWallet.create({
        userId: user.id,
        diamondBalance: 5,
        goldBalance: 1000,
        silverBalance: 10000,
        copperBalance: 100000
      });

      createdUsers.push(user);
    }

    // 将示例用户添加到默认组织
    for (const user of createdUsers) {
      await OrganizationMember.create({
        organizationId: defaultOrg.id,
        userId: user.id,
        status: 'active',
        permissions: {
          canManageOrganization: false,
          canManageMembers: false,
          canCreateProjects: user.role === 'product_manager',
          canManageProjects: user.role === 'product_manager',
          canViewReports: true,
          canManageBudget: false
        }
      });
    }

    // 将部分用户添加到示例项目
    const projectMembers = createdUsers.slice(0, 3); // 前3个用户
    for (const user of projectMembers) {
      await ProjectMember.create({
        projectId: sampleProject.id,
        userId: user.id,
        roles: [user.role], // 使用用户的角色
        status: 'active',
        permissions: {
          canManageProject: user.role === 'product_manager',
          canManageMembers: user.role === 'product_manager',
          canCreateTasks: true,
          canAssignTasks: user.role === 'product_manager',
          canDeleteTasks: false,
          canManageBudget: user.role === 'product_manager',
          canViewReports: true
        }
      });
    }

    console.log('✅ 默认数据创建成功');
    console.log(`👥 创建了 ${1 + sampleUsers.length} 个用户 (1个管理员 + ${sampleUsers.length}个示例用户)`);
    console.log(`🏰 创建了 1 个默认公会，包含 ${1 + sampleUsers.length} 个成员`);
    console.log(`🗺️  创建了 1 个示例大陆，包含 ${1 + projectMembers.length} 个成员`);
  } catch (error) {
    console.error('❌ 默认数据创建失败:', error);
  }
};

module.exports = {
  sequelize,
  User,
  UserWallet,
  CurrencyTransaction,
  Organization,
  OrganizationMember,
  Project,
  ProjectOrganization,
  ProjectMember,
  BountyTask,
  Sprint,
  syncDatabase,
  createDefaultData
};
