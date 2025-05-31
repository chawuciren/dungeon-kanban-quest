const express = require('express');
const router = express.Router();
const { BountyTask, Project, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const { requireProjectSelection, validateProjectAccess } = require('../middleware/projectSelection');

// 认证中间件
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    req.flash('error', '请先登录');
    return res.redirect('/login');
  }
  next();
};

// 获取子任务的辅助方法
async function getSubtasks(parentId, maxLevel = 3) {
  if (maxLevel <= 0) return [];

  const subtasks = await BountyTask.findAll({
    where: { parentTaskId: parentId },
    include: [
      {
        model: User,
        as: 'publisher',
        attributes: ['id', 'username', 'firstName', 'lastName']
      },
      {
        model: User,
        as: 'assignee',
        attributes: ['id', 'username', 'firstName', 'lastName']
      }
    ],
    order: [['createdAt', 'ASC']]
  });

  // 递归加载子任务（限制层级）
  for (let subtask of subtasks) {
    if (maxLevel > 1) {
      subtask.dataValues.subtasks = await getSubtasks(subtask.id, maxLevel - 1);
    } else {
      // 检查是否还有更深层的子任务
      const hasDeepChildren = await BountyTask.count({
        where: { parentTaskId: subtask.id }
      });
      subtask.dataValues.hasDeepChildren = hasDeepChildren > 0;
    }
    subtask.dataValues.hasChildren = subtask.dataValues.subtasks?.length > 0 || subtask.dataValues.hasDeepChildren;
  }

  return subtasks;
}

