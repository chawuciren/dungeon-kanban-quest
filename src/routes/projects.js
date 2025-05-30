const express = require('express');
const router = express.Router();
const { Project, Organization, User, BountyTask } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

// 中间件：检查登录状态
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// 项目列表页面
router.get('/', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const type = req.query.type || '';

    // 构建查询条件
    const whereClause = {};

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    if (status) {
      whereClause.status = status;
    }

    if (type) {
      whereClause.projectType = type;
    }

    // 获取项目列表
    const { count, rows: projects } = await Project.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'leader',
          attributes: ['id', 'firstName', 'lastName', 'avatar']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // 为每个项目获取任务统计
    for (let project of projects) {
      try {
        const taskStats = await BountyTask.findAll({
          where: { projectId: project.id },
          attributes: [
            'status',
            [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
          ],
          group: ['status'],
          raw: true
        });

        project.dataValues.taskStats = {
          total: 0,
          published: 0,
          assigned: 0,
          completed: 0
        };

        taskStats.forEach(stat => {
          project.dataValues.taskStats[stat.status] = parseInt(stat.count);
          project.dataValues.taskStats.total += parseInt(stat.count);
        });
      } catch (statError) {
        logger.error(`获取项目 ${project.id} 任务统计失败:`, statError);
        // 设置默认统计数据
        project.dataValues.taskStats = {
          total: 0,
          published: 0,
          assigned: 0,
          completed: 0
        };
      }
    }

    const totalPages = Math.ceil(count / limit);

    res.render('projects/index', {
      title: '项目管理',
      projects,
      pagination: {
        page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        total: count
      },
      filters: {
        search,
        status,
        type
      }
    });

  } catch (error) {
    logger.error('获取项目列表失败:', error);
    req.flash('error', '获取项目列表失败');
    res.render('projects/index', {
      title: '项目管理',
      projects: [],
      pagination: { page: 1, totalPages: 0, hasNext: false, hasPrev: false, total: 0 },
      filters: { search: '', status: '', type: '' }
    });
  }
});

// 项目创建页面
router.get('/create', requireAuth, async (req, res) => {
  try {
    // 获取用户所属的组织
    const organizations = await Organization.findAll({
      where: {
        [Op.or]: [
          { ownerId: req.session.userId },
          // 这里可以添加用户是成员的组织查询
        ]
      },
      order: [['name', 'ASC']]
    });

    // 获取组织内的用户作为潜在负责人
    const potentialLeaders = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'username'],
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    // 使用edit模板，但传入创建模式的参数
    res.render('projects/edit', {
      title: '创建大陆',
      project: null, // 创建模式时project为null
      organizations,
      potentialLeaders,
      isCreateMode: true // 标识这是创建模式
    });

  } catch (error) {
    logger.error('获取组织列表失败:', error);
    req.flash('error', '获取组织列表失败');
    res.redirect('/projects');
  }
});

// 项目创建处理
router.post('/create', requireAuth, async (req, res) => {
  try {
    const {
      name,
      key,
      description,
      projectType,
      starLevel,
      organizationId,
      leaderId,
      startDate,
      endDate,
      visibility
    } = req.body;

    // 验证必填字段
    if (!name || !key || !organizationId) {
      req.flash('error', '请填写必填字段');
      return res.redirect('/projects/create');
    }

    // 检查项目key是否重复
    const existingProject = await Project.findOne({
      where: {
        organizationId,
        key
      }
    });

    if (existingProject) {
      req.flash('error', '项目标识已存在');
      return res.redirect('/projects/create');
    }

    // 创建项目
    const project = await Project.create({
      name,
      key: key.toUpperCase(),
      description,
      projectType: projectType || 'construction',
      starLevel: parseInt(starLevel) || 3,
      status: 'planning',
      visibility: visibility || 'private',
      organizationId,
      ownerId: req.session.userId,
      leaderId: leaderId || req.session.userId,
      startDate: startDate || null,
      endDate: endDate || null
    });

    logger.info(`项目创建成功: ${project.name}`, {
      userId: req.session.userId,
      projectId: project.id
    });

    req.flash('success', '项目创建成功！');
    res.redirect(`/projects/${project.id}`);

  } catch (error) {
    logger.error('创建项目失败:', error);
    req.flash('error', '创建项目失败，请稍后重试');
    res.redirect('/projects/create');
  }
});

