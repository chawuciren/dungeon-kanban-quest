const express = require('express');
const router = express.Router();
const { Project, Organization, User, BountyTask, ProjectOrganization, ProjectMember } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
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
          as: 'organizations',
          attributes: ['id', 'name', 'slug'],
          through: { attributes: ['relationshipType'] }
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

    // 为每个项目获取任务统计和成员数量
    for (let project of projects) {
      try {
        // 获取任务统计 - 使用原始SQL查询
        const taskStatsResult = await sequelize.query(
          'SELECT status, COUNT(*) as count FROM bounty_tasks WHERE project_id = ? GROUP BY status',
          {
            replacements: [project.id],
            type: QueryTypes.SELECT
          }
        );

        // 初始化任务统计
        const taskStats = {
          total: 0,
          published: 0,
          assigned: 0,
          completed: 0,
          draft: 0,
          cancelled: 0
        };

        // 处理任务统计结果
        taskStatsResult.forEach(stat => {
          const count = parseInt(stat.count) || 0;
          taskStats[stat.status] = count;
          taskStats.total += count;
        });

        // 获取成员数量 - 使用原始SQL查询
        const memberCountResult = await sequelize.query(
          'SELECT COUNT(*) as count FROM project_members WHERE project_id = ? AND status = ?',
          {
            replacements: [project.id, 'active'],
            type: QueryTypes.SELECT
          }
        );

        const memberCount = parseInt(memberCountResult[0]?.count) || 0;

        // 设置统计数据到项目对象 - 同时设置到dataValues和直接属性
        project.dataValues.taskStats = taskStats;
        project.dataValues.memberCount = memberCount;
        project.taskStats = taskStats;
        project.memberCount = memberCount;

      } catch (statError) {
        logger.error(`获取项目 ${project.id} 统计信息失败:`, statError);
        // 设置默认统计数据
        const defaultTaskStats = {
          total: 0,
          published: 0,
          assigned: 0,
          completed: 0
        };
        project.dataValues.taskStats = defaultTaskStats;
        project.dataValues.memberCount = 0;
        project.taskStats = defaultTaskStats;
        project.memberCount = 0;
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

    // 获取保存的表单数据（如果有的话）
    const formData = req.session.formData || {};
    delete req.session.formData; // 使用后清除

    // 使用edit模板，但传入创建模式的参数
    res.render('projects/edit', {
      title: '创建大陆',
      project: null, // 创建模式时project为null
      organizations,
      potentialLeaders,
      isCreateMode: true, // 标识这是创建模式
      formData // 传递保存的表单数据
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
      visibility,
      secondaryOrganizations
    } = req.body;

    // 验证必填字段
    if (!name || !key) {
      req.flash('error', '请填写必填字段');
      return res.redirect('/projects/create');
    }

    // 检查项目key是否重复（全局唯一）
    const existingProject = await Project.findOne({
      where: {
        key: key.toUpperCase()
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
      ownerId: req.session.userId,
      leaderId: leaderId || req.session.userId,
      startDate: startDate || null,
      endDate: endDate || null
    });

    // 如果选择了组织，创建项目与组织的关联
    if (organizationId) {
      await ProjectOrganization.create({
        projectId: project.id,
        organizationId: organizationId,
        relationshipType: 'primary',
        status: 'active'
      });
    }

    // 添加创建者为项目成员
    await ProjectMember.create({
      projectId: project.id,
      userId: req.session.userId,
      roles: ['admin', 'product_manager'],
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

    // 处理协作公会关联和成员自动加入
    const allOrganizationIds = [];

    // 添加主要公会
    if (organizationId) {
      allOrganizationIds.push(organizationId);
    }

    // 添加协作公会
    if (secondaryOrganizations) {
      const secondaryOrgIds = Array.isArray(secondaryOrganizations)
        ? secondaryOrganizations
        : [secondaryOrganizations];

      // 过滤掉与主要公会重复的组织
      const filteredSecondaryOrgIds = secondaryOrgIds.filter(orgId => orgId !== organizationId);

      // 创建协作公会关联
      for (const orgId of filteredSecondaryOrgIds) {
        try {
          await ProjectOrganization.create({
            projectId: project.id,
            organizationId: orgId,
            relationshipType: 'secondary',
            status: 'active'
          });
          allOrganizationIds.push(orgId);
        } catch (error) {
          // 如果有唯一约束冲突，记录警告但继续
          if (error.name === 'SequelizeUniqueConstraintError') {
            logger.warn(`跳过重复的组织关联: project=${project.id}, organization=${orgId}`);
          } else {
            throw error;
          }
        }
      }
    }

    // 自动加入所有相关公会的成员
    if (allOrganizationIds.length > 0) {
      const { OrganizationMember } = require('../models');

      // 获取所有公会的活跃成员
      const orgMembers = await OrganizationMember.findAll({
        where: {
          organizationId: { [Op.in]: allOrganizationIds },
          status: 'active'
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'role']
        }]
      });

      // 为每个成员创建项目成员记录（排除已存在的创建者）
      for (const orgMember of orgMembers) {
        if (orgMember.userId !== req.session.userId) {
          try {
            // 使用用户的默认职业作为项目角色
            const userRole = orgMember.user.role || 'developer';

            await ProjectMember.create({
              projectId: project.id,
              userId: orgMember.userId,
              roles: [userRole],
              status: 'active',
              invitedBy: req.session.userId,
              permissions: {
                canManageProject: false,
                canManageMembers: false,
                canCreateTasks: true,
                canAssignTasks: false,
                canDeleteTasks: false,
                canManageBudget: false,
                canViewReports: true
              }
            });
          } catch (error) {
            // 如果用户已经是成员，忽略错误继续
            if (!error.message.includes('Validation error')) {
              logger.warn(`添加项目成员失败: ${orgMember.userId}`, error);
            }
          }
        }
      }
    }

    logger.info(`项目创建成功: ${project.name}`, {
      userId: req.session.userId,
      projectId: project.id,
      organizationsCount: allOrganizationIds.length
    });

    req.flash('success', '项目创建成功！团队成员已自动加入项目。');
    res.redirect(`/projects/${project.id}`);

  } catch (error) {
    logger.error('创建项目失败:', error);

    // 处理验证错误
    if (error.name === 'SequelizeValidationError') {
      // 保存表单数据到session
      req.session.formData = {
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
        secondaryOrganizations
      };

      // 提取错误信息
      const errors = error.errors.map(err => {
        const fieldLabels = {
          name: '大陆名称',
          key: '大陆标识符',
          description: '大陆描述',
          projectType: '项目类型',
          starLevel: '星级',
          organizationId: '主要公会',
          leaderId: '项目负责人',
          startDate: '开始日期',
          endDate: '结束日期',
          visibility: '可见性'
        };

        const fieldLabel = fieldLabels[err.path] || err.path;
        let message = '';

        switch (err.validatorKey) {
          case 'len':
            message = `${fieldLabel}长度必须在${err.validatorArgs[0]}-${err.validatorArgs[1]}个字符之间`;
            break;
          case 'isUppercase':
            message = `${fieldLabel}必须使用大写字母`;
            break;
          case 'isAlphanumeric':
            message = `${fieldLabel}只能包含字母和数字`;
            break;
          case 'isEmail':
            message = `${fieldLabel}格式不正确`;
            break;
          case 'isUrl':
            message = `${fieldLabel}必须是有效的网址`;
            break;
          case 'min':
          case 'max':
            message = `${fieldLabel}数值超出允许范围`;
            break;
          default:
            message = `${fieldLabel}: ${err.message}`;
        }

        return { field: err.path, message };
      });

      return res.render('error/validation', {
        title: '大陆创建失败',
        errorContext: '大陆',
        errors,
        formData: req.session.formData,
        redirectUrl: '/projects/create',
        redirectDelay: 8
      });
    }

    // 处理其他错误
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
          as: 'organizations',
          attributes: ['id', 'name', 'slug'],
          through: { attributes: ['relationshipType'] }
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
        },
        {
          model: User,
          as: 'members',
          attributes: ['id', 'firstName', 'lastName', 'avatar', 'email', 'role'],
          through: {
            attributes: ['roles', 'status', 'joinedAt'],
            as: 'membership'
          }
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
          as: 'organizations',
          attributes: ['id', 'name', 'slug'],
          through: { attributes: ['relationshipType'] }
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
                         req.session.user.role === 'admin';

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

    // 获取保存的表单数据（如果有的话）
    const formData = req.session.formData || {};
    delete req.session.formData; // 使用后清除

    res.render('projects/edit', {
      title: '编辑大陆',
      project,
      organizations,
      potentialLeaders,
      isCreateMode: false, // 标识这是编辑模式
      formData // 传递保存的表单数据
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
      status,
      secondaryOrganizations
    } = req.body;

    const project = await Project.findByPk(projectId);

    if (!project) {
      req.flash('error', '项目不存在');
      return res.redirect('/projects');
    }

    // 检查权限：只有项目所有者、负责人或管理员可以编辑
    const hasPermission = project.ownerId === req.session.userId ||
                         project.leaderId === req.session.userId ||
                         req.session.user.role === 'admin';

    if (!hasPermission) {
      req.flash('error', '您没有权限编辑此项目');
      return res.redirect(`/projects/${projectId}`);
    }

    // 如果修改了项目key，检查是否全局重复
    if (key !== project.key) {
      const existingProject = await Project.findOne({
        where: {
          key: key.toUpperCase(),
          id: { [Op.ne]: projectId }
        }
      });

      if (existingProject) {
        req.flash('error', '项目标识已存在');
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
      leaderId: leaderId || project.leaderId,
      startDate: startDate || null,
      endDate: endDate || null
    });

    // 如果修改了组织关联，更新项目与组织的关联
    if (organizationId) {
      // 先删除现有的主要关联
      await ProjectOrganization.destroy({
        where: {
          projectId: project.id,
          relationshipType: 'primary'
        }
      });

      // 创建新的主要关联
      await ProjectOrganization.create({
        projectId: project.id,
        organizationId: organizationId,
        relationshipType: 'primary',
        status: 'active'
      });
    }

    // 处理协作公会关联更新
    if (secondaryOrganizations !== undefined) {
      // 先删除现有的协作关联
      await ProjectOrganization.destroy({
        where: {
          projectId: project.id,
          relationshipType: 'secondary'
        }
      });

      // 创建新的协作关联
      const secondaryOrgIds = Array.isArray(secondaryOrganizations)
        ? secondaryOrganizations
        : (secondaryOrganizations ? [secondaryOrganizations] : []);

      // 过滤掉与主要公会重复的组织
      const filteredSecondaryOrgIds = secondaryOrgIds.filter(orgId => orgId !== organizationId);

      for (const orgId of filteredSecondaryOrgIds) {
        try {
          await ProjectOrganization.create({
            projectId: project.id,
            organizationId: orgId,
            relationshipType: 'secondary',
            status: 'active'
          });
        } catch (error) {
          // 如果仍然有唯一约束冲突，记录警告但继续
          if (error.name === 'SequelizeUniqueConstraintError') {
            logger.warn(`跳过重复的组织关联: project=${project.id}, organization=${orgId}`);
          } else {
            throw error;
          }
        }
      }

      // 自动加入新公会的成员（只添加新成员，不删除现有成员）
      const allOrganizationIds = [];
      if (organizationId) allOrganizationIds.push(organizationId);
      allOrganizationIds.push(...secondaryOrgIds);

      if (allOrganizationIds.length > 0) {
        const { OrganizationMember } = require('../models');

        // 获取所有公会的活跃成员
        const orgMembers = await OrganizationMember.findAll({
          where: {
            organizationId: { [Op.in]: allOrganizationIds },
            status: 'active'
          },
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'role']
          }]
        });

        // 获取现有项目成员ID列表
        const existingMembers = await ProjectMember.findAll({
          where: { projectId: project.id },
          attributes: ['userId']
        });
        const existingMemberIds = existingMembers.map(m => m.userId);

        // 为新成员创建项目成员记录
        let addedCount = 0;
        for (const orgMember of orgMembers) {
          if (!existingMemberIds.includes(orgMember.userId)) {
            try {
              // 使用用户的默认职业作为项目角色
              const userRole = orgMember.user.role || 'developer';

              await ProjectMember.create({
                projectId: project.id,
                userId: orgMember.userId,
                roles: [userRole],
                status: 'active',
                invitedBy: req.session.userId,
                permissions: {
                  canManageProject: false,
                  canManageMembers: false,
                  canCreateTasks: true,
                  canAssignTasks: false,
                  canDeleteTasks: false,
                  canManageBudget: false,
                  canViewReports: true
                }
              });
              addedCount++;
            } catch (error) {
              logger.warn(`添加项目成员失败: ${orgMember.userId}`, error);
            }
          }
        }

        if (addedCount > 0) {
          req.flash('success', `项目信息更新成功！已自动添加 ${addedCount} 名新团队成员。`);
        } else {
          req.flash('success', '项目信息更新成功！');
        }
      } else {
        req.flash('success', '项目信息更新成功！');
      }
    } else {
      req.flash('success', '项目信息更新成功！');
    }

    logger.info(`项目更新成功: ${project.name}`, {
      userId: req.session.userId,
      projectId: project.id
    });

    res.redirect(`/projects/${project.id}`);

  } catch (error) {
    logger.error('更新项目失败:', error);

    // 处理验证错误
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
      // 保存表单数据到session
      req.session.formData = {
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
        status,
        secondaryOrganizations
      };

      // 提取错误信息
      const errors = error.errors ? error.errors.map(err => {
        const fieldLabels = {
          name: '大陆名称',
          key: '大陆标识符',
          description: '大陆描述',
          projectType: '项目类型',
          starLevel: '星级',
          organizationId: '主要公会',
          leaderId: '项目负责人',
          startDate: '开始日期',
          endDate: '结束日期',
          visibility: '可见性',
          status: '项目状态',
          project_id: '项目关联',
          organization_id: '公会关联'
        };

        const fieldLabel = fieldLabels[err.path] || err.path;
        let message = '';

        switch (err.validatorKey || err.type) {
          case 'len':
            message = `${fieldLabel}长度必须在${err.validatorArgs[0]}-${err.validatorArgs[1]}个字符之间`;
            break;
          case 'isUppercase':
            message = `${fieldLabel}必须使用大写字母`;
            break;
          case 'isAlphanumeric':
            message = `${fieldLabel}只能包含字母和数字`;
            break;
          case 'isEmail':
            message = `${fieldLabel}格式不正确`;
            break;
          case 'isUrl':
            message = `${fieldLabel}必须是有效的网址`;
            break;
          case 'min':
          case 'max':
            message = `${fieldLabel}数值超出允许范围`;
            break;
          case 'not_unique':
          case 'unique violation':
            if (err.path === 'project_id' || err.path === 'organization_id') {
              message = '选择的公会组合存在冲突，请检查主要公会和协作公会的设置';
            } else {
              message = `${fieldLabel}已存在，请使用其他值`;
            }
            break;
          default:
            message = `${fieldLabel}: ${err.message}`;
        }

        return { field: err.path, message };
      }) : [{ field: 'general', message: '更新项目时发生错误，请检查输入信息' }];

      return res.render('error/validation', {
        title: '大陆编辑失败',
        errorContext: '大陆',
        errors,
        formData: req.session.formData,
        redirectUrl: `/projects/${req.params.id}/edit`,
        redirectDelay: 8
      });
    }

    // 处理其他错误
    req.flash('error', '更新项目失败，请稍后重试');
    res.redirect(`/projects/${req.params.id}/edit`);
  }
});

