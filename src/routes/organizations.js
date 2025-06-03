const express = require('express');
const router = express.Router();
const { Organization, User, Project, OrganizationMember } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

// 中间件：检查登录状态
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// 中间件：检查管理员权限
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    req.flash('error', '权限不足，只有管理员可以访问此功能');
    return res.redirect('/dashboard');
  }
  next();
};

// 公会列表页面
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';

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

    const { count, rows: organizations } = await Organization.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'firstName', 'lastName', 'username']
        },
        {
          model: Project,
          as: 'projects',
          attributes: ['id', 'name'],
          through: {
            attributes: ['relationshipType', 'status'],
            where: { status: 'active' }
          },
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // 计算每个公会的项目数量 - 同时设置到dataValues和直接属性
    organizations.forEach(org => {
      const projectCount = org.projects ? org.projects.length : 0;
      org.dataValues.projectCount = projectCount;
      org.projectCount = projectCount;
    });

    const totalPages = Math.ceil(count / limit);

    res.render('organizations/index', {
      title: '公会管理',
      organizations,
      pagination: {
        page,
        totalPages,
        total: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: { search, status }
    });

  } catch (error) {
    logger.error('获取公会列表失败:', error);
    req.flash('error', '获取公会列表失败');
    res.render('organizations/index', {
      title: '公会管理',
      organizations: [],
      pagination: { page: 1, totalPages: 0, hasNext: false, hasPrev: false, total: 0 },
      filters: { search: '', status: '' }
    });
  }
});

// 创建公会页面
router.get('/create', requireAuth, requireAdmin, (req, res) => {
  // 使用edit模板，但传入创建模式的参数
  res.render('organizations/edit', {
    title: '创建公会',
    organization: null, // 创建模式时organization为null
    isCreateMode: true // 标识这是创建模式
  });
});

// 创建公会处理
router.post('/create', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, slug, description, website, email, phone, address } = req.body;

    // 验证必填字段
    if (!name || !slug) {
      req.flash('error', '公会名称和标识符为必填项');
      return res.redirect('/organizations/create');
    }

    // 检查标识符是否已存在
    const existingOrg = await Organization.findOne({ where: { slug } });
    if (existingOrg) {
      req.flash('error', '公会标识符已存在');
      return res.redirect('/organizations/create');
    }

    // 创建公会（将空字符串转换为null以避免验证错误）
    const organization = await Organization.create({
      name,
      slug: slug.toLowerCase(),
      description: description || null,
      website: website || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      ownerId: req.session.userId,
      status: 'active'
    });

    logger.info(`公会创建成功: ${organization.name}`, {
      userId: req.session.userId,
      organizationId: organization.id
    });

    req.flash('success', '公会创建成功！');
    res.redirect(`/organizations/${organization.id}`);

  } catch (error) {
    logger.error('创建公会失败:', error);
    req.flash('error', '创建公会失败，请稍后重试');
    res.redirect('/organizations/create');
  }
});

// 公会详情页面
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const organizationId = req.params.id;

    const organization = await Organization.findByPk(organizationId, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'firstName', 'lastName', 'username', 'email']
        },
        {
          model: User,
          as: 'members',
          attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'avatar', 'role'],
          through: {
            attributes: ['status', 'joinedAt'],
            as: 'membership'
          }
        },
        {
          model: Project,
          as: 'projects',
          through: { attributes: ['relationshipType'] },
          include: [
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
        }
      ]
    });

    if (!organization) {
      req.flash('error', '公会不存在');
      return res.redirect('/organizations');
    }

    res.render('organizations/detail', {
      title: organization.name,
      organization
    });

  } catch (error) {
    logger.error('获取公会详情失败:', error);
    req.flash('error', '获取公会详情失败');
    res.redirect('/organizations');
  }
});

// 编辑公会页面
router.get('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.params.id;

    const organization = await Organization.findByPk(organizationId);

    if (!organization) {
      req.flash('error', '公会不存在');
      return res.redirect('/organizations');
    }

    res.render('organizations/edit', {
      title: '编辑公会',
      organization,
      isCreateMode: false // 标识这是编辑模式
    });

  } catch (error) {
    logger.error('获取公会信息失败:', error);
    req.flash('error', '获取公会信息失败');
    res.redirect('/organizations');
  }
});

// 更新公会处理
router.post('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.params.id;
    const { name, slug, description, website, email, phone, address, status } = req.body;

    const organization = await Organization.findByPk(organizationId);

    if (!organization) {
      req.flash('error', '公会不存在');
      return res.redirect('/organizations');
    }

    // 如果修改了标识符，检查是否已存在
    if (slug !== organization.slug) {
      const existingOrg = await Organization.findOne({
        where: {
          slug: slug.toLowerCase(),
          id: { [Op.ne]: organizationId }
        }
      });
      if (existingOrg) {
        req.flash('error', '公会标识符已存在');
        return res.redirect(`/organizations/${organizationId}/edit`);
      }
    }

    // 更新公会信息（将空字符串转换为null以避免验证错误）
    await organization.update({
      name,
      slug: slug.toLowerCase(),
      description: description || null,
      website: website || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      status
    });

    logger.info(`公会更新成功: ${organization.name}`, {
      userId: req.session.userId,
      organizationId: organization.id
    });

    req.flash('success', '公会信息更新成功！');
    res.redirect(`/organizations/${organization.id}`);

  } catch (error) {
    logger.error('更新公会失败:', error);
    req.flash('error', '更新公会失败，请稍后重试');
    res.redirect(`/organizations/${req.params.id}/edit`);
  }
});

