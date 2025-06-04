require('dotenv').config();

const config = {
  // 应用配置
  app: {
    name: process.env.APP_NAME || 'Kanban项目管理系统',
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development'
  },

  // 数据库配置
  database: {
    path: process.env.DB_PATH || './database/kanban.db'
  },

  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  // 会话配置
  session: {
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
  },

  // 邮件配置
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },

  // 文件上传配置
  upload: {
    path: process.env.UPLOAD_PATH || './public/uploads',
    maxSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },

  // 游戏化系统配置
  gamification: {
    // 保留技能等级配置，用于用户技能评级
    skillLevels: {
      novice: { name: '新手', icon: '🔰', multiplier: 1.0 },
      bronze: { name: '青铜', icon: '🥉', multiplier: 1.1 },
      silver: { name: '白银', icon: '🥈', multiplier: 1.15 },
      gold: { name: '黄金', icon: '🥇', multiplier: 1.2 },
      diamond: { name: '钻石', icon: '💎', multiplier: 1.3 }
    },

    // 星级配置，用于任务难度评级
    starLevels: {
      1: { name: '简单', multiplier: 1.0 },
      2: { name: '普通', multiplier: 1.2 },
      3: { name: '中等', multiplier: 1.5 },
      4: { name: '困难', multiplier: 2.0 },
      5: { name: '极难', multiplier: 3.0 }
    },

    // 紧急程度配置
    urgencyLevels: {
      urgent: { name: '紧急', icon: '🔥', multiplier: 1.5 },
      important: { name: '重要', icon: '⚡', multiplier: 1.2 },
      normal: { name: '普通', icon: '📅', multiplier: 1.0 },
      delayed: { name: '延后', icon: '🕐', multiplier: 0.9 },
      frozen: { name: '冻结', icon: '❄️', multiplier: 0.0 }
    }
  },

  // 安全配置
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    rateLimitWindowMs: 15 * 60 * 1000, // 15分钟
    rateLimitMax: 100 // 每个窗口期最大请求数
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  }
};

module.exports = config;
