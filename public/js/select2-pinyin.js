/**
 * Select2 拼音搜索增强组件
 * 通过在显示文本中包含拼音信息来支持拼音搜索
 */

// 简化的拼音转换映射表（常用汉字）
const PINYIN_MAP = {
    // 常见姓氏
    '张': 'zhang', '李': 'li', '王': 'wang', '刘': 'liu', '陈': 'chen', '杨': 'yang', '赵': 'zhao', '黄': 'huang', '周': 'zhou', '吴': 'wu',
    '徐': 'xu', '孙': 'sun', '胡': 'hu', '朱': 'zhu', '高': 'gao', '林': 'lin', '何': 'he', '郭': 'guo', '马': 'ma', '罗': 'luo',
    '梁': 'liang', '宋': 'song', '郑': 'zheng', '谢': 'xie', '韩': 'han', '唐': 'tang', '冯': 'feng', '于': 'yu', '董': 'dong', '萧': 'xiao',
    '程': 'cheng', '曹': 'cao', '袁': 'yuan', '邓': 'deng', '许': 'xu', '傅': 'fu', '沈': 'shen', '曾': 'zeng', '彭': 'peng', '吕': 'lv',
    '苏': 'su', '卢': 'lu', '蒋': 'jiang', '蔡': 'cai', '贾': 'jia', '丁': 'ding', '魏': 'wei', '薛': 'xue', '叶': 'ye', '阎': 'yan',
    '余': 'yu', '潘': 'pan', '杜': 'du', '戴': 'dai', '夏': 'xia', '钟': 'zhong', '汪': 'wang', '田': 'tian', '任': 'ren', '姜': 'jiang',
    '范': 'fan', '方': 'fang', '石': 'shi', '姚': 'yao', '谭': 'tan', '廖': 'liao', '邹': 'zou', '熊': 'xiong', '金': 'jin', '陆': 'lu',
    '郝': 'hao', '孔': 'kong', '白': 'bai', '崔': 'cui', '康': 'kang', '毛': 'mao', '邱': 'qiu', '秦': 'qin', '江': 'jiang', '史': 'shi',
    '顾': 'gu', '侯': 'hou', '邵': 'shao', '孟': 'meng', '龙': 'long', '万': 'wan', '段': 'duan', '漕': 'cao', '钱': 'qian', '汤': 'tang',

    // 常见名字用字
    '一': 'yi', '二': 'er', '三': 'san', '四': 'si', '五': 'wu', '六': 'liu', '七': 'qi', '八': 'ba', '九': 'jiu', '十': 'shi',
    '小': 'xiao', '大': 'da', '中': 'zhong', '新': 'xin', '老': 'lao', '美': 'mei', '好': 'hao', '多': 'duo', '少': 'shao', '长': 'chang',
    '明': 'ming', '亮': 'liang', '强': 'qiang', '军': 'jun', '华': 'hua', '建': 'jian', '文': 'wen', '国': 'guo', '民': 'min', '伟': 'wei',
    '志': 'zhi', '忠': 'zhong', '勇': 'yong', '刚': 'gang', '毅': 'yi', '峰': 'feng', '磊': 'lei', '鹏': 'peng', '涛': 'tao', '浩': 'hao',
    '宇': 'yu', '轩': 'xuan', '博': 'bo', '超': 'chao', '辉': 'hui', '鑫': 'xin', '磊': 'lei', '斌': 'bin', '杰': 'jie', '宏': 'hong',
    '飞': 'fei', '鸿': 'hong', '凯': 'kai', '乐': 'le', '欣': 'xin', '悦': 'yue', '晨': 'chen', '阳': 'yang', '雨': 'yu', '雪': 'xue',
    '春': 'chun', '夏': 'xia', '秋': 'qiu', '冬': 'dong', '梅': 'mei', '兰': 'lan', '竹': 'zhu', '菊': 'ju', '莲': 'lian', '桂': 'gui',

    // 方向和位置
    '开': 'kai', '关': 'guan', '上': 'shang', '下': 'xia', '前': 'qian', '后': 'hou', '左': 'zuo', '右': 'you', '东': 'dong', '西': 'xi',
    '南': 'nan', '北': 'bei', '内': 'nei', '外': 'wai', '高': 'gao', '低': 'di', '快': 'kuai', '慢': 'man', '早': 'zao',
    '晚': 'wan', '今': 'jin', '昨': 'zuo', '年': 'nian', '月': 'yue', '日': 'ri', '时': 'shi', '分': 'fen', '秒': 'miao',

    // 工作相关
    '管': 'guan', '理': 'li', '员': 'yuan', '产': 'chan', '品': 'pin', '经': 'jing', '开': 'kai', '发': 'fa', '测': 'ce', '试': 'shi',
    '设': 'she', '计': 'ji', '运': 'yun', '维': 'wei', '客': 'ke', '户': 'hu', '用': 'yong', '系': 'xi', '统': 'tong', '项': 'xiang',
    '目': 'mu', '任': 'ren', '务': 'wu', '工': 'gong', '作': 'zuo', '完': 'wan', '成': 'cheng', '进': 'jin', '行': 'xing', '待': 'dai',
    '审': 'shen', '核': 'he', '已': 'yi', '取': 'qu', '消': 'xiao', '草': 'cao', '稿': 'gao', '发': 'fa', '布': 'bu', '紧': 'jin',
    '急': 'ji', '重': 'zhong', '要': 'yao', '普': 'pu', '通': 'tong', '延': 'yan', '期': 'qi', '冻': 'dong', '结': 'jie'
};