// 任务市场（列表视图）
router.get('/', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    // 构建查询条件
    const where = {};

    // 如果用户选择了项目，优先使用选中的项目
    const projectId = req.query.projectId || req.session.selectedProjectId;

    if (projectId) {
      where.projectId = projectId;
    } else {
      // 如果没有选择项目且不是管理员，只显示已发布的任务
      where.status = 'published';
    }

    // 其他筛选条件
    if (req.query.projectId) {
      where.projectId = req.query.projectId;
    }
    if (req.query.starLevel) {
      where.starLevel = req.query.starLevel;
    }
    if (req.query.skillRequired) {
      where.skillRequired = req.query.skillRequired;
    }
    if (req.query.urgencyLevel) {
      where.urgencyLevel = req.query.urgencyLevel;
    }
    if (req.query.rewardCurrency) {
      where.rewardCurrency = req.query.rewardCurrency;
    }
    if (req.query.search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${req.query.search}%` } },
        { description: { [Op.like]: `%${req.query.search}%` } }
      ];
    }

    // 排序
    let order = [['createdAt', 'DESC']];
    if (req.query.sort === 'reward') {
      order = [['totalBudget', 'DESC']];
    } else if (req.query.sort === 'deadline') {
      order = [['dueDate', 'ASC']];
    }

    const { count, rows: tasks } = await BountyTask.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key']
        }
      ],
      order,
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.render('tasks/index', {
      title: '任务市场',
      tasks,
      pagination: {
        page,
        totalPages,
        total: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: req.query
    });

  } catch (error) {
    logger.error('获取任务列表失败:', error);
    req.flash('error', '获取任务列表失败');
    res.redirect('/dashboard');
  }
});

// 树形视图
router.get('/tree', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const projectId = req.query.projectId || req.session.selectedProjectId;
    const page = parseInt(req.query.page) || 1;
    const limit = 50; // 树形视图每页显示更多

    let where = {};
    if (projectId) {
      where.projectId = projectId;
    }

    // 只获取根任务（level 0）进行分页
    const { count, rows: rootTasks } = await BountyTask.findAndCountAll({
      where: {
        ...where,
        parentTaskId: null // 根任务
      },
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });

    // 检查每个根任务是否有子任务（不预加载子任务）
    for (let task of rootTasks) {
      const hasChildren = await BountyTask.count({
        where: { parentTaskId: task.id }
      });
      task.dataValues.hasChildren = hasChildren > 0;
      task.hasChildren = hasChildren > 0; // 同时设置在实例上

    }

    const totalPages = Math.ceil(count / limit);

    res.render('tasks/tree', {
      title: '任务树形视图',
      rootTasks,
      projectId,
      pagination: {
        page,
        totalPages,
        total: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error('获取任务树失败:', error);
    req.flash('error', '获取任务树失败');
    res.redirect('/tasks');
  }
});

// 看板视图
router.get('/kanban', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const projectId = req.query.projectId || req.session.selectedProjectId;

    let where = {};
    if (projectId) {
      where.projectId = projectId;
    }

    // 获取所有任务并按状态分组
    const tasks = await BountyTask.findAll({
      where,
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // 按状态分组任务
    const kanbanColumns = {
      published: { title: '待接单', tasks: [], color: 'primary' },
      assigned: { title: '进行中', tasks: [], color: 'warning' },
      review: { title: '待审核', tasks: [], color: 'info' },
      completed: { title: '已完成', tasks: [], color: 'success' }
    };

    tasks.forEach(task => {
      if (kanbanColumns[task.status]) {
        kanbanColumns[task.status].tasks.push(task);
      }
    });

    res.render('tasks/kanban', {
      title: '任务看板',
      kanbanColumns,
      projectId
    });

  } catch (error) {
    logger.error('获取看板数据失败:', error);
    req.flash('error', '获取看板数据失败');
    res.redirect('/tasks');
  }
});

// 创建任务页面
router.get('/create', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const parentId = req.query.parent;
    let parentTask = null;

    if (parentId) {
      parentTask = await BountyTask.findByPk(parentId, {
        attributes: ['id', 'title', 'projectId']
      });
    }

    // 获取用户的项目列表（如果有选中的项目，优先使用）
    let projects = [];
    if (req.session.selectedProjectId) {
      const selectedProject = await Project.findByPk(req.session.selectedProjectId, {
        attributes: ['id', 'name', 'key']
      });
      if (selectedProject) {
        projects = [selectedProject];
      }
    } else {
      // 管理员可以看到所有项目
      projects = await Project.findAll({
        where: {
          [Op.or]: [
            { ownerId: req.session.userId },
            { leaderId: req.session.userId }
          ]
        },
        attributes: ['id', 'name', 'key']
      });
    }

    res.render('tasks/create', {
      title: '创建任务',
      parentTask,
      projects,
      defaultProjectId: req.session.selectedProjectId
    });

  } catch (error) {
    logger.error('获取创建任务页面失败:', error);
    req.flash('error', '页面加载失败');
    res.redirect('/tasks');
  }
});

// 任务详情
router.get('/:id', async (req, res) => {
  try {
    const taskId = req.params.id;

    const task = await BountyTask.findByPk(taskId, {
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'username', 'firstName', 'lastName', 'skillLevel']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'firstName', 'lastName', 'skillLevel']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key', 'description']
        },
        {
          model: BountyTask,
          as: 'parentTask',
          attributes: ['id', 'title']
        }
      ]
    });

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 获取子任务
    const subtasks = await getSubtasks(task.id, 2);

    // 检查当前用户是否可以接单
    const canBid = task.status === 'published' &&
                  (!req.session.userId || task.publisherId !== req.session.userId) &&
                  !task.assigneeId;

    res.render('tasks/detail', {
      title: task.title,
      task,
      subtasks,
      canBid
    });

  } catch (error) {
    logger.error('获取任务详情失败:', error);
    req.flash('error', '获取任务详情失败');
    res.redirect('/tasks');
  }
});

// 获取子任务（AJAX接口）
router.get('/:id/subtasks', async (req, res) => {
  try {
    const parentId = req.params.id;

    // 直接获取子任务，不递归加载
    const subtasks = await BountyTask.findAll({
      where: { parentTaskId: parentId },
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    // 检查每个子任务是否还有子任务
    for (let subtask of subtasks) {
      const hasChildren = await BountyTask.count({
        where: { parentTaskId: subtask.id }
      });
      subtask.dataValues.hasChildren = hasChildren > 0;
      subtask.hasChildren = hasChildren > 0; // 同时设置在实例上
    }

    res.json({
      success: true,
      data: subtasks
    });

  } catch (error) {
    logger.error('获取子任务失败:', error);
    res.status(500).json({
      success: false,
      message: '获取子任务失败'
    });
  }
});

// 创建任务处理
router.post('/create', requireAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      taskType,
      starLevel,
      urgencyLevel,
      skillRequired,
      projectId,
      parentTaskId,
      baseReward,
      bonusReward,
      rewardCurrency,
      estimatedHours,
      dueDate
    } = req.body;

    // 验证必填字段
    if (!title || !description || !projectId) {
      req.flash('error', '请填写必填字段');
      return res.redirect('back');
    }

    // 计算任务层级
    let level = 0;
    if (parentTaskId) {
      const parentTask = await BountyTask.findByPk(parentTaskId);
      if (!parentTask) {
        req.flash('error', '父任务不存在');
        return res.redirect('back');
      }
      level = (parentTask.level || 0) + 1;

      // 检查层级限制
      if (level > 3) {
        req.flash('error', '任务层级不能超过4级');
        return res.redirect('back');
      }
    }

    const totalBudget = parseInt(baseReward) + parseInt(bonusReward || 0);

    // 创建任务
    const task = await BountyTask.create({
      title,
      description,
      taskType: taskType || 'task',
      starLevel: parseInt(starLevel),
      urgencyLevel,
      skillRequired,
      status: 'published',
      projectId,
      publisherId: req.session.userId,
      parentTaskId: parentTaskId || null,
      baseReward: parseInt(baseReward),
      bonusReward: parseInt(bonusReward || 0),
      rewardCurrency,
      totalBudget,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      dueDate: dueDate || null,
      level
    });

    logger.info(`任务创建成功: ${title}`, {
      taskId: task.id,
      userId: req.session.userId
    });

    req.flash('success', '任务创建成功！');
    res.redirect(`/tasks/${task.id}`);

  } catch (error) {
    logger.error('创建任务失败:', error);
    req.flash('error', '创建任务失败：' + error.message);
    res.redirect('back');
  }
});

// 接单功能（后续实现）
// router.post('/:id/bid', requireAuth, async (req, res) => {
//   // TODO: 实现接单功能
// });

// 完成任务（后续实现）
// router.post('/:id/complete', requireAuth, async (req, res) => {
//   // TODO: 实现完成任务功能
// });

module.exports = router;
