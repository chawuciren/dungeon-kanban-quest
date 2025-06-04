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
    const where = {
      projectId: req.session.selectedProjectId // 只显示当前选中项目的任务
    };

    // 其他筛选条件
    if (req.query.starLevel) {
      where.starLevel = req.query.starLevel;
    }
    if (req.query.skillRequired) {
      where.skillRequired = req.query.skillRequired;
    }
    if (req.query.urgencyLevel) {
      where.urgencyLevel = req.query.urgencyLevel;
    }
    if (req.query.status) {
      where.status = req.query.status;
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
    const projectId = req.session.selectedProjectId;
    const page = parseInt(req.query.page) || 1;
    const limit = 50; // 树形视图每页显示更多

    let where = {
      projectId: projectId // 只显示当前选中项目的任务
    };

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
    const projectId = req.session.selectedProjectId;

    let where = {
      projectId: projectId // 只显示当前选中项目的任务
    };

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

// 甘特视图
router.get('/gantt', requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const projectId = req.session.selectedProjectId;

    let where = {
      projectId: projectId // 只显示当前选中项目的任务
    };

    // 获取所有任务
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
      order: [['createdAt', 'ASC']]
    });

    // 格式化任务数据为甘特图格式
    const ganttTasks = tasks.map((task, index) => {
      // 计算开始和结束时间
      let startDate = task.startDate || task.createdAt;
      let endDate = task.dueDate;

      // 确保startDate是Date对象
      if (typeof startDate === 'string') {
        startDate = new Date(startDate);
      }

      // 如果没有截止时间，默认设置为开始时间后的估算工时天数
      if (!endDate && task.estimatedHours) {
        const estimatedDays = Math.ceil(task.estimatedHours / 8); // 假设每天8小时
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + estimatedDays);
      } else if (!endDate) {
        // 如果都没有，默认设置为7天后
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
      } else if (typeof endDate === 'string') {
        endDate = new Date(endDate);
      }

      // 确保结束时间不早于开始时间
      if (endDate <= startDate) {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }

      return {
        id: task.id,
        name: task.title || `任务 ${index + 1}`,
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        progress: task.status === 'completed' ? 100 :
                 task.status === 'review' ? 80 :
                 task.status === 'assigned' || task.status === 'in_progress' ? 50 : 0,
        custom_class: `task-${task.status}`,
        task: task // 保存完整任务信息用于显示
      };
    });

    res.render('tasks/gantt', {
      title: '任务甘特图',
      ganttTasks,
      projectId
    });

  } catch (error) {
    logger.error('获取甘特图数据失败:', error);
    req.flash('error', '获取甘特图数据失败');
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

    // 获取当前项目的成员列表
    let projectMembers = [];
    if (req.session.selectedProjectId) {
      const { ProjectMember } = require('../models');
      projectMembers = await ProjectMember.findAll({
        where: {
          projectId: req.session.selectedProjectId,
          status: 'active'
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'firstName', 'lastName', 'role']
          }
        ]
      });
    }

    res.render('tasks/create', {
      title: parentTask ? '创建子任务' : '创建任务',
      parentTask,
      projects,
      projectMembers,
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
          model: User,
          as: 'reviewer',
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

    // 获取协助人员信息
    let assistants = [];
    if (task.assistantIds && task.assistantIds.length > 0) {
      assistants = await User.findAll({
        where: {
          id: task.assistantIds
        },
        attributes: ['id', 'username', 'firstName', 'lastName', 'skillLevel']
      });
    }

    // 检查当前用户是否可以接单
    const canBid = task.status === 'published' &&
                  (!req.session.userId || task.publisherId !== req.session.userId) &&
                  !task.assigneeId;

    res.render('tasks/detail', {
      title: task.title,
      task,
      subtasks,
      assistants,
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
router.post('/create', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const {
      title,
      description,
      taskType,
      starLevel,
      urgencyLevel,
      skillRequired,
      parentTaskId,
      baseReward,
      bonusReward,
      rewardCurrency,
      estimatedHours,
      dueDate,
      assigneeId,
      assistantIds,
      reviewerId
    } = req.body;

    // 使用当前选中的项目ID
    const projectId = req.session.selectedProjectId;

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

    // 处理协助人员ID数组
    let processedAssistantIds = [];
    if (assistantIds) {
      if (Array.isArray(assistantIds)) {
        processedAssistantIds = assistantIds.filter(id => id && id.trim() !== '');
      } else if (typeof assistantIds === 'string' && assistantIds.trim() !== '') {
        processedAssistantIds = [assistantIds.trim()];
      }
    }

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
      assigneeId: assigneeId && assigneeId.trim() !== '' ? assigneeId : null,
      assistantIds: processedAssistantIds,
      reviewerId: reviewerId && reviewerId.trim() !== '' ? reviewerId : null,
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

// 编辑任务页面
router.get('/:id/edit', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;

    const task = await BountyTask.findByPk(taskId, {
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
          model: User,
          as: 'reviewer',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key']
        }
      ]
    });

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限：只有管理员或任务发布者可以编辑
    if (req.session.user?.role !== 'admin' && task.publisherId !== req.session.userId) {
      req.flash('error', '您没有权限编辑此任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 获取项目成员列表
    let projectMembers = [];
    if (task.projectId) {
      const { ProjectMember } = require('../models');
      projectMembers = await ProjectMember.findAll({
        where: {
          projectId: task.projectId,
          status: 'active'
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'firstName', 'lastName', 'role']
          }
        ]
      });
    }

    res.render('tasks/edit', {
      title: '编辑任务',
      task,
      projectMembers
    });

  } catch (error) {
    logger.error('获取编辑任务页面失败:', error);
    req.flash('error', '页面加载失败');
    res.redirect('/tasks');
  }
});

// 更新任务处理
router.post('/:id/edit', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const {
      title,
      description,
      taskType,
      starLevel,
      urgencyLevel,
      skillRequired,
      status,
      baseReward,
      bonusReward,
      rewardCurrency,
      estimatedHours,
      dueDate,
      assigneeId,
      assistantIds,
      reviewerId
    } = req.body;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限：只有管理员或任务发布者可以编辑
    if (req.session.user?.role !== 'admin' && task.publisherId !== req.session.userId) {
      req.flash('error', '您没有权限编辑此任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 验证必填字段
    if (!title || !description) {
      req.flash('error', '请填写必填字段');
      return res.redirect('back');
    }

    // 处理协助人员ID数组
    let processedAssistantIds = [];
    if (assistantIds) {
      if (Array.isArray(assistantIds)) {
        processedAssistantIds = assistantIds.filter(id => id && id.trim() !== '');
      } else if (typeof assistantIds === 'string' && assistantIds.trim() !== '') {
        processedAssistantIds = [assistantIds.trim()];
      }
    }

    const totalBudget = parseInt(baseReward) + parseInt(bonusReward || 0);

    // 处理状态变更的特殊逻辑
    const oldStatus = task.status;
    const newStatus = status || task.status;

    // 状态变更时的自动字段更新
    let updateData = {
      title,
      description,
      taskType: taskType || 'task',
      starLevel: parseInt(starLevel),
      urgencyLevel,
      skillRequired,
      status: newStatus,
      assigneeId: assigneeId && assigneeId.trim() !== '' ? assigneeId : null,
      assistantIds: processedAssistantIds,
      reviewerId: reviewerId && reviewerId.trim() !== '' ? reviewerId : null,
      baseReward: parseInt(baseReward),
      bonusReward: parseInt(bonusReward || 0),
      rewardCurrency,
      totalBudget,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      dueDate: dueDate || null
    };

    // 根据状态变更自动设置时间字段
    if (oldStatus !== newStatus) {
      if (newStatus === 'in_progress' && !task.startDate) {
        updateData.startDate = new Date();
      } else if (newStatus === 'completed' && !task.completedAt) {
        updateData.completedAt = new Date();
      }
    }

    // 更新任务
    await task.update(updateData);

    logger.info(`任务更新成功: ${title}`, {
      taskId: task.id,
      userId: req.session.userId
    });

    req.flash('success', '任务更新成功！');
    res.redirect(`/tasks/${task.id}`);

  } catch (error) {
    logger.error('更新任务失败:', error);
    req.flash('error', '更新任务失败：' + error.message);
    res.redirect('back');
  }
});

// 删除任务处理
router.post('/:id/delete', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;

    const task = await BountyTask.findByPk(taskId, {
      include: [
        {
          model: BountyTask,
          as: 'subtasks'
        }
      ]
    });

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限：只有管理员或任务发布者可以删除
    if (req.session.user?.role !== 'admin' && task.publisherId !== req.session.userId) {
      req.flash('error', '您没有权限删除此任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查是否有子任务
    if (task.subtasks && task.subtasks.length > 0) {
      req.flash('error', '该任务包含子任务，请先删除所有子任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查任务状态
    if (task.status === 'assigned' || task.status === 'in_progress') {
      req.flash('error', '进行中的任务无法删除');
      return res.redirect(`/tasks/${taskId}`);
    }

    const taskTitle = task.title;

    // 删除任务
    await task.destroy();

    logger.info(`任务删除成功: ${taskTitle}`, {
      taskId: task.id,
      userId: req.session.userId
    });

    req.flash('success', `任务"${taskTitle}"删除成功！`);
    res.redirect('/tasks');

  } catch (error) {
    logger.error('删除任务失败:', error);
    req.flash('error', '删除任务失败：' + error.message);
    res.redirect('back');
  }
});

// 快速状态变更API
router.post('/:id/status', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { status } = req.body;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    // 检查权限：只有管理员、任务发布者、负责人或审核人可以更改状态
    const hasPermission = req.session.user?.role === 'admin' ||
                         task.publisherId === req.session.userId ||
                         task.assigneeId === req.session.userId ||
                         task.reviewerId === req.session.userId;

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: '您没有权限更改此任务状态'
      });
    }

    // 验证状态值
    const validStatuses = ['draft', 'published', 'bidding', 'assigned', 'in_progress', 'review', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的状态值'
      });
    }

    const oldStatus = task.status;
    let updateData = { status };

    // 根据状态变更自动设置时间字段
    if (oldStatus !== status) {
      if (status === 'in_progress' && !task.startDate) {
        updateData.startDate = new Date();
      } else if (status === 'completed' && !task.completedAt) {
        updateData.completedAt = new Date();
      }
    }

    await task.update(updateData);

    logger.info(`任务状态更新: ${task.title} (${oldStatus} -> ${status})`, {
      taskId: task.id,
      userId: req.session.userId,
      oldStatus,
      newStatus: status
    });

    res.json({
      success: true,
      message: '任务状态更新成功',
      data: {
        taskId: task.id,
        oldStatus,
        newStatus: status,
        startDate: task.startDate,
        completedAt: task.completedAt
      }
    });

  } catch (error) {
    logger.error('更新任务状态失败:', error);
    res.status(500).json({
      success: false,
      message: '更新任务状态失败：' + error.message
    });
  }
});