/**
 * 拼音转换函数（使用 pinyin-pro 库或降级到简化版本）
 * @param {String} text - 中文文本
 * @returns {Object} 包含拼音全拼和首字母的对象
 */
function convertToPinyin(text) {
    if (!text) return { full: '', first: '' };

    // 尝试使用 pinyin-pro 库（检测多种可能的全局变量名）
    let pinyinLib = null;
    if (typeof window.pinyinPro !== 'undefined' && window.pinyinPro.pinyin) {
        pinyinLib = window.pinyinPro;
    } else if (typeof window.pinyin !== 'undefined') {
        pinyinLib = { pinyin: window.pinyin };
    } else if (typeof window.PinyinPro !== 'undefined' && window.PinyinPro.pinyin) {
        pinyinLib = window.PinyinPro;
    }

    if (pinyinLib && pinyinLib.pinyin) {
        try {
            console.log('使用 pinyin-pro 库进行转换:', text);

            // 使用 pinyin-pro 获取拼音全拼
            const pinyinFull = pinyinLib.pinyin(text, {
                toneType: 'none',
                type: 'array'
            }).join('').toLowerCase();

            // 使用 pinyin-pro 获取拼音首字母
            const pinyinFirst = pinyinLib.pinyin(text, {
                pattern: 'first',
                toneType: 'none'
            }).replace(/\s/g, '').toLowerCase();

            console.log('pinyin-pro 转换结果:', { full: pinyinFull, first: pinyinFirst });

            return {
                full: pinyinFull,
                first: pinyinFirst
            };
        } catch (error) {
            console.warn('pinyin-pro 转换失败，使用降级方案:', error);
        }
    } else {
        console.log('pinyin-pro 库未找到，使用降级方案');
    }

    // 降级到简化版本
    const chars = text.split('');
    const pinyinFull = [];
    const pinyinFirst = [];

    chars.forEach(char => {
        if (PINYIN_MAP[char]) {
            pinyinFull.push(PINYIN_MAP[char]);
            pinyinFirst.push(PINYIN_MAP[char][0]);
        } else if (/[\u4e00-\u9fa5]/.test(char)) {
            // 中文字符但不在映射表中，使用字符本身
            pinyinFull.push(char.toLowerCase());
            pinyinFirst.push(char.toLowerCase());
        } else {
            // 非中文字符，保持原样
            pinyinFull.push(char.toLowerCase());
            pinyinFirst.push(char.toLowerCase());
        }
    });

    return {
        full: pinyinFull.join(''),
        first: pinyinFirst.join('')
    };
}

/**
 * 为用户名生成包含拼音信息的显示文本
 * @param {String} name - 用户姓名
 * @returns {String} 包含拼音信息的显示文本
 */
