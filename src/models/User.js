const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const config = require('../config');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50],
      is: /^[a-zA-Z0-9_]+$/ // 允许字母、数字和下划线
    }
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      len: [6, 255]
    }
  },
  firstName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'first_name'
  },
  lastName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'last_name'
  },
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    defaultValue: 'active'
  },
  // 默认职业（仅作为参考，真正的角色在项目/组织级别管理）
  defaultRole: {
    type: DataTypes.ENUM('admin', 'product_manager', 'developer', 'tester', 'ui_designer', 'devops', 'client'),
    defaultValue: 'developer',
    field: 'default_role'
  },
  skillLevel: {
    type: DataTypes.ENUM('novice', 'bronze', 'silver', 'gold', 'diamond'),
    defaultValue: 'novice',
    field: 'skill_level'
  },
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'Asia/Shanghai'
  },
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'zh-CN'
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    field: 'last_login_at'
  },
  emailVerifiedAt: {
    type: DataTypes.DATE,
    field: 'email_verified_at'
  }
}, {
  tableName: 'users',
  indexes: [
    {
      unique: true,
      fields: ['username']
    },
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['status']
    },
    {
      fields: ['default_role']
    },
    {
      fields: ['skill_level']
    }
  ]
});

// 密码加密钩子
User.beforeCreate(async (user) => {
  if (user.password) {
    user.password = await bcrypt.hash(user.password, config.security.bcryptRounds);
  }
});

User.beforeUpdate(async (user) => {
  if (user.changed('password')) {
    user.password = await bcrypt.hash(user.password, config.security.bcryptRounds);
  }
});

// 实例方法
User.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

User.prototype.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

User.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password;
  return values;
};

// 类方法
User.findByEmail = function(email) {
  return this.findOne({ where: { email } });
};

User.findByUsername = function(username) {
  return this.findOne({ where: { username } });
};

module.exports = User;
