const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const flash = require('connect-flash');

// 导入配置和工具
const config = require('./config');
const logger = require('./config/logger');
const { sequelize, syncDatabase } = require('./models');
const { testConnection } = require('./config/database');

// 创建Express应用
const app = express();

// 开发环境不信任代理，避免协议检测问题
if (config.app.env === 'production') {
  app.set('trust proxy', 1);
} else {
  app.set('trust proxy', false);
}

// 视图引擎设置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// 安全中间件 - 开发环境禁用大部分安全策略
if (config.app.env === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'"]
      }
    }
  }));
} else {
  // 开发环境：完全禁用helmet以避免HTTPS重定向
  // 不使用任何helmet中间件，让HTML meta标签控制安全策略

  // 添加自定义响应头，明确禁用HTTPS升级
  app.use((req, res, next) => {
    // 移除可能导致HTTPS重定向的响应头
    res.removeHeader('Strict-Transport-Security');
    res.removeHeader('upgrade-insecure-requests');

    // 设置明确的安全策略，允许HTTP资源
    res.setHeader('Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: http: https:; " +
      "img-src 'self' data: http: https:; " +
      "font-src 'self' data: http: https:; " +
      "style-src 'self' 'unsafe-inline' http: https:; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http: https:;"
    );

    next();
  });
}

// CORS配置
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// 压缩响应
app.use(compression());

// 速率限制
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
  message: {
    error: '请求过于频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// 解析请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 会话存储
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'sessions',
  checkExpirationInterval: 15 * 60 * 1000, // 15分钟检查一次过期会话
  expiration: 24 * 60 * 60 * 1000 // 24小时过期
});

// 会话配置
app.use(session({
  ...config.session,
  store: sessionStore,
  name: 'kanban.sid'
}));

// Flash消息中间件
app.use(flash());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// 请求日志中间件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.session?.userId
  });
  next();
});

// 全局变量中间件
app.use(async (req, res, next) => {
  try {
    res.locals.config = config;
    res.locals.user = req.session?.user || null;
    res.locals.currentUrl = req.url;
    res.locals.moment = require('moment');
    res.locals.messages = req.flash();

    // 设置默认值
    res.locals.userProjects = [];
    res.locals.selectedProject = null;

    // 只有登录用户且不是静态资源请求时才查询项目
    if (req.session?.userId && req.method === 'GET' && !isStaticResource(req.url)) {
      try {
        const { Project, User } = require('./models');

        // 获取用户可访问的项目列表
        let userProjects = [];

        if (req.session.user?.role === 'admin') {
          // 管理员可以看到所有项目
          userProjects = await Project.findAll({
            attributes: ['id', 'name', 'key', 'description', 'projectType', 'starLevel', 'color'],
            order: [['name', 'ASC']]
          });
        } else {
          // 普通用户只能看到自己有权限的项目（owner、leader或active member）
          const { Op } = require('sequelize');

          // 首先获取用户作为owner或leader的项目
          const ownedProjects = await Project.findAll({
            attributes: ['id', 'name', 'key', 'description', 'projectType', 'starLevel', 'color'],
            where: {
              [Op.or]: [
                { ownerId: req.session.userId },
                { leaderId: req.session.userId }
              ]
            }
          });

          // 然后获取用户作为active member的项目
          const memberProjects = await Project.findAll({
            attributes: ['id', 'name', 'key', 'description', 'projectType', 'starLevel', 'color'],
            include: [{
              model: User,
              as: 'members',
              where: { id: req.session.userId },
              attributes: [],
              through: {
                where: { status: 'active' },
                attributes: []
              }
            }]
          });

          // 合并并去重
          const allProjects = [...ownedProjects, ...memberProjects];
          const uniqueProjects = allProjects.filter((project, index, self) =>
            index === self.findIndex(p => p.id === project.id)
          );

          userProjects = uniqueProjects.sort((a, b) => a.name.localeCompare(b.name));
        }

        res.locals.userProjects = userProjects;

        // 处理当前选中的项目
        let selectedProject = null;
        if (req.session.selectedProjectId) {
          selectedProject = userProjects.find(p => p.id === req.session.selectedProjectId);

          // 如果选中的项目不在用户可访问列表中，清除选择
          if (!selectedProject) {
            req.session.selectedProjectId = null;
          }
        }

        res.locals.selectedProject = selectedProject;

      } catch (error) {
        logger.error('获取用户项目列表失败:', error);
        res.locals.userProjects = [];
        res.locals.selectedProject = null;
      }
    }

    next();
  } catch (error) {
    logger.error('全局中间件错误:', error);
    next(error);
  }
});

