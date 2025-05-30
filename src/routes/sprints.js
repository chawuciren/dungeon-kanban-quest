const express = require('express');
const router = express.Router();
const { Sprint, Project, User, BountyTask } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

// 中间件：检查用户是否已登录
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// 探险季列表页面
router.get('/', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId;
    const status = req.query.status;

    let where = {};

    // 项目筛选
    if (projectId) {
      where.projectId = projectId;
    } else {
      // 获取用户有权限的项目
      const userProjects = await Project.findAll({
        where: {
          [Op.or]: [
            { ownerId: req.session.userId },
            { leaderId: req.session.userId }
          ]
        },
        attributes: ['id']
      });
      const projectIds = userProjects.map(p => p.id);
      where.projectId = { [Op.in]: projectIds };
    }

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

    // 获取用户的项目列表用于筛选
    const projects = await Project.findAll({
      where: {
        [Op.or]: [
          { ownerId: req.session.userId },
          { leaderId: req.session.userId }
        ]
      },
      attributes: ['id', 'name', 'key'],
      order: [['name', 'ASC']]
    });

    const totalPages = Math.ceil(count / limit);

    res.render('sprints/index', {
      title: '探险季管理',
      sprints,
      projects,
      pagination: {
        page,
        totalPages,
        total: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        projectId: projectId || '',
        status: status || 'all'
      }
    });

  } catch (error) {
    logger.error('获取探险季列表失败:', error);
    req.flash('error', '获取探险季列表失败');
    res.redirect('/dashboard');
  }
});

// 探险季详情页面
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

    // 检查用户权限
    const hasPermission = sprint.project.ownerId === req.session.userId ||
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

// 创建探险季页面
router.get('/create', requireAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId;

    // 获取用户的项目列表
    const projects = await Project.findAll({
      where: {
        [Op.or]: [
          { ownerId: req.session.userId },
          { leaderId: req.session.userId }
        ]
      },
      attributes: ['id', 'name', 'key'],
      order: [['name', 'ASC']]
    });

    if (projects.length === 0) {
      req.flash('error', '您需要先创建或加入项目才能创建探险季');
      return res.redirect('/projects');
    }

    res.render('sprints/create', {
      title: '创建探险季',
      projects,
      selectedProjectId: projectId || ''
    });

  } catch (error) {
    logger.error('获取创建探险季页面失败:', error);
    req.flash('error', '页面加载失败');
    res.redirect('/sprints');
  }
});

// 创建探险季处理
router.post('/create', requireAuth, async (req, res) => {
  try {
    const {
      name,
      description,
      goal,
      projectId,
      startDate,
      endDate,
      capacity
    } = req.body;

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

    const hasPermission = project.ownerId === req.session.userId ||
                         project.leaderId === req.session.userId;
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

module.exports = router;
