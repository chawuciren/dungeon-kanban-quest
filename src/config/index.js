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
    // 每日签到奖励配置
    dailyCheckin: {
      // 基础奖励（所有用户都获得）
      baseRewards: {
        gold: process.env.DAILY_BASE_GOLD !== undefined ? parseInt(process.env.DAILY_BASE_GOLD) : 20,
        silver: process.env.DAILY_BASE_SILVER !== undefined ? parseInt(process.env.DAILY_BASE_SILVER) : 50,
        copper: process.env.DAILY_BASE_COPPER !== undefined ? parseInt(process.env.DAILY_BASE_COPPER) : 0,
        diamond: process.env.DAILY_BASE_DIAMOND !== undefined ? parseInt(process.env.DAILY_BASE_DIAMOND) : 0
      },

      // 角色额外奖励（在基础奖励之上增加）
      roleBonus: {
        // 委托贵族（客户）额外奖励
        client: {
          gold: process.env.DAILY_CLIENT_BONUS_GOLD !== undefined ? parseInt(process.env.DAILY_CLIENT_BONUS_GOLD) : 80,      // 额外80金币，总计100金币
          silver: process.env.DAILY_CLIENT_BONUS_SILVER !== undefined ? parseInt(process.env.DAILY_CLIENT_BONUS_SILVER) : 200, // 额外200银币，总计250银币
          copper: process.env.DAILY_CLIENT_BONUS_COPPER !== undefined ? parseInt(process.env.DAILY_CLIENT_BONUS_COPPER) : 0,
          diamond: process.env.DAILY_CLIENT_BONUS_DIAMOND !== undefined ? parseInt(process.env.DAILY_CLIENT_BONUS_DIAMOND) : 1  // 额外1钻石
        },

        // 管理员额外奖励
        admin: {
          gold: process.env.DAILY_ADMIN_BONUS_GOLD !== undefined ? parseInt(process.env.DAILY_ADMIN_BONUS_GOLD) : 50,       // 额外50金币，总计70金币
          silver: process.env.DAILY_ADMIN_BONUS_SILVER !== undefined ? parseInt(process.env.DAILY_ADMIN_BONUS_SILVER) : -50,  // 减少50银币，总计0银币
          copper: process.env.DAILY_ADMIN_BONUS_COPPER !== undefined ? parseInt(process.env.DAILY_ADMIN_BONUS_COPPER) : 0,
          diamond: process.env.DAILY_ADMIN_BONUS_DIAMOND !== undefined ? parseInt(process.env.DAILY_ADMIN_BONUS_DIAMOND) : 2   // 额外2钻石
        },

        // 普通用户（开发者、测试等）无额外奖励
        developer: {
          gold: 0,
          silver: 0,
          copper: 0,
          diamond: 0
        },

        // 其他角色也可以在这里配置
        tester: {
          gold: 0,
          silver: 0,
          copper: 0,
          diamond: 0
        },

        ui_designer: {
          gold: 0,
          silver: 0,
          copper: 0,
          diamond: 0
        }
      }
    },

    // 货币汇率
    currencyRates: {
      diamond: parseInt(process.env.CURRENCY_RATE_DIAMOND) || 1000, // 1钻石 = 1000金币
      gold: parseInt(process.env.CURRENCY_RATE_GOLD) || 100,        // 1金币 = 100银币
      silver: parseInt(process.env.CURRENCY_RATE_SILVER) || 100     // 1银币 = 100铜币
    },

    // 星级奖励倍数
    starMultipliers: {
      1: parseFloat(process.env.STAR_MULTIPLIER_1) || 1.0,
      2: parseFloat(process.env.STAR_MULTIPLIER_2) || 1.2,
      3: parseFloat(process.env.STAR_MULTIPLIER_3) || 1.5,
      4: parseFloat(process.env.STAR_MULTIPLIER_4) || 2.0,
      5: parseFloat(process.env.STAR_MULTIPLIER_5) || 3.0
    },

    // 紧急程度奖励
    urgencyMultipliers: {
      urgent: parseFloat(process.env.URGENCY_MULTIPLIER_URGENT) || 1.5,    // 🔥 紧急
      important: parseFloat(process.env.URGENCY_MULTIPLIER_IMPORTANT) || 1.2, // ⚡ 重要
      normal: parseFloat(process.env.URGENCY_MULTIPLIER_NORMAL) || 1.0,    // 📅 普通
      delayed: parseFloat(process.env.URGENCY_MULTIPLIER_DELAYED) || 0.9,   // 🕐 延后
      frozen: parseFloat(process.env.URGENCY_MULTIPLIER_FROZEN) || 0.0     // ❄️ 冻结
    },

    // 技能等级奖励
    skillMultipliers: {
      novice: parseFloat(process.env.SKILL_MULTIPLIER_NOVICE) || 1.1,   // 🔰 新手
      bronze: parseFloat(process.env.SKILL_MULTIPLIER_BRONZE) || 1.1,   // 🥉 铜牌
      silver: parseFloat(process.env.SKILL_MULTIPLIER_SILVER) || 1.15,  // 🥈 银牌
      gold: parseFloat(process.env.SKILL_MULTIPLIER_GOLD) || 1.2,       // 🥇 金牌
      diamond: parseFloat(process.env.SKILL_MULTIPLIER_DIAMOND) || 1.3  // 💎 钻石
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