// 判断是否为静态资源请求
function isStaticResource(url) {
  return url.includes('.map') ||
         url.startsWith('/css/') ||
         url.startsWith('/js/') ||
         url.startsWith('/images/') ||
         url.startsWith('/uploads/') ||
         url.startsWith('/favicon') ||
         url.includes('.css') ||
         url.includes('.js') ||
         url.includes('.png') ||
         url.includes('.jpg') ||
         url.includes('.jpeg') ||
         url.includes('.gif') ||
         url.includes('.svg') ||
         url.includes('.ico');
}

// 页面路由
app.use('/', require('./routes/pages'));

// 功能路由
app.use('/tasks', require('./routes/tasks'));
app.use('/projects', require('./routes/projects'));
app.use('/sprints', require('./routes/sprints'));
app.use('/organizations', require('./routes/organizations'));
app.use('/users', require('./routes/users'));
app.use('/leaderboard', require('./routes/leaderboard'));

// API路由
app.use('/api/auth', require('./routes/auth'));
// app.use('/api/users', require('./routes/users'));
// app.use('/api/organizations', require('./routes/organizations'));
// app.use('/api/projects', require('./routes/projects'));

// 404处理
app.use((req, res) => {
  res.status(404).render('error', {
    title: '页面未找到',
    error: {
      status: 404,
      message: '您访问的页面不存在'
    }
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('应用错误:', err);

  const status = err.status || 500;
  const message = config.app.env === 'production'
    ? '服务器内部错误'
    : err.message;

  res.status(status).render('error', {
    title: '系统错误',
    error: {
      status,
      message,
      stack: config.app.env === 'development' ? err.stack : null
    }
  });
});

// 启动服务器
const startServer = async () => {
  try {
    console.log('🚀 开始启动服务器...');
    console.log(`🌍 运行环境: ${config.app.env}`);
    console.log(`📍 监听端口: ${config.app.port}`);

    // 测试数据库连接
    console.log('📊 步骤 1/4: 测试数据库连接');
    await testConnection();

    // 同步数据库（开发环境）
    console.log('📊 步骤 2/4: 同步数据库模型');
    if (config.app.env === 'development') {
      await syncDatabase(false); // 不强制重建表
    } else {
      console.log('⏭️  生产环境跳过数据库同步');
    }

    // 创建会话表
    console.log('📊 步骤 3/4: 创建会话表');
    await sessionStore.sync();
    console.log('✅ 会话表创建成功');

    // 启动HTTP服务器
    console.log('📊 步骤 4/4: 启动HTTP服务器');
    const server = app.listen(config.app.port, () => {
      console.log('');
      console.log('🎉 服务器启动完成!');
      console.log('=====================================');
      logger.info(`🚀 服务器启动成功`);
      logger.info(`📍 地址: http://localhost:${config.app.port}`);
      logger.info(`🌍 环境: ${config.app.env}`);
      logger.info(`📊 数据库: ${config.database.path}`);
      console.log('=====================================');
    });

    // 优雅关闭
    const gracefulShutdown = (signal) => {
      logger.info(`收到 ${signal} 信号，开始优雅关闭...`);

      server.close(async () => {
        logger.info('HTTP服务器已关闭');

        try {
          await sequelize.close();
          logger.info('数据库连接已关闭');
          process.exit(0);
        } catch (error) {
          logger.error('关闭数据库连接时出错:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('');
    console.error('❌ 服务器启动失败!');
    console.error('=====================================');
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    console.error('=====================================');
    logger.error('启动服务器失败:', error);
    process.exit(1);
  }
};

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  startServer();
}

module.exports = app;
