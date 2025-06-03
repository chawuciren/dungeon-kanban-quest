const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../../public/uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 生成唯一文件名：用户ID_时间戳.扩展名
    const ext = path.extname(file.originalname);
    const filename = `${req.session.userId}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 只允许图片文件
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件'), false);
  }
};

// 创建multer实例
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1 // 只允许一个文件
  },
  fileFilter: fileFilter
});

// 头像上传中间件
const avatarUpload = upload.single('avatar');

// 包装中间件以处理错误
const handleAvatarUpload = (req, res, next) => {
  avatarUpload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        req.session.errorMessage = '文件大小不能超过2MB';
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        req.session.errorMessage = '只能上传一个文件';
      } else {
        req.session.errorMessage = '文件上传失败：' + err.message;
      }
      return res.redirect('/profile/edit');
    } else if (err) {
      req.session.errorMessage = err.message;
      return res.redirect('/profile/edit');
    }
    next();
  });
};

// 删除旧头像文件
const deleteOldAvatar = (avatarPath) => {
  if (avatarPath && avatarPath.startsWith('/uploads/avatars/')) {
    const fullPath = path.join(__dirname, '../../public', avatarPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (error) {
        console.error('删除旧头像失败:', error);
      }
    }
  }
};

module.exports = {
  handleAvatarUpload,
  deleteOldAvatar
};
