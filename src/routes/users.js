const express = require('express');
const router = express.Router();
const { User, UserWallet } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const { getAllRoles, isAdmin } = require('../config/roles');

// 中间件：检查登录状态
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    req.flash('error', '请先登录');
    return res.redirect('/login');
  }
  next();
};

// 中间件：检查管理员权限
const requireAdmin = (req, res, next) => {
  if (!req.session.user || !isAdmin(req.session.user.role)) {
    req.flash('error', '权限不足，只有公会管理员可以访问此功能');
    return res.redirect('/dashboard');
  }
  next();
};

// 用户列表页面
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';
    const skillLevel = req.query.skillLevel || '';

    // 构建查询条件
    const whereClause = {};

    if (search) {
      whereClause[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } }
      ];
    }

    if (role) {
      whereClause.role = role;
    }

    if (status) {
      whereClause.status = status;
    }

    if (skillLevel) {
      whereClause.skillLevel = skillLevel;
    }

    // 获取用户列表
    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: UserWallet,
          as: 'wallet',
          attributes: ['diamondBalance', 'goldBalance', 'silverBalance', 'copperBalance']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.render('users/index', {
      title: '冒险者管理',
      users,
      pagination: {
        page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        total: count
      },
      filters: {
        search,
        role,
        status,
        skillLevel
      },
      roles: getAllRoles()
    });

  } catch (error) {
    logger.error('获取用户列表失败:', error);
    req.flash('error', '获取用户列表失败');
    res.render('users/index', {
      title: '冒险者管理',
      users: [],
      pagination: { page: 1, totalPages: 0, hasNext: false, hasPrev: false, total: 0 },
      filters: { search: '', role: '', status: '', skillLevel: '' },
      roles: getAllRoles()
    });
  }
});

// 添加用户页面
router.get('/create', requireAuth, requireAdmin, (req, res) => {
  res.render('users/edit', {
    title: '招募冒险者',
    editUser: null, // 创建模式时editUser为null
    roles: getAllRoles(),
    isCreateMode: true // 标识这是创建模式
  });
});

// 添加用户处理
router.post('/create', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
      skillLevel,
      status
    } = req.body;

    // 验证必填字段
    if (!username || !email || !password || !firstName || !lastName) {
      req.flash('error', '请填写所有必填字段');
      return res.redirect('/users/create');
    }

    // 检查用户名是否重复
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      req.flash('error', '用户名或邮箱已存在');
      return res.redirect('/users/create');
    }

    // 创建用户
    const user = await User.create({
      username,
      email,
      password,
      firstName,
      lastName,
      phone: phone || null,
      role: role || 'developer', // 默认为开发者
      skillLevel: skillLevel || 'novice',
      status: status || 'active'
    });

    // 创建用户钱包
    await UserWallet.create({
      userId: user.id,
      diamondBalance: 0,
      copperBalance: 100, // 新用户赠送100铜币
      silverBalance: 0,
      copperBalance: 0
    });

    logger.info(`用户创建成功: ${username}`, {
      userId: user.id,
      createdBy: req.session.userId
    });

    req.flash('success', '用户创建成功！');
    res.redirect('/users');

  } catch (error) {
    logger.error('创建用户失败:', error);
    req.flash('error', '创建用户失败：' + error.message);
    res.redirect('/users/create');
  }
});

// 编辑用户页面
router.get('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findByPk(userId, {
      include: [
        {
          model: UserWallet,
          as: 'wallet'
        }
      ]
    });

    if (!user) {
      req.flash('error', '用户不存在');
      return res.redirect('/users');
    }

    res.render('users/edit', {
      title: '编辑冒险者档案',
      editUser: user,
      roles: getAllRoles(),
      isCreateMode: false // 标识这是编辑模式
    });

  } catch (error) {
    logger.error('获取用户信息失败:', error);
    req.flash('error', '获取用户信息失败');
    res.redirect('/users');
  }
});

// 编辑用户处理
router.post('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const {
      username,
      email,
      firstName,
      lastName,
      phone,
      role,
      skillLevel,
      status,
      password
    } = req.body;

    const user = await User.findByPk(userId);

    if (!user) {
      req.flash('error', '用户不存在');
      return res.redirect('/users');
    }

    // 检查用户名和邮箱是否重复（排除当前用户）
    const existingUser = await User.findOne({
      where: {
        [Op.and]: [
          { id: { [Op.ne]: userId } },
          {
            [Op.or]: [
              { username },
              { email }
            ]
          }
        ]
      }
    });

    if (existingUser) {
      req.flash('error', '用户名或邮箱已被其他用户使用');
      return res.redirect(`/users/${userId}/edit`);
    }

    // 更新用户信息
    const updateData = {
      username,
      email,
      firstName,
      lastName,
      phone: phone || null,
      role: role || 'developer',
      skillLevel: skillLevel || 'novice',
      status: status || 'active'
    };

    // 如果提供了新密码，则更新密码
    if (password && password.trim()) {
      updateData.password = password;
    }

    await user.update(updateData);

    logger.info(`用户信息更新成功: ${username}`, {
      userId: user.id,
      updatedBy: req.session.userId
    });

    req.flash('success', '用户信息更新成功！');
    res.redirect('/users');

  } catch (error) {
    logger.error('更新用户失败:', error);
    req.flash('error', '更新用户失败：' + error.message);
    res.redirect(`/users/${req.params.id}/edit`);
  }
});

// 删除用户（软删除）
router.post('/:id/delete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // 不能删除自己
    if (userId === req.session.userId) {
      req.flash('error', '不能删除自己的账户');
      return res.redirect('/users');
    }

    const user = await User.findByPk(userId);

    if (!user) {
      req.flash('error', '用户不存在');
      return res.redirect('/users');
    }

    // 软删除：将状态设为suspended
    await user.update({ status: 'suspended' });

    logger.info(`用户已被禁用: ${user.username}`, {
      userId: user.id,
      deletedBy: req.session.userId
    });

    req.flash('success', '用户已被禁用');
    res.redirect('/users');

  } catch (error) {
    logger.error('禁用用户失败:', error);
    req.flash('error', '禁用用户失败');
    res.redirect('/users');
  }
});

// 重置用户密码
router.post('/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      req.flash('error', '新密码长度至少6位');
      return res.redirect(`/users/${userId}/edit`);
    }

    const user = await User.findByPk(userId);

    if (!user) {
      req.flash('error', '用户不存在');
      return res.redirect('/users');
    }

    await user.update({ password: newPassword });

    logger.info(`用户密码已重置: ${user.username}`, {
      userId: user.id,
      resetBy: req.session.userId
    });

    req.flash('success', '密码重置成功');
    res.redirect('/users');

  } catch (error) {
    logger.error('重置密码失败:', error);
    req.flash('error', '重置密码失败');
    res.redirect('/users');
  }
});

module.exports = router;
