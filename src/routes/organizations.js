const express = require('express');
const router = express.Router();
const { Organization, User, Project } = require('../models');
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
    req.flash('error', '权限不足');
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
          attributes: ['id'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // 计算每个公会的项目数量
    organizations.forEach(org => {
      org.dataValues.projectCount = org.projects ? org.projects.length : 0;
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
  res.render('organizations/create', {
    title: '创建公会'
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

    // 创建公会
    const organization = await Organization.create({
      name,
      slug: slug.toLowerCase(),
      description,
      website,
      email,
      phone,
      address,
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
          model: Project,
          as: 'projects',
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
      organization
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

    // 更新公会信息
    await organization.update({
      name,
      slug: slug.toLowerCase(),
      description,
      website,
      email,
      phone,
      address,
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

module.exports = router;