function generatePinyinDisplayText(name) {
    if (!name) return '';

    const pinyin = convertToPinyin(name);

    // 如果拼音转换成功，添加拼音信息
    // 格式：姓名 (拼音全拼 | 拼音首字母)
    if (pinyin.full && pinyin.full !== name.toLowerCase()) {
        return `${name} (${pinyin.full} | ${pinyin.first})`;
    }

    return name;
}

/**
 * 初始化支持拼音搜索的 Select2
 * @param {String|jQuery} selector - 选择器
 * @param {Object} options - Select2 选项
 */
function initPinyinSelect2(selector, options = {}) {
    const defaultOptions = {
        theme: 'bootstrap-5',
        placeholder: '请选择...',
        allowClear: true,
        width: '100%'
    };

    const finalOptions = $.extend(defaultOptions, options);

    $(selector).each(function() {
        const $select = $(this);

        // 如果已经初始化过，先销毁
        if ($select.hasClass('select2-hidden-accessible')) {
            $select.select2('destroy');
        }

        $select.select2(finalOptions);
    });
}

/**
 * 为用户选择器生成包含拼音的选项
 * @param {Array} users - 用户数组
 * @returns {Array} 处理后的选项数组
 */
function generateUserOptionsWithPinyin(users) {
    return users.map(user => {
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || '';
        const displayText = generatePinyinDisplayText(fullName);

        return {
            id: user.id,
            text: displayText,
            originalName: fullName,
            user: user
        };
    });
}

/**
 * 初始化用户选择器（支持拼音搜索）
 * @param {String|jQuery} selector - 选择器
 * @param {Array} users - 用户数组
 * @param {Object} options - Select2 选项
 */
function initUserSelect2WithPinyin(selector, users = [], options = {}) {
    console.log('初始化用户选择器:', selector, users.length, '个用户');

    const $select = $(selector);

    // 如果已经初始化过，先销毁
    if ($select.hasClass('select2-hidden-accessible')) {
        $select.select2('destroy');
    }

    // 清空现有选项
    $select.empty();

    // 添加空选项（如果允许清空）
    if (options.allowClear !== false) {
        $select.append('<option value="">未分配</option>');
    }

    // 添加用户选项（包含拼音信息）
    users.forEach(user => {
        // 去除姓名之间的空格
        const fullName = `${user.firstName || ''}${user.lastName || ''}`.trim() || user.username || '';
        const displayText = generatePinyinDisplayText(fullName);

        // 检查是否已选中
        const isSelected = $select.data('selected-value') === user.id;

        $select.append(`<option value="${user.id}" ${isSelected ? 'selected' : ''}>${displayText}</option>`);
    });

    // 默认选项
    const defaultOptions = {
        theme: 'bootstrap-5',
        placeholder: '请选择用户...',
        allowClear: true,
        width: '100%',
        templateSelection: function(data) {
            // 选中后只显示用户名，不显示拼音
            if (data.id && data.text) {
                const originalName = data.text.split(' (')[0]; // 提取原始姓名
                return originalName.replace(/\s+/g, ''); // 去除所有空格
            }
            return data.text;
        }
    };

    // 合并选项
    const finalOptions = $.extend(defaultOptions, options);

    // 初始化 Select2
    $select.select2(finalOptions);

    // 初始化完成后清除标记（如果有的话）
    setTimeout(() => {
        $select.removeData('is-initializing');
    }, 100);

    console.log('用户选择器初始化完成');
}

/**
 * 获取角色显示文本
 * @param {String} role - 角色代码
 * @returns {String} 显示文本
 */
function getRoleDisplayText(role) {
    const roleMap = {
        'admin': '管理员',
        'product_manager': '产品经理',
        'developer': '开发者',
        'tester': '测试工程师',
        'ui_designer': 'UI设计师',
        'devops': '运维工程师',
        'client': '客户'
    };
    return roleMap[role] || role || '';
}

// 导出到全局
window.Select2Pinyin = {
    init: initPinyinSelect2,
    initUser: initUserSelect2WithPinyin,
    generatePinyinText: generatePinyinDisplayText,
    convertToPinyin: convertToPinyin,
    getRoleText: getRoleDisplayText
};
