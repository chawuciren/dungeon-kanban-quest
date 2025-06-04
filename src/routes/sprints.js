const express = require('express');
const router = express.Router();
const { Sprint, Project, User, BountyTask } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const { requireProjectSelection, validateProjectAccess } = require('../middleware/projectSelection');

// 中间件：检查用户是否已登录
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// 迭代列表页面
router.get('/', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const projectId = req.session.selectedProjectId;
    const status = req.query.status;

    let where = {
      projectId: projectId // 只显示当前选中项目的迭代
    };

    // 状态筛选
    if (status && status !== 'all') {
      where.status = status;
    }

    const { count, rows: sprints } = await Sprint.findAndCountAll({
      where,
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.render('sprints/index', {
      title: '迭代管理',
      sprints,
      pagination: {
        page,
        totalPages,
        total: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        status: status || 'all'
      }
    });

  } catch (error) {
    logger.error('获取迭代列表失败:', error);
    req.flash('error', '获取迭代列表失败');
    res.redirect('/dashboard');
  }
});

// 创建迭代页面
router.get('/create', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    // 获取当前选中的项目信息
    const selectedProject = await Project.findByPk(req.session.selectedProjectId, {
      attributes: ['id', 'name', 'key']
    });

    if (!selectedProject) {
      req.flash('error', '请先选择要创建迭代的大陆');
      return res.redirect('/sprints');
    }

    res.render('sprints/create', {
      title: '创建迭代',
      selectedProject
    });

  } catch (error) {
    logger.error('获取创建迭代页面失败:', error);
    req.flash('error', '页面加载失败');
    res.redirect('/sprints');
  }
});

// 创建迭代处理
router.post('/create', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const {
      name,
      description,
      goal,
      startDate,
      endDate,
      capacity
    } = req.body;

    // 使用当前选中的项目ID
    const projectId = req.session.selectedProjectId;

    // 验证必填字段
    if (!name || !goal || !projectId || !startDate || !endDate) {
      req.flash('error', '请填写所有必填字段');
      return res.redirect('back');
    }

    // 验证项目权限
    const project = await Project.findByPk(projectId);
    if (!project) {
      req.flash('error', '项目不存在');
      return res.redirect('back');
    }

    // 检查用户权限：管理员、owner、leader 或有权限的项目成员
    let hasPermission = req.session.user?.role === 'admin' ||
                       project.ownerId === req.session.userId ||
                       project.leaderId === req.session.userId;

    if (!hasPermission) {
      // 检查是否是有权限的项目成员
      const { ProjectMember } = require('../models');
      const membership = await ProjectMember.findOne({
        where: {
          projectId: projectId,
          userId: req.session.userId,
          status: 'active'
        }
      });

      // 项目成员如果有创建任务权限，也可以创建迭代
      hasPermission = membership && membership.permissions.canCreateTasks;
    }

    if (!hasPermission) {
      req.flash('error', '您没有权限在此项目中创建迭代');
      return res.redirect('back');
    }

    // 验证时间
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      req.flash('error', '结束时间必须晚于开始时间');
      return res.redirect('back');
    }

    // 检查时间冲突
    const conflictingSprint = await Sprint.findOne({
      where: {
        projectId,
        status: ['planning', 'active'],
        [Op.or]: [
          {
            startDate: { [Op.between]: [start, end] }
          },
          {
            endDate: { [Op.between]: [start, end] }
          },
          {
            [Op.and]: [
              { startDate: { [Op.lte]: start } },
              { endDate: { [Op.gte]: end } }
            ]
          }
        ]
      }
    });

    if (conflictingSprint) {
      req.flash('error', '该时间段与其他迭代冲突');
      return res.redirect('back');
    }

    // 创建迭代
    const sprint = await Sprint.create({
      name,
      description,
      goal,
      projectId,
      creatorId: req.session.userId,
      startDate: start,
      endDate: end,
      capacity: capacity ? parseFloat(capacity) : 0
    });

    logger.info(`迭代创建成功: ${sprint.name}`, {
      userId: req.session.userId,
      sprintId: sprint.id
    });

    req.flash('success', '迭代创建成功！');
    res.redirect(`/sprints/${sprint.id}`);

  } catch (error) {
    logger.error('创建迭代失败:', error);
    req.flash('error', '创建迭代失败：' + error.message);
    res.redirect('back');
  }
});