// 项目详情页面
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;

    const project = await Project.findByPk(projectId, {
      include: [
        {
          model: Organization,
          as: 'organization'
        },
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'firstName', 'lastName', 'avatar', 'email']
        },
        {
          model: User,
          as: 'leader',
          attributes: ['id', 'firstName', 'lastName', 'avatar', 'email']
        }
      ]
    });

    if (!project) {
      req.flash('error', '项目不存在');
      return res.redirect('/projects');
    }

    // 获取项目任务统计
    const taskStats = await BountyTask.findAll({
      where: { projectId: project.id },
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const stats = {
      total: 0,
      published: 0,
      assigned: 0,
      completed: 0
    };

    taskStats.forEach(stat => {
      stats[stat.status] = parseInt(stat.count);
      stats.total += parseInt(stat.count);
    });

    // 获取最近的任务
    const recentTasks = await BountyTask.findAll({
      where: { projectId: project.id },
      include: [
        {
          model: User,
          as: 'publisher',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    res.render('projects/detail', {
      title: `${project.name} - 项目详情`,
      project,
      stats,
      recentTasks
    });

  } catch (error) {
    logger.error('获取项目详情失败:', error);
    req.flash('error', '获取项目详情失败');
    res.redirect('/projects');
  }
});

// 编辑项目页面
router.get('/:id/edit', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;

    const project = await Project.findByPk(projectId, {
      include: [
        {
          model: Organization,
          as: 'organization'
        },
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'leader',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!project) {
      req.flash('error', '项目不存在');
      return res.redirect('/projects');
    }

    // 检查权限：只有项目所有者、负责人或管理员可以编辑
    const hasPermission = project.ownerId === req.session.userId ||
                         project.leaderId === req.session.userId ||
                         req.session.userRole === 'guild_master';

    if (!hasPermission) {
      req.flash('error', '您没有权限编辑此项目');
      return res.redirect(`/projects/${projectId}`);
    }

    // 获取用户所属的组织
    const organizations = await Organization.findAll({
      where: {
        [Op.or]: [
          { ownerId: req.session.userId },
          // 这里可以添加用户是成员的组织查询
        ]
      },
      order: [['name', 'ASC']]
    });

    // 获取组织内的用户作为潜在负责人
    const potentialLeaders = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'username'],
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    res.render('projects/edit', {
      title: '编辑大陆',
      project,
      organizations,
      potentialLeaders,
      isCreateMode: false // 标识这是编辑模式
    });

  } catch (error) {
    logger.error('获取项目编辑页面失败:', error);
    req.flash('error', '获取项目信息失败');
    res.redirect('/projects');
  }
});

// 更新项目处理
router.post('/:id/edit', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const {
      name,
      key,
      description,
      projectType,
      starLevel,
      organizationId,
      leaderId,
      startDate,
      endDate,
      visibility,
      status
    } = req.body;

    const project = await Project.findByPk(projectId);

    if (!project) {
      req.flash('error', '项目不存在');
      return res.redirect('/projects');
    }

    // 检查权限：只有项目所有者、负责人或管理员可以编辑
    const hasPermission = project.ownerId === req.session.userId ||
                         project.leaderId === req.session.userId ||
                         req.session.userRole === 'guild_master';

    if (!hasPermission) {
      req.flash('error', '您没有权限编辑此项目');
      return res.redirect(`/projects/${projectId}`);
    }

    // 如果修改了项目key，检查是否在同一组织内重复
    if (key !== project.key) {
      const existingProject = await Project.findOne({
        where: {
          organizationId: organizationId || project.organizationId,
          key: key.toUpperCase(),
          id: { [Op.ne]: projectId }
        }
      });

      if (existingProject) {
        req.flash('error', '项目标识在该组织内已存在');
        return res.redirect(`/projects/${projectId}/edit`);
      }
    }

    // 更新项目信息
    await project.update({
      name,
      key: key.toUpperCase(),
      description,
      projectType: projectType || project.projectType,
      starLevel: parseInt(starLevel) || project.starLevel,
      status: status || project.status,
      visibility: visibility || project.visibility,
      organizationId: organizationId || project.organizationId,
      leaderId: leaderId || project.leaderId,
      startDate: startDate || null,
      endDate: endDate || null
    });

    logger.info(`项目更新成功: ${project.name}`, {
      userId: req.session.userId,
      projectId: project.id
    });

    req.flash('success', '项目信息更新成功！');
    res.redirect(`/projects/${project.id}`);

  } catch (error) {
    logger.error('更新项目失败:', error);
    req.flash('error', '更新项目失败，请稍后重试');
    res.redirect(`/projects/${req.params.id}/edit`);
  }
});

module.exports = router;