// 项目成员管理页面
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;

    const project = await Project.findByPk(projectId, {
      include: [
        {
          model: User,
          as: 'members',
          attributes: ['id', 'firstName', 'lastName', 'avatar', 'email', 'username', 'role'],
          through: {
            attributes: ['roles', 'status', 'joinedAt', 'permissions'],
            as: 'membership'
          }
        },
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!project) {
      req.flash('error', '项目不存在');
      return res.redirect('/projects');
    }

    // 检查权限：只有项目所有者、负责人或管理员可以管理成员
    const hasPermission = project.ownerId === req.session.userId ||
                         project.leaderId === req.session.userId ||
                         req.session.user.role === 'admin';

    if (!hasPermission) {
      req.flash('error', '您没有权限管理此项目的成员');
      return res.redirect(`/projects/${projectId}`);
    }

    // 获取所有用户（用于添加新成员）
    const allUsers = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'role'],
      where: {
        id: {
          [Op.notIn]: project.members.map(member => member.id)
        }
      },
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    res.render('projects/members', {
      title: `${project.name} - 成员管理`,
      project,
      allUsers
    });

  } catch (error) {
    logger.error('获取项目成员失败:', error);
    req.flash('error', '获取项目成员失败');
    res.redirect('/projects');
  }
});

// 添加项目成员
router.post('/:id/members', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { userId, roles } = req.body;

    const project = await Project.findByPk(projectId);
    if (!project) {
      req.flash('error', '项目不存在');
      return res.redirect('/projects');
    }

    // 检查权限
    const hasPermission = project.ownerId === req.session.userId ||
                         project.leaderId === req.session.userId ||
                         req.session.user.role === 'admin';

    if (!hasPermission) {
      req.flash('error', '您没有权限管理此项目的成员');
      return res.redirect(`/projects/${projectId}`);
    }

    // 检查用户是否已经是成员
    const existingMember = await ProjectMember.findOne({
      where: { projectId, userId }
    });

    if (existingMember) {
      req.flash('error', '用户已经是项目成员');
      return res.redirect(`/projects/${projectId}/members`);
    }

    // 获取用户的角色
    const targetUser = await User.findByPk(userId);
    const defaultRoles = roles && roles.length > 0
      ? (Array.isArray(roles) ? roles : [roles])
      : [targetUser.role || 'developer'];

    // 添加成员
    await ProjectMember.create({
      projectId,
      userId,
      roles: defaultRoles,
      status: 'active',
      invitedBy: req.session.userId,
      permissions: {
        canManageProject: false,
        canManageMembers: false,
        canCreateTasks: true,
        canAssignTasks: false,
        canDeleteTasks: false,
        canManageBudget: false,
        canViewReports: true
      }
    });

    req.flash('success', '成员添加成功');
    res.redirect(`/projects/${projectId}/members`);

  } catch (error) {
    logger.error('添加项目成员失败:', error);
    req.flash('error', '添加成员失败');
    res.redirect(`/projects/${req.params.id}/members`);
  }
});