// 编辑迭代页面
router.get('/:id/edit', requireAuth, async (req, res) => {
  try {
    const sprintId = req.params.id;

    const sprint = await Sprint.findByPk(sprintId, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!sprint) {
      req.flash('error', '迭代不存在');
      return res.redirect('/sprints');
    }

    // 检查用户权限：管理员、项目owner、项目leader 或迭代创建者
    let hasPermission = req.session.user?.role === 'admin' ||
                       sprint.project.ownerId === req.session.userId ||
                       sprint.project.leaderId === req.session.userId ||
                       sprint.creatorId === req.session.userId;

    if (!hasPermission) {
      // 检查是否是有权限的项目成员
      const { ProjectMember } = require('../models');
      const membership = await ProjectMember.findOne({
        where: {
          projectId: sprint.projectId,
          userId: req.session.userId,
          status: 'active'
        }
      });

      // 项目成员如果有创建任务权限，也可以编辑迭代
      hasPermission = membership && membership.permissions.canCreateTasks;
    }

    if (!hasPermission) {
      req.flash('error', '您没有权限编辑此迭代');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 检查是否可以编辑：只有规划中和进行中的迭代可以编辑基本信息
    if (!['planning', 'active'].includes(sprint.status)) {
      req.flash('error', '已完成或已取消的迭代无法编辑');
      return res.redirect(`/sprints/${sprintId}`);
    }

    res.render('sprints/edit', {
      title: '编辑迭代',
      sprint,
      isCreateMode: false
    });

  } catch (error) {
    logger.error('获取编辑迭代页面失败:', error);
    req.flash('error', '页面加载失败');
    res.redirect('/sprints');
  }
});

// 更新迭代处理
router.post('/:id/edit', requireAuth, async (req, res) => {
  try {
    const sprintId = req.params.id;
    const {
      name,
      description,
      goal,
      startDate,
      endDate,
      capacity
    } = req.body;

    const sprint = await Sprint.findByPk(sprintId, {
      include: [
        {
          model: Project,
          as: 'project'
        }
      ]
    });

    if (!sprint) {
      req.flash('error', '迭代不存在');
      return res.redirect('/sprints');
    }

    // 检查用户权限
    let hasPermission = req.session.user?.role === 'admin' ||
                       sprint.project.ownerId === req.session.userId ||
                       sprint.project.leaderId === req.session.userId ||
                       sprint.creatorId === req.session.userId;

    if (!hasPermission) {
      const { ProjectMember } = require('../models');
      const membership = await ProjectMember.findOne({
        where: {
          projectId: sprint.projectId,
          userId: req.session.userId,
          status: 'active'
        }
      });

      hasPermission = membership && membership.permissions.canCreateTasks;
    }

    if (!hasPermission) {
      req.flash('error', '您没有权限编辑此迭代');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 检查是否可以编辑
    if (!['planning', 'active'].includes(sprint.status)) {
      req.flash('error', '已完成或已取消的迭代无法编辑');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 验证必填字段
    if (!name || !goal || !startDate || !endDate) {
      req.flash('error', '请填写所有必填字段');
      return res.redirect('back');
    }

    // 验证时间
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      req.flash('error', '结束时间必须晚于开始时间');
      return res.redirect('back');
    }

    // 检查时间冲突（排除当前迭代）
    const conflictingSprint = await Sprint.findOne({
      where: {
        projectId: sprint.projectId,
        id: { [Op.ne]: sprintId }, // 排除当前迭代
        status: ['planning', 'active'],
        [Op.or]: [
          {
            startDate: { [Op.between]: [start, end] }
          },
          {
            endDate: { [Op.between]: [start, end] }
          },
          {
            [Op.and]: [
              { startDate: { [Op.lte]: start } },
              { endDate: { [Op.gte]: end } }
            ]
          }
        ]
      }
    });

    if (conflictingSprint) {
      req.flash('error', '该时间段与其他迭代冲突');
      return res.redirect('back');
    }

    // 更新迭代
    await sprint.update({
      name,
      description,
      goal,
      startDate: start,
      endDate: end,
      capacity: capacity ? parseFloat(capacity) : 0
    });

    logger.info(`迭代更新成功: ${sprint.name}`, {
      userId: req.session.userId,
      sprintId: sprint.id
    });

    req.flash('success', '迭代更新成功！');
    res.redirect(`/sprints/${sprint.id}`);

  } catch (error) {
    logger.error('更新迭代失败:', error);
    req.flash('error', '更新迭代失败：' + error.message);
    res.redirect('back');
  }
});

// 开始迭代
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const sprintId = req.params.id;

    const sprint = await Sprint.findByPk(sprintId, {
      include: [
        {
          model: Project,
          as: 'project'
        }
      ]
    });

    if (!sprint) {
      req.flash('error', '迭代不存在');
      return res.redirect('/sprints');
    }

    // 检查用户权限
    let hasPermission = req.session.user?.role === 'admin' ||
                       sprint.project.ownerId === req.session.userId ||
                       sprint.project.leaderId === req.session.userId ||
                       sprint.creatorId === req.session.userId;

    if (!hasPermission) {
      const { ProjectMember } = require('../models');
      const membership = await ProjectMember.findOne({
        where: {
          projectId: sprint.projectId,
          userId: req.session.userId,
          status: 'active'
        }
      });

      hasPermission = membership && membership.permissions.canCreateTasks;
    }

    if (!hasPermission) {
      req.flash('error', '您没有权限操作此迭代');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 检查状态：只有规划中的迭代可以开始
    if (sprint.status !== 'planning') {
      req.flash('error', '只有规划中的迭代可以开始');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 检查是否有其他进行中的迭代
    const activeSprint = await Sprint.findOne({
      where: {
        projectId: sprint.projectId,
        status: 'active',
        id: { [Op.ne]: sprintId }
      }
    });

    if (activeSprint) {
      req.flash('error', '项目中已有进行中的迭代，请先完成或取消其他迭代');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 开始迭代
    await sprint.update({
      status: 'active'
    });

    logger.info(`迭代开始: ${sprint.name}`, {
      userId: req.session.userId,
      sprintId: sprint.id
    });

    req.flash('success', '迭代已开始！');
    res.redirect(`/sprints/${sprint.id}`);

  } catch (error) {
    logger.error('开始迭代失败:', error);
    req.flash('error', '开始迭代失败：' + error.message);
    res.redirect('back');
  }
});

// 完成迭代
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const sprintId = req.params.id;

    const sprint = await Sprint.findByPk(sprintId, {
      include: [
        {
          model: Project,
          as: 'project'
        },
        {
          model: BountyTask,
          as: 'tasks'
        }
      ]
    });

    if (!sprint) {
      req.flash('error', '迭代不存在');
      return res.redirect('/sprints');
    }

    // 检查用户权限
    let hasPermission = req.session.user?.role === 'admin' ||
                       sprint.project.ownerId === req.session.userId ||
                       sprint.project.leaderId === req.session.userId ||
                       sprint.creatorId === req.session.userId;

    if (!hasPermission) {
      const { ProjectMember } = require('../models');
      const membership = await ProjectMember.findOne({
        where: {
          projectId: sprint.projectId,
          userId: req.session.userId,
          status: 'active'
        }
      });

      hasPermission = membership && membership.permissions.canCreateTasks;
    }

    if (!hasPermission) {
      req.flash('error', '您没有权限操作此迭代');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 检查状态：只有进行中的迭代可以完成
    if (sprint.status !== 'active') {
      req.flash('error', '只有进行中的迭代可以完成');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 计算最终统计数据
    const completedTasks = sprint.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = sprint.tasks.length;

    // 更新迭代状态和统计
    await sprint.update({
      status: 'completed',
      actualEndDate: new Date(),
      stats: {
        ...sprint.stats,
        totalTasks: totalTasks,
        completedTasks: completedTasks
      }
    });

    logger.info(`迭代完成: ${sprint.name}`, {
      userId: req.session.userId,
      sprintId: sprint.id,
      completedTasks,
      totalTasks
    });

    req.flash('success', `迭代已完成！共完成 ${completedTasks}/${totalTasks} 个任务`);
    res.redirect(`/sprints/${sprint.id}`);

  } catch (error) {
    logger.error('完成迭代失败:', error);
    req.flash('error', '完成迭代失败：' + error.message);
    res.redirect('back');
  }
});

// 取消迭代
router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const sprintId = req.params.id;
    const { reason } = req.body;

    const sprint = await Sprint.findByPk(sprintId, {
      include: [
        {
          model: Project,
          as: 'project'
        }
      ]
    });

    if (!sprint) {
      req.flash('error', '迭代不存在');
      return res.redirect('/sprints');
    }

    // 检查用户权限：只有管理员、项目负责人或迭代创建者可以取消
    const hasPermission = req.session.user?.role === 'admin' ||
                         sprint.project.ownerId === req.session.userId ||
                         sprint.project.leaderId === req.session.userId ||
                         sprint.creatorId === req.session.userId;

    if (!hasPermission) {
      req.flash('error', '您没有权限取消此迭代');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 检查状态：已完成的迭代不能取消
    if (sprint.status === 'completed') {
      req.flash('error', '已完成的迭代无法取消');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 取消迭代
    await sprint.update({
      status: 'cancelled',
      description: sprint.description + (reason ? `\n\n取消原因：${reason}` : '')
    });

    logger.info(`迭代取消: ${sprint.name}`, {
      userId: req.session.userId,
      sprintId: sprint.id,
      reason: reason || '未提供原因'
    });

    req.flash('success', '迭代已取消');
    res.redirect(`/sprints/${sprint.id}`);

  } catch (error) {
    logger.error('取消迭代失败:', error);
    req.flash('error', '取消迭代失败：' + error.message);
    res.redirect('back');
  }
});

