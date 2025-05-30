const { sequelize } = require('../src/config/database');
const { BountyTask, User, Project } = require('../src/models');

async function createSampleTasks() {
  try {
    // 获取现有用户和项目
    const users = await User.findAll();
    const projects = await Project.findAll();
    
    if (users.length === 0 || projects.length === 0) {
      console.log('需要先创建用户和项目');
      return;
    }
    
    const publisher = users[0];
    const project = projects[0];
    
    // 创建示例任务
    const sampleTasks = [
      {
        title: '实现用户登录功能',
        description: '开发用户登录和注册功能，包括表单验证和错误处理。需要实现JWT认证，密码加密存储，以及登录状态管理。',
        taskType: 'feature',
        starLevel: 2,
        urgencyLevel: 'normal',
        skillRequired: 'bronze',
        status: 'published',
        projectId: project.id,
        publisherId: publisher.id,
        baseReward: 80,
        bonusReward: 20,
        rewardCurrency: 'gold',
        estimatedHours: 8,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后
        tags: ['前端', '后端', '认证']
      },
      {
        title: '优化数据库查询性能',
        description: '分析并优化慢查询，提升系统响应速度。需要分析现有查询语句，添加合适的索引，优化复杂查询逻辑。',
        taskType: 'optimization',
        starLevel: 4,
        urgencyLevel: 'important',
        skillRequired: 'gold',
        status: 'published',
        projectId: project.id,
        publisherId: publisher.id,
        baseReward: 200,
        bonusReward: 50,
        rewardCurrency: 'gold',
        estimatedHours: 16,
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10天后
        tags: ['数据库', '性能优化', '后端']
      },
      {
        title: '修复支付模块Bug',
        description: '修复支付流程中的异常处理问题，确保支付状态正确更新，处理支付失败的回滚逻辑。',
        taskType: 'bug',
        starLevel: 1,
        urgencyLevel: 'urgent',
        skillRequired: 'novice',
        status: 'published',
        projectId: project.id,
        publisherId: publisher.id,
        baseReward: 40,
        bonusReward: 10,
        rewardCurrency: 'gold',
        estimatedHours: 4,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2天后
        tags: ['支付', 'Bug修复', '后端']
      },
      {
        title: '设计用户界面原型',
        description: '为新功能设计用户界面原型，包括线框图、交互流程和视觉设计。需要考虑用户体验和响应式设计。',
        taskType: 'design',
        starLevel: 3,
        urgencyLevel: 'normal',
        skillRequired: 'silver',
        status: 'published',
        projectId: project.id,
        publisherId: publisher.id,
        baseReward: 120,
        bonusReward: 30,
        rewardCurrency: 'silver',
        estimatedHours: 12,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14天后
        tags: ['UI设计', '原型', '前端']
      },
      {
        title: '编写API文档',
        description: '为现有API编写详细的文档，包括接口说明、参数定义、返回值格式和示例代码。',
        taskType: 'documentation',
        starLevel: 1,
        urgencyLevel: 'delayed',
        skillRequired: 'bronze',
        status: 'published',
        projectId: project.id,
        publisherId: publisher.id,
        baseReward: 60,
        bonusReward: 15,
        rewardCurrency: 'copper',
        estimatedHours: 6,
        dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21天后
        tags: ['文档', 'API', '后端']
      },
      {
        title: '实现实时通知系统',
        description: '开发实时通知功能，支持WebSocket连接，消息推送和通知历史记录。需要考虑性能和扩展性。',
        taskType: 'feature',
        starLevel: 5,
        urgencyLevel: 'important',
        skillRequired: 'diamond',
        status: 'published',
        projectId: project.id,
        publisherId: publisher.id,
        baseReward: 300,
        bonusReward: 100,
        rewardCurrency: 'diamond',
        estimatedHours: 24,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后
        tags: ['实时通信', 'WebSocket', '全栈']
      }
    ];
    
    // 批量创建任务
    for (const taskData of sampleTasks) {
      await BountyTask.create(taskData);
      console.log(`创建任务: ${taskData.title}`);
    }
    
    console.log('✅ 示例任务创建完成');
    
  } catch (error) {
    console.error('创建示例任务失败:', error);
  } finally {
    await sequelize.close();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  createSampleTasks();
}

module.exports = createSampleTasks;