// 接单功能
router.post('/:id/bid', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.userId;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查任务状态
    if (task.status !== 'published') {
      req.flash('error', '该任务当前不可接单');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查是否已有负责人
    if (task.assigneeId) {
      req.flash('error', '该任务已被接单');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查是否是任务发布者
    if (task.publisherId === userId) {
      req.flash('error', '不能接自己发布的任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 更新任务状态和负责人
    await task.update({
      assigneeId: userId,
      status: 'assigned',
      startDate: new Date()
    });

    logger.info(`任务接单成功: ${task.title}`, {
      taskId: task.id,
      assigneeId: userId
    });

    req.flash('success', '接单成功！任务已分配给您');
    res.redirect(`/tasks/${taskId}`);

  } catch (error) {
    logger.error('接单失败:', error);
    req.flash('error', '接单失败：' + error.message);
    res.redirect('back');
  }
});

// 开始任务
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.userId;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限
    if (task.assigneeId !== userId && req.session.user?.role !== 'admin') {
      req.flash('error', '只有任务负责人可以开始任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查任务状态
    if (task.status !== 'assigned') {
      req.flash('error', '任务当前状态不允许开始');
      return res.redirect(`/tasks/${taskId}`);
    }

    await task.update({
      status: 'in_progress',
      startDate: task.startDate || new Date()
    });

    req.flash('success', '任务已开始！');
    res.redirect(`/tasks/${taskId}`);

  } catch (error) {
    logger.error('开始任务失败:', error);
    req.flash('error', '开始任务失败：' + error.message);
    res.redirect('back');
  }
});

// 完成任务
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.session.userId;
    const { actualHours } = req.body;

    const task = await BountyTask.findByPk(taskId);

    if (!task) {
      req.flash('error', '任务不存在');
      return res.redirect('/tasks');
    }

    // 检查权限
    if (task.assigneeId !== userId && req.session.user?.role !== 'admin') {
      req.flash('error', '只有任务负责人可以完成任务');
      return res.redirect(`/tasks/${taskId}`);
    }

    // 检查任务状态
    if (!['assigned', 'in_progress'].includes(task.status)) {
      req.flash('error', '任务当前状态不允许完成');
      return res.redirect(`/tasks/${taskId}`);
    }

    let updateData = {
      status: task.reviewerId ? 'review' : 'completed',
      completedAt: new Date()
    };

    if (actualHours) {
      updateData.actualHours = parseFloat(actualHours);
    }

    await task.update(updateData);

    const message = task.reviewerId ? '任务已提交审核！' : '任务已完成！';
    req.flash('success', message);
    res.redirect(`/tasks/${taskId}`);

  } catch (error) {
    logger.error('完成任务失败:', error);
    req.flash('error', '完成任务失败：' + error.message);
    res.redirect('back');
  }
});

module.exports = router;