// 删除迭代
router.post('/:id/delete', requireAuth, async (req, res) => {
  try {
    const sprintId = req.params.id;

    const sprint = await Sprint.findByPk(sprintId, {
      include: [
        {
          model: Project,
          as: 'project'
        },
        {
          model: BountyTask,
          as: 'tasks'
        }
      ]
    });

    if (!sprint) {
      req.flash('error', '迭代不存在');
      return res.redirect('/sprints');
    }

    // 检查用户权限：只有管理员、项目负责人或迭代创建者可以删除
    const hasPermission = req.session.user?.role === 'admin' ||
                         sprint.project.ownerId === req.session.userId ||
                         sprint.project.leaderId === req.session.userId ||
                         sprint.creatorId === req.session.userId;

    if (!hasPermission) {
      req.flash('error', '您没有权限删除此迭代');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 检查是否可以删除：进行中的迭代不能直接删除
    if (sprint.status === 'active') {
      req.flash('error', '进行中的迭代无法删除，请先完成或取消');
      return res.redirect(`/sprints/${sprintId}`);
    }

    // 检查是否有关联的任务
    const taskCount = sprint.tasks.length;
    if (taskCount > 0) {
      // 如果有任务，需要处理关联关系
      // 将任务的 sprintId 设置为 null，而不是删除任务
      await BountyTask.update(
        { sprintId: null },
        { where: { sprintId: sprintId } }
      );
    }

    // 记录删除信息用于日志
    const sprintInfo = {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      taskCount: taskCount,
      projectId: sprint.projectId
    };

    // 删除迭代
    await sprint.destroy();

    logger.info(`迭代删除成功: ${sprintInfo.name}`, {
      userId: req.session.userId,
      sprintInfo,
      taskCount
    });

    req.flash('success', `迭代"${sprintInfo.name}"已删除${taskCount > 0 ? `，${taskCount}个关联任务已移出迭代` : ''}`);
    res.redirect('/sprints');

  } catch (error) {
    logger.error('删除迭代失败:', error);
    req.flash('error', '删除迭代失败：' + error.message);
    res.redirect('back');
  }
});

// 迭代详情页面 - 放在最后，避免拦截其他路由
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const sprintId = req.params.id;

    const sprint = await Sprint.findByPk(sprintId, {
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'key']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: BountyTask,
          as: 'tasks',
          include: [
            {
              model: User,
              as: 'assignee',
              attributes: ['id', 'firstName', 'lastName']
            },
            {
              model: User,
              as: 'publisher',
              attributes: ['id', 'firstName', 'lastName']
            }
          ]
        }
      ]
    });

    if (!sprint) {
      req.flash('error', '迭代不存在');
      return res.redirect('/sprints');
    }

    // 检查用户权限：管理员、项目owner、项目leader 或迭代创建者
    const hasPermission = req.session.user?.role === 'admin' ||
                         sprint.project.ownerId === req.session.userId ||
                         sprint.project.leaderId === req.session.userId ||
                         sprint.creatorId === req.session.userId;

    if (!hasPermission) {
      req.flash('error', '您没有权限查看此迭代');
      return res.redirect('/sprints');
    }

    // 计算任务统计
    const taskStats = {
      total: sprint.tasks.length,
      completed: sprint.tasks.filter(t => t.status === 'completed').length,
      inProgress: sprint.tasks.filter(t => t.status === 'in_progress').length,
      pending: sprint.tasks.filter(t => ['draft', 'published', 'assigned'].includes(t.status)).length
    };

    res.render('sprints/detail', {
      title: sprint.name,
      sprint,
      taskStats
    });

  } catch (error) {
    logger.error('获取迭代详情失败:', error);
    req.flash('error', '获取迭代详情失败');
    res.redirect('/sprints');
  }
});

module.exports = router;
