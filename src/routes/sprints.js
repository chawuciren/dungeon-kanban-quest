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

// 探险季列表页面
router.get('/', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const projectId = req.session.selectedProjectId;
    const status = req.query.status;

    let where = {
      projectId: projectId // 只显示当前选中项目的探险季
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
      title: '探险季管理',
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
    logger.error('获取探险季列表失败:', error);
    req.flash('error', '获取探险季列表失败');
    res.redirect('/dashboard');
  }
});

// 创建探险季页面
router.get('/create', requireAuth, requireProjectSelection, validateProjectAccess, async (req, res) => {
  try {
    // 获取当前选中的项目信息
    const selectedProject = await Project.findByPk(req.session.selectedProjectId, {
      attributes: ['id', 'name', 'key']
    });

    if (!selectedProject) {
      req.flash('error', '请先选择要创建探险季的大陆');
      return res.redirect('/sprints');
    }

    res.render('sprints/create', {
      title: '创建探险季',
      selectedProject
    });

  } catch (error) {
    logger.error('获取创建探险季页面失败:', error);
    req.flash('error', '页面加载失败');
    res.redirect('/sprints');
  }
});

// 创建探险季处理
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

      // 项目成员如果有创建任务权限，也可以创建探险季
      hasPermission = membership && membership.permissions.canCreateTasks;
    }

    if (!hasPermission) {
      req.flash('error', '您没有权限在此项目中创建探险季');
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
      req.flash('error', '该时间段与其他探险季冲突');
      return res.redirect('back');
    }

    // 创建探险季
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

    logger.info(`探险季创建成功: ${sprint.name}`, {
      userId: req.session.userId,
      sprintId: sprint.id
    });

    req.flash('success', '探险季创建成功！');
    res.redirect(`/sprints/${sprint.id}`);

  } catch (error) {
    logger.error('创建探险季失败:', error);
    req.flash('error', '创建探险季失败：' + error.message);
    res.redirect('back');
  }
});

// 探险季详情页面 - 放在最后，避免拦截其他路由
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
      req.flash('error', '探险季不存在');
      return res.redirect('/sprints');
    }

    // 检查用户权限：管理员、项目owner、项目leader 或探险季创建者
    const hasPermission = req.session.user?.role === 'admin' ||
                         sprint.project.ownerId === req.session.userId ||
                         sprint.project.leaderId === req.session.userId ||
                         sprint.creatorId === req.session.userId;

    if (!hasPermission) {
      req.flash('error', '您没有权限查看此探险季');
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
    logger.error('获取探险季详情失败:', error);
    req.flash('error', '获取探险季详情失败');
    res.redirect('/sprints');
  }
});

module.exports = router;
