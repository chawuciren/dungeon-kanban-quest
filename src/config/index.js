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
    dailyCoinReward: parseInt(process.env.DAILY_COIN_REWARD) || 100,
    monthlyCoinReward: parseInt(process.env.MONTHLY_COIN_REWARD) || 3000,
    monthlyDiamondReward: parseInt(process.env.MONTHLY_DIAMOND_REWARD) || 10,
    
    // 货币汇率
    currencyRates: {
      diamond: 1000, // 1钻石 = 1000金币
      gold: 100,     // 1金币 = 100银币
      silver: 100    // 1银币 = 100铜币
    },

    // 星级奖励倍数
    starMultipliers: {
      1: 1.0,
      2: 1.2,
      3: 1.5,
      4: 2.0,
      5: 3.0
    },

    // 紧急程度奖励
    urgencyMultipliers: {
      urgent: 1.5,    // 🔥 紧急
      important: 1.2, // ⚡ 重要
      normal: 1.0,    // 📅 普通
      delayed: 0.9,   // 🕐 延后
      frozen: 0.0     // ❄️ 冻结
    },

    // 技能等级奖励
    skillMultipliers: {
      novice: 1.1,   // 🔰 新手
      bronze: 1.1,   // 🥉 铜牌
      silver: 1.15,  // 🥈 银牌
      gold: 1.2,     // 🥇 金牌
      diamond: 1.3   // 💎 钻石
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
