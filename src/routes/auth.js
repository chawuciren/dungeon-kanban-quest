const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User, UserWallet } = require('../models');
const config = require('../config');
const logger = require('../config/logger');

const router = express.Router();

// 注册
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('用户名长度必须在3-50个字符之间')
    .isAlphanumeric()
    .withMessage('用户名只能包含字母和数字'),
  body('email')
    .isEmail()
    .withMessage('请输入有效的邮箱地址'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码长度至少6个字符'),
  body('firstName')
    .notEmpty()
    .withMessage('请输入姓名'),
  body('lastName')
    .notEmpty()
    .withMessage('请输入姓氏')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { username, email, password, firstName, lastName } = req.body;

    // 检查用户是否已存在
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.username === username ? '用户名已存在' : '邮箱已被注册'
      });
    }

    // 创建用户
    const user = await User.create({
      username,
      email,
      password,
      firstName,
      lastName,
      role: 'swordsman',
      skillLevel: 'novice',
      status: 'active'
    });

    // 创建用户钱包
    await UserWallet.create({
      userId: user.id,
      goldBalance: config.gamification.dailyCoinReward, // 新用户奖励
      diamondBalance: 0,
      silverBalance: 0,
      copperBalance: 0
    });

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // 设置会话
    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      skillLevel: user.skillLevel
    };

    logger.info(`用户注册成功: ${username}`, { userId: user.id });

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    logger.error('注册失败:', error);
    res.status(500).json({
      success: false,
      message: '注册失败，请稍后重试'
    });
  }
});

// 登录
router.post('/login', [
  body('login')
    .notEmpty()
    .withMessage('请输入用户名或邮箱'),
  body('password')
    .notEmpty()
    .withMessage('请输入密码')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { login, password } = req.body;

    // 查找用户（支持用户名或邮箱登录）
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { username: login },
          { email: login }
        ]
      },
      include: [{
        model: UserWallet,
        as: 'wallet'
      }]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 验证密码
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: '账户已被禁用，请联系管理员'
      });
    }

    // 更新最后登录时间
    await user.update({ lastLoginAt: new Date() });

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // 设置会话
    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      skillLevel: user.skillLevel
    };

    logger.info(`用户登录成功: ${user.username}`, { userId: user.id });

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: user.toJSON(),
        wallet: user.wallet,
        token
      }
    });

  } catch (error) {
    logger.error('登录失败:', error);
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试'
    });
  }
});

// 退出登录
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error('退出登录失败:', err);
      return res.status(500).json({
        success: false,
        message: '退出登录失败'
      });
    }

    res.json({
      success: true,
      message: '退出登录成功'
    });
  });
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const user = await User.findByPk(req.session.userId, {
      include: [{
        model: UserWallet,
        as: 'wallet'
      }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: {
        user: user.toJSON(),
        wallet: user.wallet
      }
    });

  } catch (error) {
    logger.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
});

module.exports = router;