// 组织成员管理页面
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const organizationId = req.params.id;

    const organization = await Organization.findByPk(organizationId, {
      include: [
        {
          model: User,
          as: 'members',
          attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'avatar', 'role'],
          through: {
            attributes: ['status', 'joinedAt', 'permissions'],
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

    if (!organization) {
      req.flash('error', '公会不存在');
      return res.redirect('/organizations');
    }

    // 检查权限：只有组织所有者或管理员可以管理成员
    const hasPermission = organization.ownerId === req.session.userId ||
                         req.session.user.role === 'admin';

    if (!hasPermission) {
      req.flash('error', '您没有权限管理此公会的成员');
      return res.redirect(`/organizations/${organizationId}`);
    }

    // 获取所有用户（用于添加新成员）
    const allUsers = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'role'],
      where: {
        id: {
          [Op.notIn]: organization.members.map(member => member.id)
        }
      },
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    res.render('organizations/members', {
      title: `${organization.name} - 成员管理`,
      organization,
      allUsers
    });

  } catch (error) {
    logger.error('获取组织成员失败:', error);
    req.flash('error', '获取组织成员失败');
    res.redirect('/organizations');
  }
});

// 添加组织成员
router.post('/:id/members', requireAuth, async (req, res) => {
  try {
    const organizationId = req.params.id;
    const { userId } = req.body;

    const organization = await Organization.findByPk(organizationId);
    if (!organization) {
      req.flash('error', '公会不存在');
      return res.redirect('/organizations');
    }

    // 检查权限
    const hasPermission = organization.ownerId === req.session.userId ||
                         req.session.user.role === 'admin';

    if (!hasPermission) {
      req.flash('error', '您没有权限管理此公会的成员');
      return res.redirect(`/organizations/${organizationId}`);
    }

    // 检查用户是否已经是成员
    const existingMember = await OrganizationMember.findOne({
      where: { organizationId, userId }
    });

    if (existingMember) {
      req.flash('error', '用户已经是公会成员');
      return res.redirect(`/organizations/${organizationId}/members`);
    }

    // 添加成员（组织级别不设置角色，角色在项目级别管理）
    await OrganizationMember.create({
      organizationId,
      userId,
      status: 'active',
      invitedBy: req.session.userId,
      permissions: {
        canManageOrganization: false,
        canManageMembers: false,
        canCreateProjects: true,
        canManageProjects: false,
        canViewReports: true,
        canManageBudget: false
      }
    });

    req.flash('success', '成员添加成功');
    res.redirect(`/organizations/${organizationId}/members`);

  } catch (error) {
    logger.error('添加组织成员失败:', error);
    req.flash('error', '添加成员失败');
    res.redirect(`/organizations/${req.params.id}/members`);
  }
});

// 移除组织成员
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const { id: organizationId, userId } = req.params;

    const organization = await Organization.findByPk(organizationId);
    if (!organization) {
      return res.status(404).json({ error: '公会不存在' });
    }

    // 检查权限
    const hasPermission = organization.ownerId === req.session.userId ||
                         req.session.user.role === 'admin';

    if (!hasPermission) {
      return res.status(403).json({ error: '权限不足' });
    }

    // 不能移除组织所有者
    if (userId === organization.ownerId) {
      return res.status(400).json({ error: '不能移除公会所有者' });
    }

    await OrganizationMember.destroy({
      where: { organizationId, userId }
    });

    res.json({ success: true });

  } catch (error) {
    logger.error('移除组织成员失败:', error);
    res.status(500).json({ error: '移除成员失败' });
  }
});

// 获取组织成员列表（API接口，用于项目创建时获取成员）
router.get('/:id/members/api', requireAuth, async (req, res) => {
  try {
    const organizationId = req.params.id;

    const organization = await Organization.findByPk(organizationId, {
      include: [
        {
          model: User,
          as: 'members',
          attributes: ['id', 'firstName', 'lastName', 'username', 'email'],
          through: {
            attributes: ['status'],
            as: 'membership'
          },
          where: {
            '$members.membership.status$': 'active'
          }
        }
      ]
    });

    if (!organization) {
      return res.status(404).json({ error: '公会不存在' });
    }

    res.json({
      success: true,
      members: organization.members || []
    });

  } catch (error) {
    logger.error('获取组织成员API失败:', error);
    res.status(500).json({ error: '获取成员列表失败' });
  }
});

module.exports = router;
