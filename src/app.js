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

// 信任代理（如果在反向代理后面）
app.set('trust proxy', 1);

// 视图引擎设置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://code.jquery.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"]
    }
  }
}));

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
app.use((req, res, next) => {
  res.locals.config = config;
  res.locals.user = req.session?.user || null;
  res.locals.currentUrl = req.url;
  res.locals.moment = require('moment');
  res.locals.messages = req.flash();
  next();
});

// 页面路由
app.use('/', require('./routes/pages'));

// 功能路由
app.use('/tasks', require('./routes/tasks'));
app.use('/projects', require('./routes/projects'));
app.use('/sprints', require('./routes/sprints'));
app.use('/organizations', require('./routes/organizations'));
app.use('/users', require('./routes/users'));

// API路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
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
    // 测试数据库连接
    await testConnection();

    // 同步数据库（开发环境）
    if (config.app.env === 'development') {
      await syncDatabase(false); // 不强制重建表
    }

    // 创建会话表
    await sessionStore.sync();

    // 启动HTTP服务器
    const server = app.listen(config.app.port, () => {
      logger.info(`🚀 服务器启动成功`);
      logger.info(`📍 地址: http://localhost:${config.app.port}`);
      logger.info(`🌍 环境: ${config.app.env}`);
      logger.info(`📊 数据库: ${config.database.path}`);
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
    logger.error('启动服务器失败:', error);
    process.exit(1);
  }
};

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  startServer();
}

module.exports = app;