// 移除项目成员
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const { id: projectId, userId } = req.params;

    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }

    // 检查权限
    const hasPermission = project.ownerId === req.session.userId ||
                         project.leaderId === req.session.userId ||
                         req.session.user.role === 'admin';

    if (!hasPermission) {
      return res.status(403).json({ error: '权限不足' });
    }

    // 不能移除项目所有者
    if (userId === project.ownerId) {
      return res.status(400).json({ error: '不能移除项目所有者' });
    }

    await ProjectMember.destroy({
      where: { projectId, userId }
    });

    res.json({ success: true });

  } catch (error) {
    logger.error('移除项目成员失败:', error);
    res.status(500).json({ error: '移除成员失败' });
  }
});

// 删除项目
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.id;

    // 获取项目信息
    const project = await Project.findByPk(projectId, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id']
        }
      ]
    });

    if (!project) {
      return res.status(404).json({ error: '大陆不存在' });
    }

    // 权限检查：只有项目所有者或管理员可以删除项目
    const hasPermission = project.ownerId === req.session.userId ||
                         req.session.user.role === 'admin';

    if (!hasPermission) {
      return res.status(403).json({ error: '权限不足，只有大陆所有者或管理员可以删除大陆' });
    }

    // 检查项目是否有活跃的任务
    const activeTasks = await BountyTask.count({
      where: {
        projectId: projectId,
        status: { [Op.in]: ['published', 'assigned', 'in_progress'] }
      }
    });

    if (activeTasks > 0) {
      return res.status(400).json({
        error: `无法删除大陆，还有 ${activeTasks} 个活跃任务。请先完成或取消所有任务。`
      });
    }

    // 开始删除操作（使用事务确保数据一致性）
    const transaction = await sequelize.transaction();

    try {
      // 1. 删除项目成员关联
      await ProjectMember.destroy({
        where: { projectId: projectId },
        transaction
      });

      // 2. 删除项目组织关联
      await ProjectOrganization.destroy({
        where: { projectId: projectId },
        transaction
      });

      // 3. 删除所有任务（包括子任务）
      await BountyTask.destroy({
        where: { projectId: projectId },
        transaction
      });

      // 4. 删除探险季
      const { Sprint } = require('../models');
      await Sprint.destroy({
        where: { projectId: projectId },
        transaction
      });

      // 5. 最后删除项目本身
      await project.destroy({ transaction });

      // 提交事务
      await transaction.commit();

      logger.info(`项目删除成功: ${project.name}`, {
        userId: req.session.userId,
        projectId: project.id,
        projectName: project.name
      });

      res.json({ success: true, message: '大陆删除成功' });

    } catch (deleteError) {
      // 回滚事务
      await transaction.rollback();
      throw deleteError;
    }

  } catch (error) {
    logger.error('删除项目失败:', error);
    res.status(500).json({
      error: '删除大陆失败，请稍后重试',
      details: error.message
    });
  }
});

module.exports = router;
