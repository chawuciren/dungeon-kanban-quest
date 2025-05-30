const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Organization = sequelize.define('Organization', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [2, 100]
    }
  },
  slug: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      len: [2, 50],
      is: /^[a-z0-9-]+$/
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  logo: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  website: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isUrl: true
    }
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    defaultValue: 'active'
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {
      allowPublicProjects: false,
      defaultProjectVisibility: 'private',
      enableGamification: true,
      defaultCurrency: 'gold',
      workingHours: {
        start: '09:00',
        end: '18:00',
        timezone: 'Asia/Shanghai'
      },
      workingDays: [1, 2, 3, 4, 5] // 周一到周五
    }
  },
  // 组织级别的游戏化设置
  gamificationSettings: {
    type: DataTypes.JSON,
    defaultValue: {
      enableBountyTasks: true,
      enableLeaderboards: true,
      enableAchievements: true,
      dailyRewardEnabled: true,
      monthlyRewardEnabled: true,
      customRewardRules: []
    },
    field: 'gamification_settings'
  }
}, {
  tableName: 'organizations',
  indexes: [
    {
      unique: true,
      fields: ['slug']
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['status']
    }
  ]
});

// 实例方法
Organization.prototype.isOwner = function(userId) {
  return this.ownerId === userId;
};

Organization.prototype.updateSettings = async function(newSettings) {
  this.settings = { ...this.settings, ...newSettings };
  return this.save();
};

Organization.prototype.updateGamificationSettings = async function(newSettings) {
  this.gamificationSettings = { ...this.gamificationSettings, ...newSettings };
  return this.save();
};

// 类方法
Organization.findBySlug = function(slug) {
  return this.findOne({ where: { slug } });
};

Organization.findByOwner = function(ownerId) {
  return this.findAll({ where: { ownerId } });
};

module.exports = Organization;
